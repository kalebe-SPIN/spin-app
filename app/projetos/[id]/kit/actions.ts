'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { montarListaComplementarCA, type ItemKit } from '@/lib/kit-auto/montar-kit'
import { precificarLista, calcularSubtotais } from '@/lib/kit-auto/precificar-lista'

export type InversorNoKit = {
  id: string
  codigo_weg: string | null
  modelo: string
  potencia_kw: number
  preco_venda: number
  qtd: number
  fases?: 'monofasico' | 'bifasico' | 'trifasico'
}

export type KitSelecionado = {
  placa: { id: string; codigo_weg: string; modelo: string; potencia_wp: number; preco_venda: number }
  qtd_placas: number
  potencia_cc_kwp: number
  // Compat retro: 1º inversor da lista (ou único, se sistema legado)
  inversor: { id: string; codigo_weg: string; modelo: string; potencia_kw: number; preco_venda: number }
  qtd_inversores: number
  // NOVO: array de inversores no kit (permite mixar string + micro + potências diferentes)
  // Kalebe 2026-08-27: composição de invesores no modo manual do kit ongrid
  inversores?: InversorNoKit[]
  potencia_ca_kw: number
  fci_pct: number
  preco_total_kit_weg?: number
  observacoes?: string | null
  // Kalebe 2026-08-28: modo ampliação = cliente já tem inversor,
  // Spin compra só placas+estrutura+cabo. Não aplica fator WEG 0,4182 —
  // preço vai direto pra precificação Spin (margem+comissão+impostos).
  modo_ampliacao?: boolean
}

/**
 * Salva o kit e AUTO-COMPLETA o resto do fluxo:
 *   1. Grava kit_selecionado
 *   2. Roda montarListaComplementarCA (estrutura, cabos, disjuntores, DPS, quadro,
 *      aterramento etc. seguindo os padrões Spin já estabelecidos)
 *   3. Precifica a lista com preços vigentes do catálogo
 *   4. Grava lista_ca_confirmada
 *   5. Calcula total (placas + inversor + lista CA) e preenche valor_estimado
 *      do projeto_item 'fv_ongrid' — destrava a proposta consolidada.
 *
 * Kalebe pediu 2026-08-22: "que o restante da montagem do kit seja feita
 * pelo sistema com os parâmetros que já estabelecemos na montagem de kits
 * padrão, e os valores sejam usados como padrão na precificação".
 */
