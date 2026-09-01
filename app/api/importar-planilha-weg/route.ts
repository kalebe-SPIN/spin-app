import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/importar-planilha-weg
 *
 * Recebe planilha Excel WEG (aba "Composição Preços") e:
 * 1. Faz upload no bucket catalogo-uploads
 * 2. Registra em catalogo_uploads_historico como 'processando'
 * 3. Parseia com xlsx
 * 4. Atualiza tabelas produtos + precos_produtos
 * 5. Atualiza histórico como 'concluido' com stats
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  // Confirma admin
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (perfil?.role !== 'admin') {
    return NextResponse.json({ erro: 'Apenas admin' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient()

  try {
    const formData = await req.formData()
    const file = formData.get('arquivo') as File | null
    if (!file) return NextResponse.json({ erro: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    // 1. Upload no bucket
    const path = `planilhas/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    const { error: upErr } = await supabaseAdmin.storage
      .from('catalogo-uploads')
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (upErr) throw upErr

    // 2. Registra histórico
    const { data: histRow, error: histErr } = await supabaseAdmin
      .from('catalogo_uploads_historico')
      .insert({
        tipo: 'planilha_precos',
        arquivo_nome_original: file.name,
        arquivo_url: path,
        arquivo_tamanho_kb: Math.round(buffer.length / 1024),
        status: 'processando',
        enviado_por: user.id,
      })
      .select()
      .single()
    if (histErr) throw histErr

    const historicoId = histRow!.id

    // 3. Parse Excel — dynamic import (xlsx é pesado)
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const composicao = XLSX.utils.sheet_to_json(workbook.Sheets['Composição Preços'], {
      header: 1,
      defval: '',
    }) as unknown[][]

    // Parser genérico: cada linha tem [nome, tipoTraduzido, itemSAP, unitario, unitarioComFrete, ...]
    // Classifica pela coluna "Tipo" (regex) → uma das categorias do enum categoria_principal.
    // Ignora cabeçalhos (SAP vazio ou não numérico) e linhas sem SAP.
    const produtos: {
      categoria: string
      subcategoria: string
      codigo_weg: string
      modelo: string
      fabricante: string
      descricao_curta: string
      specs: Record<string, unknown>
      preco_unitario: number | null
      preco_com_frete: number | null
      preco_custo_spin: number | null
    }[] = []
    const codigosVistos = new Set<string>()

    for (let i = 0; i < composicao.length; i++) {
      const l = composicao[i]
      if (!l || l.length < 3) continue
      const nome = String(l[0] || '').trim()
      const tipo = String(l[1] || '').trim()
      const sapRaw = String(l[2] || '').trim()
      // SAP WEG tem 7-8 dígitos numéricos — cabeçalho e linhas vazias caem fora
      if (!/^\d{7,8}$/.test(sapRaw)) continue
      if (!nome || !tipo) continue
      if (codigosVistos.has(sapRaw)) continue
      codigosVistos.add(sapRaw)

      const unitario = parseNumPtBr(l[3])
      const unitarioComFrete = parseNumPtBr(l[4])
      // Coluna 5 = "Fator 0,4182" = preço com desconto WEG aplicado = custo real Spin
      const custoComDesconto = parseNumPtBr(l[5])
      const { categoria, subcategoria, fabricante, specs } = classificar(tipo, nome, l)

      // Fallbacks — se planilha veio com célula vazia, tenta extrair do próprio nome/modelo
      const modeloExtraido = extrairModelo(nome, l)
      preencherSpecsFallback(specs, categoria, subcategoria, modeloExtraido, nome)

      produtos.push({
        categoria,
        subcategoria,
        codigo_weg: sapRaw,
        modelo: extrairModelo(nome, l),
        fabricante,
        descricao_curta: nome,
        specs,
        preco_unitario: unitario,        // Preço tabela WEG (bruto)
        preco_com_frete: unitarioComFrete,
        preco_custo_spin: custoComDesconto, // Custo real Spin (WEG × 0,4182)
      })
    }

    // 4. Batch upsert produtos (era 448 round-trips, agora 1 → cabe no timeout do Vercel)
    // Busca códigos que já existem em UMA query
    const codigosNovos = produtos.map(p => p.codigo_weg)
    const { data: existentes } = await supabaseAdmin
      .from('produtos')
      .select('codigo_weg')
      .in('codigo_weg', codigosNovos)
    const existentesSet = new Set((existentes || []).map(e => e.codigo_weg))

    const payloadUpsert = produtos.map(p => ({
      codigo_weg: p.codigo_weg,
      modelo: p.modelo,
      fabricante: p.fabricante,
      categoria: p.categoria,
      subcategoria: p.subcategoria,
      descricao_curta: p.descricao_curta,
      specs: p.specs,
      ativo: true,
      // disponivel_estoque só na criação — respeitamos o valor atual pra existentes
    }))

    // UPSERT único usando codigo_weg como chave (UNIQUE existente na tabela)
    const { error: upsertErr } = await supabaseAdmin
      .from('produtos')
      .upsert(payloadUpsert, { onConflict: 'codigo_weg', ignoreDuplicates: false })
    if (upsertErr) throw upsertErr

    const criados = produtos.filter(p => !existentesSet.has(p.codigo_weg)).length
    const atualizados = produtos.length - criados

    // Busca IDs em uma query pra montar preços
    const { data: prodsComId } = await supabaseAdmin
      .from('produtos')
      .select('id, codigo_weg')
      .in('codigo_weg', codigosNovos)
    const idByCodigo = new Map((prodsComId || []).map(p => [p.codigo_weg, p.id]))
    const hoje = new Date().toISOString().slice(0, 10)

    // Preços — só pros que têm valor. Encerra preços vigentes anteriores em batch.
    const produtosComPreco = produtos.filter(p => p.preco_unitario || p.preco_com_frete)
    const idsComPreco = produtosComPreco
      .map(p => idByCodigo.get(p.codigo_weg))
      .filter((id): id is string => !!id)

    if (idsComPreco.length > 0) {
      await supabaseAdmin
        .from('precos_produtos')
        .update({ vigente_ate: hoje })
        .in('produto_id', idsComPreco)
        .is('vigente_ate', null)

      const novosPrecos = produtosComPreco.map(p => ({
        produto_id: idByCodigo.get(p.codigo_weg)!,
        // preco_venda = preço tabela WEG (o "cheio" que o cliente vê como referência)
        preco_venda: p.preco_com_frete || p.preco_unitario!,
        // preco_custo = preço com desconto WEG 0,4182 (o que a Spin realmente paga)
        preco_custo: p.preco_custo_spin || p.preco_unitario || (p.preco_com_frete || 0.01),
        vigente_de: hoje,
      })).filter(np => np.produto_id)

      const { error: precoErr } = await supabaseAdmin
        .from('precos_produtos')
        .insert(novosPrecos)
      if (precoErr) console.error('[importar-planilha-weg] erro preços (não fatal):', precoErr)
    }

    // 5. Atualiza histórico
    await supabaseAdmin
      .from('catalogo_uploads_historico')
      .update({
        status: 'concluido',
        produtos_atualizados: atualizados,
        produtos_criados: criados,
        processado_em: new Date().toISOString(),
      })
      .eq('id', historicoId)

    return NextResponse.json({
      sucesso: true,
      produtos_atualizados: atualizados,
      produtos_criados: criados,
      total_processados: produtos.length,
    })
  } catch (e: unknown) {
    console.error('[importar-planilha-weg]', e)
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    return NextResponse.json({ erro: msg }, { status: 500 })
  }
}

/**
 * Classifica um item da planilha WEG na categoria do enum categoria_principal
 * pela coluna "Tipo Traduzido" + fallback pelo nome.
 * Ver enum em migration 002_catalogo_weg.sql.
 */
function classificar(
  tipo: string,
  nome: string,
  linha: unknown[],
): { categoria: string; subcategoria: string; fabricante: string; specs: Record<string, unknown> } {
  const t = tipo.toLowerCase()
  const n = nome.toLowerCase()

  // MÓDULO FOTOVOLTAICO — exige indicador claro de placa solar. Antes
  // pegava "Módulo" isolado, o que capturava smart home ("Módulo Dimmer
  // Wi-Fi") e rapid shutdown ("Módulo de Teste RSDW"). Agora exige que
  // a linha bata em "fotovoltaico|monofacial|bifacial|topcon|celula" ou
  // que o próprio Tipo seja "Módulo Fotovoltaico".
  const isPlaca = (
    t.includes('fotovoltaico') || t.includes('monofacial') || t.includes('bifacial') ||
    t.includes('topcon') || t.includes('perc') || t.includes('heterojun') ||
    t.includes('celula') || t.includes('célula') ||
    (t.includes('módulo') && !t.includes('wi-fi') && !t.includes('wifi') &&
     !t.includes('dimmer') && !t.includes('interruptor') && !t.includes('cortina') &&
     !/rsdw|rsd|rapid shutdown/.test(t))
  )
  if (isPlaca) {
    return {
      categoria: 'placa',
      subcategoria: 'modulo_fotovoltaico',
      fabricante: String(linha[8] || 'WEG'),
      specs: {
        potencia_wp: parseNumPtBr(linha[6]),
        area_m2: parseNumPtBr(linha[9]),
        largura_mm: parseNumPtBr(linha[10]),
        tipo_celula: tipo,
      },
    }
  }

  // MICROINVERSOR
  if (t.includes('micro')) {
    return {
      categoria: 'inversor',
      subcategoria: 'microinversor',
      fabricante: 'WEG',
      specs: {
        potencia_kw: parseNumPtBr(linha[6]),
        tensao_desc: tipo,
        disjuntor_equivalente: String(linha[7] || '') || null,
        entradas_mppt: parseNumPtBr(linha[8]),
      },
    }
  }

  // INVERSOR DE BOMBEAMENTO (CFW)
  if (t.includes('bomba') || /^cfw/i.test(nome)) {
    return {
      categoria: 'inversor',
      subcategoria: 'inversor_bombeamento',
      fabricante: 'WEG',
      specs: {
        potencia_kw: parseNumPtBr(linha[6]),
        tensao_desc: tipo,
      },
    }
  }

  // INVERSOR — string / híbrido / off-grid
  // Kalebe 2026-09-01: parser separa por subcategoria pra diagnóstico
  // e gerador de kits filtrarem corretamente.
  //   SIW400H, SIW700H, "híbrido"  → inversor_hibrido
  //   SIW300G off, "off grid"      → inversor_offgrid
  //   Resto (SIW200G/300G/500G)    → inversor_string
  if (t.includes('inversor')) {
    const nomeUp = nome.toUpperCase()
    const tipoUp = tipo.toUpperCase()
    let subcat = 'inversor_string'
    if (/H[\s\d]/.test(nomeUp) && /SIW\d00H/.test(nomeUp) || tipoUp.includes('HÍBRID') || tipoUp.includes('HIBRID')) {
      subcat = 'inversor_hibrido'
    } else if (tipoUp.includes('OFF') || nomeUp.includes('OFF-GRID')) {
      subcat = 'inversor_offgrid'
    }
    return {
      categoria: 'inversor',
      subcategoria: subcat,
      fabricante: 'WEG',
      specs: {
        potencia_kw: parseNumPtBr(linha[6]),
        tensao_desc: tipo,
        disjuntor_equivalente: String(linha[7] || '') || null,
        entradas_mppt: parseNumPtBr(linha[8]),
      },
    }
  }

  // ESTAÇÃO DE RECARGA VE (WEMOB)
  if (t.includes('estação recarga') || t.includes('recarga') || /^wemob/i.test(nome)) {
    return { categoria: 'outro', subcategoria: 've_wallbox', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // MONITORAMENTO
  if (t.includes('monitoramento') || n.includes('dongle') || n.includes('smart dongle')) {
    return { categoria: 'monitoramento', subcategoria: 'gateway', fabricante: 'WEG', specs: {} }
  }

  // CÂMERAS / INTERRUPTORES / TOMADAS / SMART HOME
  if (t.includes('câmera') || t.includes('camera') || t.includes('interruptor') || t.includes('tomada')) {
    return { categoria: 'outro', subcategoria: 'smart_home', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // ESTRUTURAS DE FIXAÇÃO
  if (t.includes('estrutura') || t.includes('componente de estrutura') ||
      /kit p\/ ?\d+ ?módul/i.test(nome) || /^grampo|^suporte|^kit fix/i.test(nome)) {
    return {
      categoria: 'estrutura',
      subcategoria: t.includes('telhado') ? 'telhado' :
                    t.includes('laje') ? 'laje' :
                    t.includes('solo') ? 'solo' : 'acessorio',
      fabricante: 'WEG',
      specs: { descricao: tipo },
    }
  }

  // CONECTORES (MC4, kit conector CA/CC, terminais elétricos)
  if (t.includes('conector') || /^mc4|^mc-4/i.test(nome)) {
    return { categoria: 'conector', subcategoria: 'conector', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // CABOS
  if (t.includes('cabo') || /^cabo/i.test(nome)) {
    const isCC = /cc|solar|fotov/i.test(tipo + ' ' + nome)
    return {
      categoria: isCC ? 'cabo_cc' : 'cabo_ca',
      subcategoria: 'cabo',
      fabricante: 'WEG',
      specs: { descricao: tipo },
    }
  }

  // DISJUNTORES
  if (t.includes('disjuntor') || /^md[wm]p|^mdw|^disj/i.test(nome)) {
    return { categoria: 'disjuntor', subcategoria: 'disjuntor_ca', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // STRING BOX
  if (t.includes('string box') || t.includes('stringbox') || /^sb-/i.test(nome)) {
    return { categoria: 'string_box', subcategoria: 'stringbox_cc', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // FUSÍVEIS / BASE FUSÍVEIS
  if (t.includes('fusível') || t.includes('fusivel') || t.includes('base fusível')) {
    return { categoria: 'outro', subcategoria: 'fusivel', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // DPS
  if (t.includes('dps') || t.includes('protetor') || t.includes('surto')) {
    return { categoria: 'dps', subcategoria: 'dps', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // CAPACITORES / REATÂNCIAS (correção de fator de potência)
  if (t.includes('capacit') || t.includes('reatância') || t.includes('reatancia')) {
    return { categoria: 'outro', subcategoria: 'correcao_fp', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // FRETE / CIF
  if (t.includes('frete') || t.includes('cif') || n.includes('cif ') || n.includes('- frete') || n.includes('retirada')) {
    return { categoria: 'frete', subcategoria: 'frete', fabricante: 'WEG', specs: { descricao: nome } }
  }

  // BATERIA / BESS / NOBREAK
  if (t.includes('bateria') || t.includes('cabine de bateria') || t.includes('nobreak') ||
      /^sbw|^bscw|^bcw/i.test(nome)) {
    return { categoria: 'bateria', subcategoria: t.includes('nobreak') ? 'nobreak' : 'bess', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // QUADRO DE TRANSFERÊNCIA / SMARTGUARD (ATS)
  if (t.includes('quadro de transferência') || t.includes('quadro de transferencia') ||
      /^smartguard|^tbw/i.test(nome)) {
    return { categoria: 'quadro', subcategoria: 'quadro_transferencia', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // CONTROLADOR (EMBOX, EDGE BOX — controle de sistemas híbridos)
  if (t.includes('controlador') || /^embox|^edge box/i.test(nome)) {
    return { categoria: 'monitoramento', subcategoria: 'controlador', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // MULTIMEDIDOR / SMART METER (DTSU666, DDSU666, MMW03)
  if (t.includes('multimedidor') || t.includes('medidor') || t.includes('smart meter') ||
      /^dtsu|^ddsu|^mmw/i.test(nome)) {
    return { categoria: 'smart_meter', subcategoria: 'medidor', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // OTIMIZADOR
  if (t.includes('otimizador')) {
    return { categoria: 'inversor', subcategoria: 'otimizador', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // RSD (Rapid Shutdown — segurança de módulos)
  if (t.includes('rsd') || /^rsdw/i.test(nome)) {
    return { categoria: 'outro', subcategoria: 'rapid_shutdown', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // KIT ACESSÓRIOS
  if (t.includes('kit acessórios') || t.includes('kit acessorios')) {
    return { categoria: 'outro', subcategoria: 'kit_acessorios', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // SMART HOME (Plugue, Controle, Fonte USB, Sensor, Controle Remoto)
  if (t.includes('plugue') || t.includes('controle') || t.includes('sensor') || t.includes('fonte usb') ||
      n.includes('wi-fi')) {
    return { categoria: 'outro', subcategoria: 'smart_home', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // CAIXA DE JUNÇÃO (JBW)
  if (t.includes('caixa de junção') || t.includes('caixa de juncao') || /^jbw/i.test(nome)) {
    return { categoria: 'string_box', subcategoria: 'caixa_juncao', fabricante: 'WEG', specs: { descricao: tipo } }
  }

  // Fallback
  return { categoria: 'outro', subcategoria: 'sem_categoria', fabricante: 'WEG', specs: { descricao: tipo, nome } }
}

/**
 * Extrai o "modelo" — normalmente na coluna 11 pra placas, e no próprio nome
 * pros outros itens (que já vêm em formato de código WEG tipo "SIW300H M060 W00").
 */
function extrairModelo(nome: string, linha: unknown[]): string {
  const c11 = String(linha[11] || '').trim()
  if (c11 && c11.length < 40) return c11
  return nome
}

/**
 * Parse robusto de número em formato brasileiro do Excel.
 * Aceita: number, "1234,56", "1.234,56", "R$ 1.234,56", "2,4 kW",
 * "615 Wp", "48 A". Retorna null se não conseguir extrair um número.
 * O Number() puro falhava em qualquer célula com vírgula/símbolo e
 * deixava specs vazio + preço 0 — era a causa dos cadastros incompletos.
 */
function parseNumPtBr(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v)
    .replace(/\s|R\$|kW|Wp|W|A|kWh|Ω|%|V|Hz|km|m²|kg/gi, '') // sufixos
    .replace(/[^\d,.-]/g, '')                                  // resto
  if (!s) return null
  // Formato brasileiro: pontos são milhar, vírgula é decimal
  // Ex: "1.234,56" → "1234.56"
  const bralike = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s
  const n = Number(bralike)
  return isFinite(n) ? n : null
}

/**
 * Se a planilha veio com célula vazia (Wp/kW), tenta extrair do próprio
 * código do modelo WEG. Padrões conhecidos:
 * - Placas: "615 Wp WEG BIFACIAL" → 615 Wp; "JAM66D45-620/LB" → 620 Wp
 * - Inversor string: "SIW400H T025 W00" → 25 kW (T/K/ST + 3 dígitos)
 * - Microinversor: "SIW100G M024 W10" → 2,4 kW (M{XXX} → XXX/10)
 *
 * Só preenche se o valor atual está null — não sobrescreve dado bom.
 */
function preencherSpecsFallback(
  specs: Record<string, unknown>,
  categoria: string,
  subcategoria: string,
  modelo: string,
  descricao: string,
) {
  const texto = `${modelo} ${descricao}`.toUpperCase()

  // PLACA — extrai Wp de "615 Wp", "JAM66D45-620", "WPV 615 Wp"
  if (categoria === 'placa' && !specs.potencia_wp) {
    // Padrão "615Wp", "615 Wp", "620W"
    const m1 = texto.match(/(\d{3,4})\s?W[P]?\b/)
    // Padrão "JAM66D45-620/LB" ou "CS7L-620"
    const m2 = texto.match(/[-_](\d{3,4})[\/\s]/) || texto.match(/[-_](\d{3,4})\b/)
    const wp = m1?.[1] || m2?.[1]
    if (wp) specs.potencia_wp = Number(wp)
  }

  // INVERSOR STRING — extrai kW do sufixo. Convenção WEG:
  // - T/K/ST + 3 dígitos = kW direto (T025 = 25 kW, K050 = 50 kW, ST030 = 30 kW)
  // - M + 3 dígitos = kW × 10 (M050 = 5 kW, M070 = 7 kW, M100 = 10 kW)
  if (categoria === 'inversor' && subcategoria === 'inversor_string' && !specs.potencia_kw) {
    const m = texto.match(/\b(T|K|ST)(\d{3})\b/)
    if (m) specs.potencia_kw = Number(m[2])
    if (!specs.potencia_kw) {
      const m2 = texto.match(/\bM(\d{3})\b/)
      if (m2) specs.potencia_kw = Number(m2[1]) / 10
    }
  }

  // MICROINVERSOR — mesma convenção M+XXX = kW × 10.
  // Ex: SIW100G M010 = 1,0 kW | M016 = 1,6 kW | M020 = 2,0 kW | M024 = 2,4 kW
  if (categoria === 'inversor' && subcategoria === 'microinversor' && !specs.potencia_kw) {
    const m = texto.match(/\bM(\d{3})\b/)
    if (m) specs.potencia_kw = Number(m[1]) / 10
  }
}
