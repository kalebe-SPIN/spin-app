/**
 * Adaptador de precificação — decide entre motor v1 (legado) e v2 (Prompt 12).
 *
 * Kalebe 2026-09-08: primeira integração do motor v2 no /orcamento com
 * feature flag `precificacao_v2` (0 = v1, 1 = v2). Retorna sempre no formato
 * `PropostaCalculada` do v1 pra não quebrar o OrcamentoClient nem o PDF —
 * quando o motor v2 roda, o resultado ganha um campo extra `.v2` com o
 * ResultadoV2 completo pra quem quiser exibir a memória nova.
 *
 * O bootstrap do contexto v2 (carregar margens_alvo, aliquotas_simples,
 * multiplicadores, RBT12, anexo, comissao_modo, origem_lead) fica em
 * carregarContextoV2() pra ser chamado 1× no /orcamento/page.tsx.
 */

import { calcularProposta, calcularFormasPagamento, getNum, type Entradas, type PropostaCalculada, type ParametrosVigentes } from './calcular'
import { calcularPropostaV2, type EntradasV2, type ResultadoV2, type OrigemLead, type MargemAlvoRow, type AliquotaSimplesRow, type MultiplicadorRow, inferirLinha } from './calcular-v2'

export type ContextoV2 = {
  ativo: boolean                          // true se flag precificacao_v2 = 1
  margens_alvo: MargemAlvoRow[]
  aliquotas_simples: AliquotaSimplesRow[]
  multiplicadores: MultiplicadorRow[]
  rbt12: number
  anexo: 'III' | 'V'
  comissao_modo: 'variavel_real' | 'referencia_fixa_7'
  // Contexto do projeto/consultor — 1 por proposta
  origem_lead: OrigemLead
  volume_mensal_consultor: number
  plano_om_anexado: boolean
  multiplicadores_ativos: string[]
  distancia_km_extra?: number
}

export type PropostaCompativel = PropostaCalculada & { v2?: ResultadoV2 }

/**
 * Carrega o contexto v2 do banco. Chame 1× por request no page.tsx do
 * orçamento — depois é reusado em cada calcProposta().
 *
 * Recebe o supabase client + o projeto (pra ler origem_lead e distancia)
 * + o profile do consultor (pra volume mensal + plano_om_anexado).
 */
export async function carregarContextoV2(
  supabase: any,
  projeto: any,
  params: ParametrosVigentes,
): Promise<ContextoV2> {
  const flagAtivo = getNum(params, 'precificacao_v2', 0) === 1
  const comissaoModoNum = getNum(params, 'comissao_modo', 0)
  const rbt12 = getNum(params, 'rbt12_atual', 0)
  const anexoNum = getNum(params, 'simples_anexo_atual', 3)
  const anexo: 'III' | 'V' = anexoNum === 5 ? 'V' : 'III'
  const comissao_modo: ContextoV2['comissao_modo'] =
    comissaoModoNum === 1 ? 'referencia_fixa_7' : 'variavel_real'

  // Se flag desligada, só devolve o mínimo pra o adapter enxergar `ativo=false`
  if (!flagAtivo) {
    return {
      ativo: false,
      margens_alvo: [], aliquotas_simples: [], multiplicadores: [],
      rbt12, anexo, comissao_modo,
      origem_lead: 'lead_spin', volume_mensal_consultor: 0,
      plano_om_anexado: false, multiplicadores_ativos: [],
    }
  }

  // Volume mensal = soma pv_total dos projetos do consultor_id no mês corrente
  // Plano O&M anexado = tem algum projeto_item tipo 'om' neste projeto
  const inicioMes = new Date()
  inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const consultorId = projeto.consultor_id || projeto.criado_por

  const [margensRes, aliqRes, multRes, volMesRes, omRes] = await Promise.all([
    supabase.from('margens_alvo').select('*').eq('ativo', true).is('vigente_ate', null),
    supabase.from('aliquotas_simples').select('*').eq('ativo', true),
    supabase.from('multiplicadores_complexidade').select('*').eq('ativo', true),
    consultorId
      ? supabase.from('projetos')
          .select('pv_total')
          .eq('consultor_id', consultorId)
          .is('excluida_em', null)
          .gte('created_at', inicioMes.toISOString())
      : Promise.resolve({ data: [] }),
    supabase.from('projeto_itens')
      .select('tipo').eq('projeto_id', projeto.id).neq('status', 'removido'),
  ])

  const origem_lead: OrigemLead = (projeto.origem_lead as OrigemLead) || 'lead_spin'
  const volume_mensal_consultor = ((volMesRes.data || []) as any[])
    .reduce((s, r) => s + (Number(r.pv_total) || 0), 0)
  const plano_om_anexado = ((omRes.data || []) as any[])
    .some((i: any) => String(i.tipo) === 'om')

  return {
    ativo: true,
    margens_alvo: (margensRes.data || []) as MargemAlvoRow[],
    aliquotas_simples: (aliqRes.data || []) as AliquotaSimplesRow[],
    multiplicadores: (multRes.data || []) as MultiplicadorRow[],
    rbt12, anexo, comissao_modo,
    origem_lead,
    volume_mensal_consultor,
    plano_om_anexado,
    multiplicadores_ativos: Array.isArray(projeto.multiplicadores_ativos)
      ? projeto.multiplicadores_ativos : [],
    distancia_km_extra: Number(projeto.distancia_km_extra) || 0,
  }
}