export async function salvarKitAction(projetoId: string, kit: KitSelecionado, tipoProjeto?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  // 1. Grava kit
  const patch: any = {
    kit_selecionado: kit,
    status: 'kit_selecionado',
  }
  if (tipoProjeto) patch.tipo_projeto = tipoProjeto

  // Só colunas que existem em projetos. tipo_ligacao e
  // distancia_string_qgbt_m ficam DENTRO do JSONB padrao_entrada; seções
  // de telhado ficam em projetos_telhado_secoes (tabela separada).
  const { data: projetoAtual } = await supabase
    .from('projetos')
    .select('padrao_entrada')
    .eq('id', projetoId)
    .maybeSingle()

  const { data: telhadoSecoesData } = await supabase
    .from('projetos_telhado_secoes')
    .select('tipo_cobertura')
    .eq('projeto_id', projetoId)
    .limit(1)

  const { error: erroKit } = await supabase
    .from('projetos')
    .update(patch)
    .eq('id', projetoId)
  if (erroKit) return { sucesso: false, erro: erroKit.message }

  // 2. Monta lista CA seguindo padrões Spin
  let itensListaComPreco: ItemKit[] = []
  let precoListaCA = 0
  try {
    const padrao = (projetoAtual as any)?.padrao_entrada || {}
    // tipo_ligacao vive dentro de padrao_entrada.tipo_ligacao (JSONB)
    const tipoLigacao = padrao?.tipo_ligacao || 'monofasico'
    // telhado_secoes é tabela separada — usamos a 1ª seção pro tipo de cobertura
    const telhadoSecoes = telhadoSecoesData || []

    const itensBrutos = montarListaComplementarCA(
      {
        id: kit.placa.id,
        potencia_wp: kit.placa.potencia_wp,
      },
      {
        id: kit.inversor.id,
        potencia_kw: kit.inversor.potencia_kw,
        tensao_desc: '',
        modelo: kit.inversor.modelo,
      },
      {
        qtd_placas: kit.qtd_placas,
        // Se o kit tem invesores múltiplos (novo), soma todas as qtds pra o
        // dimensionamento da lista CA (disjuntores individuais, etc).
        qtd_inversores: kit.inversores && kit.inversores.length > 0
          ? kit.inversores.reduce((s, x) => s + (x.qtd || 0), 0)
          : kit.qtd_inversores,
        distancia_string_qgbt_m: padrao?.distancia_string_qgbt_m || 15,
        tipo_telhado: Array.isArray(telhadoSecoes) && telhadoSecoes[0]?.tipo_cobertura,
        potencia_ca_total_kw: kit.potencia_ca_kw,
        tipo_ligacao: tipoLigacao,
      },
    )

    // 3. Precifica pelo catálogo
    itensListaComPreco = await precificarLista(supabase as any, itensBrutos)
    const subtotais = calcularSubtotais(itensListaComPreco)
    precoListaCA = subtotais.totalGeral

    // 4. Grava lista CA no projeto
    await supabase
      .from('projetos')
      .update({ lista_ca_confirmada: itensListaComPreco })
      .eq('id', projetoId)
  } catch (e: any) {
    // Falha na lista CA não deve bloquear salvar o kit — só loga
    console.error('[salvarKitAction] lista CA falhou:', e?.message || e)
  }

  // 5. Preenche valor_estimado do projeto_item fv_ongrid com o total
  //    Total = placas + inversor + complementos CC + lista CA
  // Se veio invesores múltiplos, soma placa + soma(inversores × qtd cada)
  const precoInversoresTotal = kit.inversores && kit.inversores.length > 0
    ? kit.inversores.reduce((s, x) => s + x.preco_venda * x.qtd, 0)
    : kit.inversor.preco_venda * kit.qtd_inversores
  const precoKitPlacaInversor = kit.preco_total_kit_weg
    || (kit.placa.preco_venda * kit.qtd_placas) + precoInversoresTotal

  // Kalebe 2026-08-27: TODOS os itens do kit (cabo, estrutura, MC4,
  // protetor surto, conector) estão cadastrados na planilha WEG com
  // preço TABELA. Somamos aqui pro subtotal BRUTO — o fator 0,4182
  // aplica sobre TUDO (kit WEG completo).
  const complementosCC = await precificarComplementosCC(supabase, {
    qtd_placas: kit.qtd_placas,
    tipo_telhado: (telhadoSecoesData || [])[0]?.tipo_cobertura || null,
    distancia_string_qgbt_m: (projetoAtual as any)?.padrao_entrada?.distancia_string_qgbt_m || 15,
  })
  const precoComplementosCCbruto = complementosCC.total
  const kitWegBrutoTotal = precoKitPlacaInversor + precoComplementosCCbruto

  // Persiste kit WEG bruto total no projeto (com complementos incluídos)
  // pra o /orcamento aplicar o fator 0,4182 sobre TUDO.
  await supabase
    .from('projetos')
    .update({
      lista_complementos_cc: {
        itens: complementosCC.itens,
        total: precoComplementosCCbruto,
        avisos: complementosCC.avisos,
        gerado_em: new Date().toISOString(),
      },
      kit_weg_bruto_total: kitWegBrutoTotal,
    })
    .eq('id', projetoId)

  // valor_estimado do projeto_item = kit WEG bruto (será refinado com fator +
  // margem no /orcamento). Aqui só destrava a proposta consolidada.
  const totalFvOnGrid = kitWegBrutoTotal + precoListaCA

  if (totalFvOnGrid > 0) {
    await supabase
      .from('projeto_itens')
      .update({ valor_estimado: totalFvOnGrid })
      .eq('projeto_id', projetoId)
      .in('tipo', ['fv_ongrid', 'fv_hibrido', 'expansao_ongrid', 'expansao_hibrido'])
      .neq('status', 'removido')
  }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}

// ═══════════════════════════════════════════════════════════════════════
// Complementos CC (cabo solar, estrutura, MC4) — puxa do /admin/catalogo
// ═══════════════════════════════════════════════════════════════════════

type EntradaComplementosCC = {
  qtd_placas: number
  tipo_telhado: string | null
  distancia_string_qgbt_m: number
}

type ItemComplementoCC = {
  categoria: 'cabo_cc' | 'estrutura' | 'conector'
  modelo: string
  qtd: number
  unidade: string
  preco_unitario: number
  subtotal: number
}

