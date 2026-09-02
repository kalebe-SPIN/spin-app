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
): Promise<{ sucesso: true; next_path?: string } | { sucesso: false; erro: string }> {
  try {
    return await _salvarKitActionImpl(projetoId, kit, tipoProjeto, opts)
  } catch (e: any) {
    console.error('[salvarKitAction] erro:', e?.message || e, e?.stack)
    return { sucesso: false, erro: e?.message || 'Erro desconhecido ao salvar kit' }
  }
}

async function _salvarKitActionImpl(
  projetoId: string,
  kit: KitSelecionado,
  tipoProjeto?: string,
  opts?: SalvarKitOpts,
): Promise<{ sucesso: true; next_path?: string } | { sucesso: false; erro: string }> {
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
    // Passa 0 quando distância não cadastrada — precificarComplementosCC
    // aplica o fallback correto (20m/entrada MPPT). Kalebe 2026-08-29.
    distancia_string_qgbt_m: Number(padraoEfetivo?.distancia_string_qgbt_m) || 0,
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
  revalidatePath(`/projetos/${projetoId}/kit`)
  // Kalebe 2026-09-01: retorna next_path em vez de redirect() do server.
  // Se algum passo anterior throw (precificarComplementosCC, DB), o
  // redirect era engolido e a UI ficava travada sem feedback.
  // Cliente faz router.push explícito e sabe pra onde vai.
  if (modoPorUc) {
    return { sucesso: true }
  }
  return { sucesso: true, next_path: `/projetos/${projetoId}/lista-ca` }
}

// ─── Action: regerar composição dos complementos WEG ─────────────────
// Kalebe 2026-09-01: quando um projeto tem lista_complementos_cc salva
// antes dos fixes recentes (BCWA → capacitor, GANCHO → gancho individual,
// filtro contem sem normalização), o snapshot fica preso com dados errados.
// Este action re-roda precificarComplementosCC no kit_selecionado atual
// e sobrescreve lista_complementos_cc com resultado limpo.
export async function regenerarComplementosKitAction(
  projetoId: string,
): Promise<{ sucesso: true } | { sucesso: false; erro: string }> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { sucesso: false, erro: 'Não autenticado' }

    const { data: proj } = await supabase
      .from('projetos')
      .select('kit_selecionado, padrao_entrada, telhado_secoes')
      .eq('id', projetoId).single()

    const kit: any = proj?.kit_selecionado
    if (!kit || !kit.qtd_placas) return { sucesso: false, erro: 'Projeto sem kit selecionado' }

    const padraoEfetivo: any = proj?.padrao_entrada || {}
    const telhadoSecoesData: any[] = Array.isArray((proj as any)?.telhado_secoes) ? (proj as any).telhado_secoes : []
    const ligacaoCliente = padraoEfetivo?.tipo_ligacao || 'monofasico'

    const invsInput = kit.inversores?.length > 0 ? kit.inversores : (kit.inversor ? [{ id: kit.inversor.id, modelo: kit.inversor.modelo, potencia_kw: kit.inversor.potencia_kw, qtd: kit.qtd_inversores || 1 }] : [])

    const complementosCC = await precificarComplementosCC(supabase, {
      qtd_placas: kit.qtd_placas,
      tipo_telhado: telhadoSecoesData[0]?.tipo_cobertura || null,
      distancia_string_qgbt_m: Number(padraoEfetivo?.distancia_string_qgbt_m) || 0,
      inversores: invsInput,
      tipo_ligacao_cliente: ligacaoCliente,
    })

    const listaObj = {
      itens: complementosCC.itens,
      total: complementosCC.total,
      avisos: complementosCC.avisos,
      gerado_em: new Date().toISOString(),
    }

    const kitWegBrutoTotal = complementosCC.total +
      (Number(kit.placa?.preco_venda) || 0) * (kit.qtd_placas || 0) +
      invsInput.reduce((s: number, i: any) => s + (Number(i.preco_venda) || 0) * (Number(i.qtd) || 1), 0)

    await supabase
      .from('projetos')
      .update({
        lista_complementos_cc: listaObj,
        kit_weg_bruto_total: kitWegBrutoTotal,
      })
      .eq('id', projetoId)

    revalidatePath(`/projetos/${projetoId}/orcamento`)
    revalidatePath(`/projetos/${projetoId}`)
    return { sucesso: true }
  } catch (e: any) {
    console.error('[regenerarComplementosKitAction]', e?.message, e?.stack)
    return { sucesso: false, erro: e?.message || 'Falha ao regerar' }
  }
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
// Kalebe 2026-09-02: extraído pra lib/kit-auto/complementos-cc.ts
// pra permitir chamada on-demand da /orcamento (auto-regenera snapshot).
// ═══════════════════════════════════════════════════════════════════════

import { precificarComplementosCC as precificarComplementosCCLib } from '@/lib/kit-auto/complementos-cc'
import type { EntradaComplementosCC, FaseInvKit } from '@/lib/kit-auto/complementos-cc'


/**
 * Wrapper local: delega pra lib. Assinatura mantida pra compatibilidade
 * com regenerarComplementosKitAction e salvarKitAction acima.
 */
async function precificarComplementosCC(
  supabase: any,
  entrada: EntradaComplementosCC,
) {
  return precificarComplementosCCLib(supabase, entrada)
}
