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
export type SalvarKitOpts = {
  /** Quando presente + projeto em modo_composicao=por_uc, salva o kit
   *  DENTRO de kits_por_uc[uc_ref] em vez do kit_selecionado global.
   *  'principal' = UC da fatura principal; senão = beneficiarias[i].uc. */
  uc_ref?: string
  /** UC tem endereço próprio (diferente do principal)? */
  endereco_proprio?: boolean
  /** Se endereco_proprio=true, o padrão CELESC dessa UC. */
  padrao_entrada_proprio?: any
  /** Se endereco_proprio=true, seções de telhado dessa UC. */
  telhado_secoes_proprio?: any[]
  /** Etiqueta descritiva do endereço da UC (usada só pro rótulo). */
  endereco_label?: string
}

export async function salvarKitAction(
  projetoId: string,
  kit: KitSelecionado,
  tipoProjeto?: string,
  opts?: SalvarKitOpts,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const ucRef = opts?.uc_ref
  const modoPorUc = !!ucRef

  // 1. Grava kit — global (kit_selecionado) OU dentro de kits_por_uc[uc_ref]
  const patch: any = { status: 'kit_selecionado' }
  if (tipoProjeto) patch.tipo_projeto = tipoProjeto

  if (modoPorUc) {
    // Lê array atual, faz upsert do item da UC
    const { data: projetoRow } = await supabase
      .from('projetos').select('kits_por_uc, modo_composicao').eq('id', projetoId).maybeSingle()
    const arr: any[] = Array.isArray((projetoRow as any)?.kits_por_uc) ? (projetoRow as any).kits_por_uc : []
    const idx = arr.findIndex(x => x?.uc_ref === ucRef)
    const novoItem: any = {
      uc_ref: ucRef,
      endereco_label: opts?.endereco_label || null,
      endereco_proprio: !!opts?.endereco_proprio,
      padrao_entrada_proprio: opts?.endereco_proprio ? (opts?.padrao_entrada_proprio || null) : null,
      telhado_secoes_proprio: opts?.endereco_proprio ? (opts?.telhado_secoes_proprio || []) : [],
      kit_selecionado: kit,
      // lista_ca_confirmada / lista_complementos_cc / kit_weg_bruto_total preenchidos abaixo
    }
    if (idx >= 0) arr[idx] = { ...arr[idx], ...novoItem }
    else arr.push(novoItem)
    patch.kits_por_uc = arr
    // Se ainda estava centralizado, promove
    if ((projetoRow as any)?.modo_composicao !== 'por_uc') patch.modo_composicao = 'por_uc'
  } else {
    patch.kit_selecionado = kit
  }

  // Só colunas que existem em projetos. tipo_ligacao e
  // distancia_string_qgbt_m ficam DENTRO do JSONB padrao_entrada; seções
  // de telhado ficam em projetos_telhado_secoes (tabela separada).
  //
  // Quando a UC tem endereço próprio (kit por UC), usa o padrão/telhado
  // dessa UC em vez do principal — assim disjuntor/DPS/estrutura saem
  // dimensionados corretamente.
  const { data: projetoAtual } = await supabase
    .from('projetos')
    .select('padrao_entrada')
    .eq('id', projetoId)
    .maybeSingle()

  const padraoEfetivo = (opts?.endereco_proprio && opts?.padrao_entrada_proprio)
    ? opts.padrao_entrada_proprio
    : ((projetoAtual as any)?.padrao_entrada || {})

  let telhadoSecoesData: any[] | null = null
  if (opts?.endereco_proprio && Array.isArray(opts?.telhado_secoes_proprio)) {
    telhadoSecoesData = opts.telhado_secoes_proprio
  } else {
    const { data } = await supabase
      .from('projetos_telhado_secoes')
      .select('tipo_cobertura')
      .eq('projeto_id', projetoId)
      .limit(1)
    telhadoSecoesData = data || []
  }

  const { error: erroKit } = await supabase
    .from('projetos')
    .update(patch)
    .eq('id', projetoId)
  if (erroKit) return { sucesso: false, erro: erroKit.message }

  // 2. Monta lista CA seguindo padrões Spin
  let itensListaComPreco: ItemKit[] = []
  let precoListaCA = 0
  try {
    // padraoEfetivo respeita endereço próprio da UC quando aplicável
    const padrao = padraoEfetivo
    const tipoLigacao = padrao?.tipo_ligacao || 'monofasico'
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

    // 4. Grava lista CA — modoPorUc adia (grava tudo junto no bloco final);
    //    modo centralizado grava direto no projeto.
    if (!modoPorUc) {
      await supabase
        .from('projetos')
        .update({ lista_ca_confirmada: itensListaComPreco })
        .eq('id', projetoId)
    }
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
  // protetor surto, conector, disjuntor CA + DPS CA) estão cadastrados na
  // planilha WEG com preço TABELA. Somamos aqui pro subtotal BRUTO — o
  // fator 0,4182 aplica sobre TUDO (kit WEG completo).
  // Kalebe 2026-08-29: disjuntor CA + DPS CA agora dimensionados por
  // inversor + tipo de ligação e puxados do catálogo. TODO kit tem essas
  // proteções — inclusive ampliação, onde a Spin precisa reforçar o QGBT
  // do cliente pra a nova potência. Se for ampliação, sintetiza um
  // inversor virtual com a potência CC final e a ligação do cliente.
  const ligacaoCliente = padraoEfetivo?.tipo_ligacao || 'monofasico'
  const inversoresParaProtecao = kit.inversores && kit.inversores.length > 0
    ? kit.inversores.map(x => ({
        id: x.id, modelo: x.modelo, potencia_kw: x.potencia_kw, fases: x.fases, qtd: x.qtd,
      }))
    : kit.modo_ampliacao
      ? [{
          id: undefined,
          modelo: `Ampliação ${kit.potencia_cc_kwp.toFixed(2)}kWp`,
          potencia_kw: kit.potencia_cc_kwp,
          fases: ligacaoCliente as FaseInvKit,
          qtd: 1,
        }]
      : [{
          id: kit.inversor.id,
          modelo: kit.inversor.modelo, potencia_kw: kit.inversor.potencia_kw,
          fases: undefined, qtd: kit.qtd_inversores,
        }]
  const complementosCC = await precificarComplementosCC(supabase, {
    qtd_placas: kit.qtd_placas,
    tipo_telhado: (telhadoSecoesData || [])[0]?.tipo_cobertura || null,
    distancia_string_qgbt_m: padraoEfetivo?.distancia_string_qgbt_m || 15,
    inversores: inversoresParaProtecao,
    tipo_ligacao_cliente: ligacaoCliente,
  })
  const precoComplementosCCbruto = complementosCC.total
  const kitWegBrutoTotal = precoKitPlacaInversor + precoComplementosCCbruto
  const listaComplementosCcObj = {
    itens: complementosCC.itens,
    total: precoComplementosCCbruto,
    avisos: complementosCC.avisos,
    gerado_em: new Date().toISOString(),
  }

  if (modoPorUc) {
    // Merge dos derivados no item da UC dentro de kits_por_uc.
    // Releitura pra pegar o array com o item já upserted acima.
    const { data: projRow } = await supabase
      .from('projetos').select('kits_por_uc').eq('id', projetoId).maybeSingle()
    const arr: any[] = Array.isArray((projRow as any)?.kits_por_uc) ? (projRow as any).kits_por_uc : []
    const idx = arr.findIndex(x => x?.uc_ref === ucRef)
    if (idx >= 0) {
      arr[idx] = {
        ...arr[idx],
        lista_ca_confirmada: itensListaComPreco,
        lista_complementos_cc: listaComplementosCcObj,
        kit_weg_bruto_total: kitWegBrutoTotal,
      }
      await supabase.from('projetos').update({ kits_por_uc: arr }).eq('id', projetoId)
    }
  } else {
    // Persiste kit WEG bruto total no projeto (com complementos incluídos)
    // pra o /orcamento aplicar o fator 0,4182 sobre TUDO.
    await supabase
      .from('projetos')
      .update({
        lista_complementos_cc: listaComplementosCcObj,
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
  }

  revalidatePath(`/projetos/${projetoId}`)
  if (modoPorUc) {
    // Fica no /kit pra escolher próxima UC
    revalidatePath(`/projetos/${projetoId}/kit`)
    return { sucesso: true }
  }
  redirect(`/projetos/${projetoId}`)
}

// ─── Nova action: atualiza modo_composicao (centralizado ↔ por_uc) ────
export async function atualizarModoComposicaoAction(
  projetoId: string,
  modo: 'centralizado' | 'por_uc',
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }
  const { error } = await supabase
    .from('projetos')
    .update({ modo_composicao: modo })
    .eq('id', projetoId)
  if (error) return { sucesso: false, erro: error.message }
  revalidatePath(`/projetos/${projetoId}/kit`)
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

// ═══════════════════════════════════════════════════════════════════════
// Complementos WEG (cabo solar, estrutura, MC4, disjuntor CA, DPS CA)
// puxa do /admin/catalogo — TODOS levam fator 0,4182 no /orcamento.
// ═══════════════════════════════════════════════════════════════════════

type FaseInvKit = 'monofasico' | 'bifasico' | 'trifasico' | undefined

type EntradaComplementosCC = {
  qtd_placas: number
  tipo_telhado: string | null
  distancia_string_qgbt_m: number
  /** Inversores do kit — dimensiona disjuntor CA por modelo. Vazio em
   *  modo ampliação (cliente já tem QGBT com proteção pro inversor).
   *  Se `id` presente, o server lê specs.disjuntor_equivalente do
   *  cadastro pra usar a referência do projetista antes de recorrer
   *  ao cálculo por corrente. */
  inversores: Array<{
    id?: string
    modelo: string
    potencia_kw: number
    fases?: FaseInvKit
    qtd: number
  }>
  /** Tipo de ligação do padrão CELESC — dimensiona DPS CA e fallback
   *  quando o inversor não trouxer fases. */
  tipo_ligacao_cliente: string
}

type ItemComplementoCC = {
  categoria: 'cabo_cc' | 'estrutura' | 'conector' | 'disjuntor' | 'dps'
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

  type BuscaResult =
    | { ok: true; id: string; modelo: string; preco: number }
    | { ok: false; motivo: string }

  async function buscarProdutoComPreco(
    filtro: {
      categorias: string[]
      contem?: string[]
      /** Se true, entre TODOS os candidatos da categoria (após aplicar
       *  filtro contem), escolhe o de MAIOR preço vigente. Usado pra
       *  estrutura: a planilha WEG tem vários kits do mesmo tipo pra
       *  diferentes velocidades de vento — a Spin cota pelo mais caro
       *  pra não subprecificar. Kalebe 2026-08-29. */
      pegarMaiorPreco?: boolean
    },
  ): Promise<BuscaResult> {
    // Passo 1: busca produtos ATIVOS na categoria
    const { data: ativos } = await supabase
      .from('produtos')
      .select('id, modelo, subcategoria, categoria')
      .in('categoria', filtro.categorias)
      .eq('ativo', true)
      .limit(500)
    const listaAtivos = (ativos || []) as any[]

    // Se zero ativos, tenta inativos pra diagnosticar melhor
    let usandoInativos = false
    let lista = listaAtivos
    if (listaAtivos.length === 0) {
      const { data: inativos } = await supabase
        .from('produtos')
        .select('id, modelo, subcategoria, categoria')
        .in('categoria', filtro.categorias)
        .eq('ativo', false)
        .limit(500)
      const listaInativos = (inativos || []) as any[]
      if (listaInativos.length === 0) {
        return { ok: false, motivo: `nenhum produto cadastrado em categoria ${filtro.categorias.join('/')}` }
      }
      lista = listaInativos
      usandoInativos = true
    }

    // Passo 2: aplica filtro `contem` (preferido) com fallback
    const preferidos = lista.filter((p: any) => {
      const alvo = `${p.modelo || ''} ${p.subcategoria || ''}`.toLowerCase()
      return !filtro.contem || filtro.contem.every((k) => alvo.includes(k.toLowerCase()))
    })
    const candidatos = preferidos.length > 0 ? preferidos : lista

    // Passo 3: busca preço vigente pra cada candidato. Estratégia depende
    // de pegarMaiorPreco:
    //   - false (default): retorna o 1º candidato com preço > 0
    //   - true (estrutura): coleta TODOS com preço vigente e retorna o mais caro
    const cotacoes: Array<{ id: string; modelo: string; preco: number }> = []
    for (const escolhido of candidatos) {
      const { data: precos } = await supabase
        .from('precos_produtos')
        .select('preco_venda, vigente_de, vigente_ate')
        .eq('produto_id', escolhido.id)
        .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
        .order('vigente_de', { ascending: false })
        .limit(1)
      const preco = Number((precos || [])[0]?.preco_venda) || 0
      if (preco > 0) {
        const modelo = usandoInativos ? `${escolhido.modelo} (inativo)` : escolhido.modelo
        if (!filtro.pegarMaiorPreco) {
          return { ok: true, id: escolhido.id, modelo, preco }
        }
        cotacoes.push({ id: escolhido.id, modelo, preco })
      }
    }
    if (cotacoes.length > 0) {
      // Pega o de maior preço vigente entre os candidatos (Spin: margem
      // de segurança na estrutura, cotamos pelo pior caso).
      const escolhida = cotacoes.reduce((a, b) => (a.preco >= b.preco ? a : b))
      return { ok: true, ...escolhida }
    }

    // Passo 4: fallback pra QUALQUER preço (mesmo vencido) — mesma
    // estratégia do passo 3 (1º ou maior)
    const cotacoesVencidas: Array<{ id: string; modelo: string; preco: number }> = []
    for (const escolhido of candidatos) {
      const { data: precos } = await supabase
        .from('precos_produtos')
        .select('preco_venda, vigente_de, vigente_ate')
        .eq('produto_id', escolhido.id)
        .order('vigente_de', { ascending: false })
        .limit(1)
      const preco = Number((precos || [])[0]?.preco_venda) || 0
      if (preco > 0) {
        const suffixInat = usandoInativos ? ' (inativo)' : ''
        const modelo = `${escolhido.modelo}${suffixInat} · ⚠ preço vencido`
        if (!filtro.pegarMaiorPreco) {
          return { ok: true, id: escolhido.id, modelo, preco }
        }
        cotacoesVencidas.push({ id: escolhido.id, modelo, preco })
      }
    }
    if (cotacoesVencidas.length > 0) {
      const escolhida = cotacoesVencidas.reduce((a, b) => (a.preco >= b.preco ? a : b))
      return { ok: true, ...escolhida }
    }

    // Passo 5: sem preço em nenhum candidato
    const detalhes = `${candidatos.length} produto(s) encontrado(s) mas SEM preço em precos_produtos`
    if (usandoInativos) return { ok: false, motivo: `só produtos INATIVOS na categoria + ${detalhes}` }
    return { ok: false, motivo: detalhes }
  }

  // Pré-cálculo comum: busca specs dos inversores pra pegar entradas_mppt
  // e detectar se todos são microinversores. Kalebe 2026-08-29:
  //   - Cabo: 25m fixo se micro; senão distancia × totalMPPT (default 20m)
  //   - MC4: pares = número TOTAL de entradas MPPT dos inversores
  //   - Estrutura: qtd = módulos ÷ N (N do modelo escolhido, default 4)
  const idsInversores = entrada.inversores.map(i => i.id).filter(Boolean) as string[]
  const specsInversores: Record<string, any> = {}
  if (idsInversores.length > 0) {
    const { data: prodsInv } = await supabase
      .from('produtos').select('id, specs').in('id', idsInversores)
    for (const p of (prodsInv || [])) specsInversores[p.id] = p.specs || {}
  }

  let totalEntradasMppt = 0
  for (const inv of entrada.inversores) {
    const mpptSpec = inv.id ? Number(specsInversores[inv.id]?.entradas_mppt) : NaN
    const mppt = Number.isFinite(mpptSpec) && mpptSpec > 0 ? mpptSpec : 1
    totalEntradasMppt += mppt * (inv.qtd || 0)
  }
  const ehMicroinversor = entrada.inversores.length > 0
    && entrada.inversores.every(x => /^SIW100/i.test(x.modelo || ''))

  // 1. Cabo solar 6mm² —
  //    Micro: 25m fixo (Spin)
  //    String: distancia_string_qgbt × totalMPPT (default 20m/entrada quando distância não cadastrada)
  const distEfetiva = entrada.distancia_string_qgbt_m > 0 ? entrada.distancia_string_qgbt_m : 20
  const metrosCabo = ehMicroinversor
    ? 25
    : Math.ceil(distEfetiva * Math.max(1, totalEntradasMppt))
  const memoriaCabo = ehMicroinversor
    ? '25m fixo (microinversor)'
    : `${distEfetiva}m × ${Math.max(1, totalEntradasMppt)} entradas MPPT`
  const cabo = await buscarProdutoComPreco({
    categorias: ['cabo_cc', 'cabo'],
    contem: ['6mm'],
  })
  if (cabo.ok) {
    itens.push({
      categoria: 'cabo_cc', modelo: `${cabo.modelo} · ${memoriaCabo}`,
      qtd: metrosCabo, unidade: 'm', preco_unitario: cabo.preco,
      subtotal: metrosCabo * cabo.preco,
    })
  } else {
    avisos.push(`Cabo solar 6mm² (${metrosCabo}m · ${memoriaCabo}) — ${cabo.motivo}`)
  }

  // 2. Estrutura — 1 kit pra cada N módulos (N vem do modelo escolhido)
  const tipo = String(entrada.tipo_telhado || '').toLowerCase()
  let contemEstrut: string[] = []
  if (/fibro/.test(tipo)) contemEstrut = ['fibro']
  else if (/metal|zinco|alumin/.test(tipo)) contemEstrut = ['metal']
  else if (/ceram|barro|colonial/.test(tipo)) contemEstrut = ['ceram']
  else if (/laje|concreto/.test(tipo)) contemEstrut = ['laje']
  const estrutura = await buscarProdutoComPreco({
    categorias: ['estrutura'],
    contem: contemEstrut,
    // Kalebe 2026-08-29: quando tem múltiplos kits do mesmo tipo (ex:
    // Fibromadeira p/ 4 módulos em várias velocidades de vento), cota
    // pelo MAIOR preço — margem de segurança.
    pegarMaiorPreco: true,
  })
  // Extrai N do modelo escolhido — 'Fibromadeira kit p/ 4 módulos' -> 4
  const matchModulos = estrutura.ok ? String(estrutura.modelo).match(/p\/\s*(\d+)\s*m[oó]dulos?/i) : null
  const modulosPorKit = matchModulos ? Number(matchModulos[1]) : 4
  const qtdKitsEstrutura = Math.ceil(entrada.qtd_placas / modulosPorKit)
  if (estrutura.ok) {
    itens.push({
      categoria: 'estrutura', modelo: `${estrutura.modelo} · ${entrada.qtd_placas} módulos ÷ ${modulosPorKit}`,
      qtd: qtdKitsEstrutura, unidade: 'kit', preco_unitario: estrutura.preco,
      subtotal: qtdKitsEstrutura * estrutura.preco,
    })
  } else {
    avisos.push(`Estrutura ${contemEstrut[0] || 'genérica'} (${qtdKitsEstrutura} kit) — ${estrutura.motivo}`)
  }

  // 3. MC4 — 1 par por entrada MPPT total dos inversores (Kalebe 2026-08-29)
  const qtdMc4 = Math.max(1, totalEntradasMppt)
  const memoriaMc4 = `${qtdMc4} par(es) = ${totalEntradasMppt} entradas MPPT`
  const mc4 = await buscarProdutoComPreco({
    categorias: ['conector'],
    contem: ['mc4'],
  })
  if (mc4.ok) {
    itens.push({
      categoria: 'conector', modelo: `${mc4.modelo} · ${memoriaMc4}`,
      qtd: qtdMc4, unidade: 'par', preco_unitario: mc4.preco,
      subtotal: qtdMc4 * mc4.preco,
    })
  } else {
    avisos.push(`Conector MC4 (${qtdMc4} par · ${memoriaMc4}) — ${mc4.motivo}`)
  }

  // 4. Disjuntor CA — 1 disjuntor POR MODELO de inversor (agrupa qtd).
  //    Kalebe 2026-08-29: PRIMEIRO tenta usar a referência que o
  //    projetista cadastrou em specs.disjuntor_equivalente do inversor
  //    (foi definida em função da potência dele). Só cai no cálculo por
  //    corrente se o campo estiver vazio.
  //    Ampliação passa 1 inversor virtual sem id.

  // Specs dos inversores já lidas acima (specsInversores) — reutiliza
  const specsPorId = specsInversores

  type GrupoDisj = {
    ref?: string          // 'MDWP-C50-2' — modelo cadastrado pelo projetista
    in_a: number
    polos: number
    qtd: number
    modeloInv: string
  }
  const grupos = new Map<string, GrupoDisj>()
  for (const inv of entrada.inversores) {
    const fases: FaseInvKit = inv.fases || inferirFasesDoModelo(inv.modelo) || (entrada.tipo_ligacao_cliente as FaseInvKit)
    const { in_a, polos } = calcularInDisjuntor(inv.potencia_kw, fases || 'monofasico')
    const refProjetista = inv.id ? String(specsPorId[inv.id]?.disjuntor_equivalente || '').trim() : ''
    const chave = refProjetista ? `ref:${refProjetista.toLowerCase()}` : `calc:${in_a}A-${polos}P`
    const existente = grupos.get(chave)
    if (existente) {
      existente.qtd += inv.qtd
    } else {
      grupos.set(chave, {
        ref: refProjetista || undefined,
        in_a, polos, qtd: inv.qtd, modeloInv: inv.modelo,
      })
    }
  }
  for (const [, g] of grupos) {
    let disj: { ok: true; modelo: string; preco: number } | { ok: false; motivo: string } | null = null

    // Tenta primeiro a referência do projetista
    if (g.ref) {
      const porRef = await buscarProdutoPorRef(supabase, g.ref, hojeIso)
      if (porRef.ok) {
        disj = { ...porRef, modelo: `${porRef.modelo} · ref. projetista` }
      }
    }
    // Se não achou (ou não tem ref), cai no dimensionamento por corrente
    if (!disj || !disj.ok) {
      disj = await buscarDisjuntorCompativel(supabase, g.in_a, g.polos, hojeIso)
    }

    if (disj.ok) {
      itens.push({
        categoria: 'disjuntor', modelo: disj.modelo,
        qtd: g.qtd, unidade: 'un', preco_unitario: disj.preco,
        subtotal: g.qtd * disj.preco,
      })
    } else {
      const rotulo = g.ref ? `Disjuntor ${g.ref} (ref. projetista)` : `Disjuntor ${g.in_a}A ${g.polos}P`
      avisos.push(`${rotulo} (${g.modeloInv}, ${g.qtd} un) — ${disj.motivo}`)
    }
  }

  // 5. DPS CA — 1 por fase + 1 no neutro, classe II 20kA.
  //    Kalebe 2026-08-29: se o projetista salvou specs.dps_equivalente
  //    no inversor (referência baseada na potência dele), usa esse.
  //    Senão dimensiona pelo tipo de ligação do QGBT do cliente.
  if (entrada.inversores.length > 0) {
    const numFasesQgbt = fasesDoTipoLigacao(entrada.tipo_ligacao_cliente)
    const qtdDps = numFasesQgbt + 1

    // Coleta refs de DPS únicas dos inversores (normalmente 1)
    const refsDps = Array.from(new Set(
      entrada.inversores
        .map(i => i.id ? String(specsPorId[i.id]?.dps_equivalente || '').trim() : '')
        .filter(Boolean),
    ))

    let dps: { ok: true; modelo: string; preco: number } | { ok: false; motivo: string } | null = null
    if (refsDps.length > 0) {
      for (const ref of refsDps) {
        const porRef = await buscarProdutoPorRef(supabase, ref, hojeIso)
        if (porRef.ok) {
          dps = { ...porRef, modelo: `${porRef.modelo} · ref. projetista` }
          break
        }
      }
    }
    if (!dps || !dps.ok) {
      // Fallback: qualquer DPS ativo, cota pelo maior preço
      dps = await buscarProdutoComPreco({
        categorias: ['dps', 'protecao'],
        pegarMaiorPreco: true,
      })
    }

    if (dps.ok) {
      itens.push({
        categoria: 'dps', modelo: dps.modelo,
        qtd: qtdDps, unidade: 'un', preco_unitario: dps.preco,
        subtotal: qtdDps * dps.preco,
      })
    } else {
      avisos.push(`DPS CA (${qtdDps} un) — ${dps.motivo}`)
    }
  }

  const total = itens.reduce((s, x) => s + x.subtotal, 0)
  return { total, itens, avisos }
}

// ─── Busca produto no catálogo pela referência do projetista ───────────
// Dado 'MDWP-C50-2' (modelo/código que o projetista salvou na spec),
// procura no catálogo por modelo OU codigo_weg que contenha esse texto
// (case-insensitive). Devolve preço vigente > vencido; ativo > inativo.

async function buscarProdutoPorRef(
  supabase: any,
  ref: string,
  hojeIso: string,
): Promise<{ ok: true; modelo: string; preco: number } | { ok: false; motivo: string }> {
  const termo = ref.trim()
  if (!termo) return { ok: false, motivo: 'referência vazia' }

  // Busca por modelo ou codigo_weg contendo o termo (ilike). Ativos primeiro.
  const { data: prods } = await supabase
    .from('produtos')
    .select('id, modelo, codigo_weg, ativo')
    .or(`modelo.ilike.%${termo}%,codigo_weg.ilike.%${termo}%`)
    .order('ativo', { ascending: false })
    .limit(20)
  const lista = (prods || []) as any[]
  if (lista.length === 0) return { ok: false, motivo: `referência '${termo}' não achada no /admin/catalogo` }

  for (const p of lista) {
    const suf = p.ativo === false ? ' (inativo)' : ''
    const { data: precosV } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', p.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precosV || [])[0]?.preco_venda) || 0
    if (preco > 0) return { ok: true, modelo: `${p.modelo}${suf}`, preco }
  }
  // Fallback: qualquer preço, mesmo vencido
  for (const p of lista) {
    const suf = p.ativo === false ? ' (inativo)' : ''
    const { data: precosV } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', p.id)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precosV || [])[0]?.preco_venda) || 0
    if (preco > 0) return { ok: true, modelo: `${p.modelo}${suf} · ⚠ preço vencido`, preco }
  }
  return { ok: false, motivo: `referência '${termo}' achada (${lista.length}) mas sem preço em precos_produtos` }
}

// ─── Helpers de dimensionamento ─────────────────────────────────────────

function fasesDoTipoLigacao(t: string): number {
  const s = String(t || '').toLowerCase()
  if (/tri/.test(s)) return 3
  if (/bi/.test(s)) return 2
  return 1
}

function inferirFasesDoModelo(modelo: string): FaseInvKit {
  const m = String(modelo || '').toUpperCase()
  if (/^SIW100/.test(m)) return 'monofasico'      // microinversor
  if (/^SIW[45]0\d/.test(m)) return 'trifasico'
  if (/^SIW[123]0\d/.test(m)) return 'monofasico'
  return undefined
}

function calcularInDisjuntor(potenciaKw: number, fases: 'monofasico' | 'bifasico' | 'trifasico'): { in_a: number; polos: number } {
  const tensao = fases === 'trifasico' ? 380 : 220
  const factor = fases === 'trifasico' ? Math.sqrt(3) : 1
  const correnteNominal = (potenciaKw * 1000) / (tensao * factor)
  const correnteProjeto = correnteNominal * 1.15
  const escala = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125]
  const in_a = escala.find(x => x >= correnteProjeto) || 125
  const polos = fases === 'monofasico' ? 1 : fases === 'bifasico' ? 2 : 3
  return { in_a, polos }
}

async function buscarDisjuntorCompativel(
  supabase: any,
  inMinA: number,
  polos: number,
  hojeIso: string,
): Promise<{ ok: true; modelo: string; preco: number } | { ok: false; motivo: string }> {
  const { data: ativos } = await supabase
    .from('produtos')
    .select('id, modelo, specs')
    .eq('categoria', 'disjuntor')
    .eq('ativo', true)
    .limit(500)
  let prods: any[] = (ativos || []) as any[]
  let usandoInativos = false
  if (prods.length === 0) {
    const { data: inat } = await supabase
      .from('produtos')
      .select('id, modelo, specs')
      .eq('categoria', 'disjuntor')
      .eq('ativo', false)
      .limit(500)
    prods = (inat || []) as any[]
    if (prods.length === 0) return { ok: false, motivo: 'nenhum disjuntor cadastrado' }
    usandoInativos = true
  }

  const todos = prods.map((p) => {
    const modelo = String(p.modelo || '')
    const specsCorrente = Number(p.specs?.corrente_nominal_a)
    const matchC = modelo.match(/C(\d+)/i)
    const corrente = Number.isFinite(specsCorrente) && specsCorrente > 0
      ? specsCorrente
      : (matchC ? Number(matchC[1]) : 0)
    const specsPolos = Number(p.specs?.polos)
    const polosProd = Number.isFinite(specsPolos) && specsPolos > 0
      ? specsPolos
      : (/3D|3P/i.test(modelo) ? 3 : /2D|2P/i.test(modelo) ? 2 : 1)
    return { produto: p, corrente, polos: polosProd }
  })

  // Match ideal: polos exatos + corrente >= exigida (menor viável).
  const ideais = todos
    .filter((c) => c.polos === polos && c.corrente >= inMinA)
    .sort((a, b) => a.corrente - b.corrente)

  // Fallback 1: polos exatos, qualquer corrente (aceita superdimensionado
  // ou desconhecido, melhor que zerar).
  const soPolos = todos.filter((c) => c.polos === polos)

  // Fallback 2: qualquer disjuntor ativo — pelo menos entra na conta.
  const candidatos = ideais.length > 0 ? ideais
                    : soPolos.length > 0 ? soPolos
                    : todos
  const sufInat = usandoInativos ? ' (inativo)' : ''

  // Kalebe 2026-08-29: entre todos os candidatos compatíveis, escolhe
  // o de MAIOR preço vigente. Margem de segurança pra proteção elétrica.
  const cotacoes: Array<{ modelo: string; preco: number }> = []
  for (const { produto } of candidatos) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', produto.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco > 0) cotacoes.push({ modelo: `${produto.modelo}${sufInat}`, preco })
  }
  if (cotacoes.length > 0) {
    const escolhida = cotacoes.reduce((a, b) => (a.preco >= b.preco ? a : b))
    return { ok: true, ...escolhida }
  }

  // Fallback: qualquer preço, mesmo vencido — também escolhe o maior
  const cotacoesVencidas: Array<{ modelo: string; preco: number }> = []
  for (const { produto } of candidatos) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', produto.id)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco > 0) cotacoesVencidas.push({ modelo: `${produto.modelo}${sufInat} · ⚠ preço vencido`, preco })
  }
  if (cotacoesVencidas.length > 0) {
    const escolhida = cotacoesVencidas.reduce((a, b) => (a.preco >= b.preco ? a : b))
    return { ok: true, ...escolhida }
  }
  const detalhe = `${prods.length} disjuntor(es) na categoria mas nenhum com preço em precos_produtos`
  return { ok: false, motivo: usandoInativos ? `só INATIVOS · ${detalhe}` : detalhe }
}