/**
 * Puxa cabo solar, estrutura de fixação e MC4 do CATÁLOGO WEG (produtos)
 * com preço tabela vigente. Kalebe 2026-08-28: 'todos os itens estão na
 * tabela cadastrada no catálogo WEG'. O subtotal desses complementos vai
 * pro kit WEG BRUTO — leva o fator 0,4182 junto com placa+inversor.
 *
 * Regras de qtd (Spin):
 * - Cabo solar 6mm²: 2 × (distancia_qgbt_m + 30m folga por string)
 * - Estrutura: 1 kit pra cada 4 placas (tipo escolhido pelo telhado)
 * - MC4: 2 pares por STRING (≈ 1 string cada 12 placas)
 */
async function precificarComplementosCC(
  supabase: any,
  entrada: EntradaComplementosCC,
): Promise<{ total: number; itens: ItemComplementoCC[]; avisos: string[] }> {
  const avisos: string[] = []
  const itens: ItemComplementoCC[] = []
  const hojeIso = new Date().toISOString().slice(0, 10)

  async function buscarProdutoComPreco(
    filtro: { categorias: string[]; contem?: string[] },
  ): Promise<{ id: string; modelo: string; preco: number } | null> {
    const { data: prods } = await supabase
      .from('produtos')
      .select('id, modelo, subcategoria, categoria')
      .in('categoria', filtro.categorias)
      .eq('ativo', true)
      .limit(200)
    const candidatos = (prods || []).filter((p: any) => {
      const alvo = `${p.modelo || ''} ${p.subcategoria || ''}`.toLowerCase()
      return !filtro.contem || filtro.contem.every((k) => alvo.includes(k.toLowerCase()))
    })
    if (candidatos.length === 0) return null
    const escolhido = candidatos[0]
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', escolhido.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco <= 0) return null
    return { id: escolhido.id, modelo: escolhido.modelo, preco }
  }

  // 1. Cabo solar 6mm² — metragem = 2 × (distância + 30m folga)
  const metrosCabo = Math.ceil(2 * (entrada.distancia_string_qgbt_m + 30))
  const cabo = await buscarProdutoComPreco({
    categorias: ['cabo_cc', 'cabo'],
    contem: ['6mm'],
  })
  if (cabo) {
    itens.push({
      categoria: 'cabo_cc', modelo: cabo.modelo,
      qtd: metrosCabo, unidade: 'm', preco_unitario: cabo.preco,
      subtotal: metrosCabo * cabo.preco,
    })
  } else {
    avisos.push(`Cabo solar 6mm² não achado no /admin/catalogo. ${metrosCabo}m estimados NÃO entraram no preço do kit.`)
  }

  // 2. Estrutura — 1 kit pra cada 4 placas, tipo pelo telhado
  const qtdKitsEstrutura = Math.ceil(entrada.qtd_placas / 4)
  const tipo = String(entrada.tipo_telhado || '').toLowerCase()
  let contemEstrut: string[] = []
  if (/fibro/.test(tipo)) contemEstrut = ['fibro']
  else if (/metal|zinco|alumin/.test(tipo)) contemEstrut = ['metal']
  else if (/ceram|barro|colonial/.test(tipo)) contemEstrut = ['ceram']
  else if (/laje|concreto/.test(tipo)) contemEstrut = ['laje']
  const estrutura = await buscarProdutoComPreco({
    categorias: ['estrutura'],
    contem: contemEstrut,
  })
  if (estrutura) {
    itens.push({
      categoria: 'estrutura', modelo: estrutura.modelo,
      qtd: qtdKitsEstrutura, unidade: 'kit', preco_unitario: estrutura.preco,
      subtotal: qtdKitsEstrutura * estrutura.preco,
    })
  } else {
    avisos.push(`Estrutura ${contemEstrut[0] || 'genérica'} não achada no /admin/catalogo. ${qtdKitsEstrutura} kit(s) NÃO entraram no preço.`)
  }

  // 3. MC4 — 2 pares por string (1 string ≈ 12 placas)
  const qtdMc4 = 2 * Math.ceil(entrada.qtd_placas / 12)
  const mc4 = await buscarProdutoComPreco({
    categorias: ['conector'],
    contem: ['mc4'],
  })
  if (mc4) {
    itens.push({
      categoria: 'conector', modelo: mc4.modelo,
      qtd: qtdMc4, unidade: 'par', preco_unitario: mc4.preco,
      subtotal: qtdMc4 * mc4.preco,
    })
  } else {
    avisos.push(`Conector MC4 não achado no /admin/catalogo. ${qtdMc4} par(es) NÃO entraram no preço.`)
  }

  const total = itens.reduce((s, x) => s + x.subtotal, 0)
  return { total, itens, avisos }
}