/**
 * Calcula uma proposta usando o motor certo — v1 se flag desligada, v2 caso
 * contrário. Retorna SEMPRE no formato PropostaCalculada (v1) pra o
 * OrcamentoClient e o PropostaPDFTemplate consumirem sem mudanças.
 */
export function calcularPropostaComFlag(
  entradas: Entradas,
  params: ParametrosVigentes,
  ctxV2: ContextoV2,
): PropostaCompativel {
  if (!ctxV2.ativo) {
    return calcularProposta(entradas, params)
  }

  const potencia_wp = (entradas.placa.qtd || 0) * (entradas.placa.potencia_wp || 0)
  const linha = inferirLinha(entradas.potencia_kwp)

  const kit_fornecedor_bruto = (entradas.subtotal_kit_weg_bruto_override && entradas.subtotal_kit_weg_bruto_override > 0)
    ? entradas.subtotal_kit_weg_bruto_override
    : (entradas.placa.preco_venda_unitario * entradas.placa.qtd)
      + (entradas.inversor.preco_venda_unitario * entradas.inversor.qtd)
  // No v2 o kit é pass-through com fator: o cliente paga o kit_com_fator.
  // Mantemos o mesmo FATOR_KIT_WEG (0,4182) via v1 legado — no v2 esse
  // valor entra como custo direto SPIN (sai um comprovante de repasse).
  const FATOR_KIT_WEG = 0.4182
  const kit_com_fator = kit_fornecedor_bruto * FATOR_KIT_WEG

  // Reusa o cálculo dos itens auxiliares (frete/projeto/instalação) do v1
  // pra manter tabela e faixas consistentes. O v2 só decide margem/comissão/imposto.
  const v1_para_partes = calcularProposta(entradas, params)

  const entradasV2: EntradasV2 = {
    linha,
    potencia_wp,
    potencia_kwp: entradas.potencia_kwp,
    origem_lead: ctxV2.origem_lead,
    volume_mensal_consultor: ctxV2.volume_mensal_consultor,
    plano_om_anexado: ctxV2.plano_om_anexado,
    kit_fornecedor: kit_com_fator,
    lista_ca: v1_para_partes.subtotal_lista_ca,
    frete: v1_para_partes.frete,
    projeto_art: v1_para_partes.projeto_art,
    instalacao: v1_para_partes.instalacao,
    extras: 0,
    multiplicadores_ativos: ctxV2.multiplicadores_ativos,
    distancia_km_extra: ctxV2.distancia_km_extra,
    rbt12: ctxV2.rbt12,
    anexo: ctxV2.anexo,
    comissao_modo: ctxV2.comissao_modo,
    margens_alvo: ctxV2.margens_alvo,
    aliquotas_simples: ctxV2.aliquotas_simples,
    multiplicadores: ctxV2.multiplicadores,
  }

  const r = calcularPropostaV2(entradasV2)

  // Envelopa no formato v1 — os componentes que o v2 não decompõe (frete,
  // projeto_art, instalacao, subtotal_lista_ca) vêm do v1. Margem, comissão,
  // imposto e pv_total são os do v2.
  return {
    subtotal_kit_weg_bruto: v1_para_partes.subtotal_kit_weg_bruto,
    kit_weg_com_fator: kit_com_fator,
    subtotal_lista_ca: v1_para_partes.subtotal_lista_ca,
    frete: v1_para_partes.frete,
    projeto_art: v1_para_partes.projeto_art,
    instalacao: v1_para_partes.instalacao,
    base_impostavel: v1_para_partes.base_impostavel,
    comissao_vendedor: r.comissao_valor,
    margem: r.margem_spin,
    impostos_simples: r.imposto_valor,
    pv_total: r.pv_total,
    desconto_max_negociacao: r.desconto_max,
    memoria_calculo: {
      fator_kit_weg_aplicado: FATOR_KIT_WEG,
      // % efetivos sobre PV — o Client mostra "Margem (X%)", "Comissão (Y%)", "Imposto (Z%)"
      margem_pct: Number((r.margem_sobre_pv * 100).toFixed(2)),
      comissao_pct: Number((r.comissao_efetiva * 100).toFixed(2)),
      impostos_pct: Number((r.aliquota_efetiva * 100).toFixed(2)),
      numero_placas: entradas.placa.qtd,
      potencia_cc_kwp: entradas.potencia_kwp,
    },
    formas_pagamento: calcularFormasPagamento(r.pv_total),
    v2: r,
  }
}
