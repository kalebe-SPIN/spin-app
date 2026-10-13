import type { createAdminClient } from '@/lib/supabase/admin'
import { PARAMETROS_DEFAULT, TIPOS_REDE_INFO, fatorSolPorCidade, type TipoRede } from '@/lib/orcamento-rapido/tipos'
import { montarKit, listarPlacasDisponiveis, escolherInversor } from '@/lib/orcamento-rapido/catalogo'
import { calcularProposta, paramsToRecord, type FormasPagamento } from '@/lib/precificacao/calcular'

/**
 * Orçamento fotovoltaico montado pela Laís (Kalebe 2026-10-10) — mesmo motor
 * do Orçamento Rápido/proposta formal (catálogo WEG disponível + matriz de
 * margem de parametros_precificacao), só que pelo servidor (sem usuário
 * logado). Três jeitos de dimensionar, como no roteiro:
 *   - consumo (da fatura) em kWh/mês
 *   - valor médio da conta (média inverno × verão) → kWh pelo R$/kWh
 *   - configuração que o lead pediu (qtd de placas + inversor) → espelha
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * Kalebe 2026-10-13: nada de R$/kWh fixo — a tarifa vem da FATURA do cliente
 * (calculada em lib/fatura/tarifa.ts: grupo, horário, subsídios) ou, sem
 * fatura, da mediana das faturas reais lidas (tarifas_extraidas).
 */
export type FonteTarifa = { tarifa_kwh: number; fonte: 'fatura' | 'base'; amostras?: number; subsidio?: string | null }

export type EntradaOrcamentoLead =
  | { modo: 'consumo_kwh'; consumo_kwh: number; tarifa?: FonteTarifa | null }
  | { modo: 'valor_mensal'; valor_mensal: number; tarifa: FonteTarifa }
  | { modo: 'qtd_placas'; qtd_placas: number; inversor_kw?: number | null }

export type OrcamentoLead = {
  entrada: EntradaOrcamentoLead
  tipo_rede: TipoRede
  cidade: string | null
  kwp: number
  qtd_placas: number
  placa: { id: string; modelo: string; potencia_wp: number; area_m2: number | null }
  inversor: { id: string; modelo: string; potencia_kw: number; fases: 'mono' | 'bi' | 'tri' | null }
  consumo_kwh_mes: number | null
  geracao_kwh_mes: number
  pv_total: number
  formas_pagamento: FormasPagamento
  /** Interno (dupla visão): não vai pro cliente */
  interno: { margem_pct: number; desconto_max_negociacao: number }
  premissas: string[]
}

/** Perfil (monofásico/bifásico/trifásico) → rede do catálogo. SC: trifásico 220/380 V. */
export function tipoRedeDoPerfil(t: string | null | undefined): TipoRede {
  if (t === 'trifasico') return 'tri_380'
  if (t === 'bifasico') return 'bi_220'
  return 'mono_220'
}

/** kWh gerados por mês por kWp, pela irradiação da cidade (mesma conta do Orçamento Rápido). */
const kwhPorKwpMes = (cidade: string | null) => fatorSolPorCidade(cidade, PARAMETROS_DEFAULT.fator_dimensionamento_sc) * 30 * 0.85

export async function montarOrcamentoLead(admin: Admin, e: {
  entrada: EntradaOrcamentoLead
  tipo_rede_perfil: string | null
  cidade: string | null
}): Promise<OrcamentoLead | { erro: string }> {
  const tipo_rede = tipoRedeDoPerfil(e.tipo_rede_perfil)
  const rede = TIPOS_REDE_INFO[tipo_rede]
  const premissas: string[] = []

  // Potência alvo
  let consumo: number | null = null
  let kwpAlvo = 0
  const rotuloTarifa = (t: FonteTarifa) =>
    `Tarifa de R$ ${t.tarifa_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}/kWh ${
      t.fonte === 'fatura' ? 'calculada da sua fatura' : `(referência de ${t.amostras || 'várias'} faturas reais)`}${
      t.subsidio && t.subsidio !== 'nenhum' ? `, com ${t.subsidio.replace('_', ' ')}` : ''}`
  if (e.entrada.modo === 'consumo_kwh') {
    consumo = e.entrada.consumo_kwh
    kwpAlvo = consumo / kwhPorKwpMes(e.cidade)
    premissas.push(`Consumo médio de ${Math.round(consumo)} kWh/mês`)
    if (e.entrada.tarifa?.tarifa_kwh) premissas.push(rotuloTarifa(e.entrada.tarifa))
  } else if (e.entrada.modo === 'valor_mensal') {
    if (!(e.entrada.tarifa?.tarifa_kwh > 0)) return { erro: 'Sem tarifa pra converter o valor da conta em kWh (precisa da fatura ou da base de tarifas)' }
    consumo = e.entrada.valor_mensal / e.entrada.tarifa.tarifa_kwh
    kwpAlvo = consumo / kwhPorKwpMes(e.cidade)
    premissas.push(`Conta média de R$ ${e.entrada.valor_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (≈ ${Math.round(consumo)} kWh/mês)`)
    premissas.push(rotuloTarifa(e.entrada.tarifa))
  } else {
    const placas = await listarPlacasDisponiveis(admin)
    const maior = placas[placas.length - 1]
    if (!maior) return { erro: 'Nenhuma placa disponível no catálogo' }
    kwpAlvo = (e.entrada.qtd_placas * maior.potencia_wp) / 1000
    premissas.push(`Configuração pedida pelo cliente: ${e.entrada.qtd_placas} placas${e.entrada.inversor_kw ? ` e inversor de ~${e.entrada.inversor_kw} kW` : ''}`)
  }
  if (!(kwpAlvo > 0)) return { erro: 'Não deu pra calcular a potência' }

  // Rede bifásica usa inversor monofásico 220 V (não existe "bifásico" no catálogo WEG);
  // o desbalanceamento (≤ 5 kW) é conferido no auditor
  const fasesInversor = rede.fases === 'bi' ? 'mono' : rede.fases
  const tensaoInversor = rede.fases === 'bi' ? 220 : rede.tensao
  const kit = await montarKit({ kwp_desejado: kwpAlvo, fases: fasesInversor, tensao_v: tensaoInversor }, admin)
  if (!kit.placa) return { erro: kit.aviso_estoque || 'Sem placa no catálogo' }
  let inversor = kit.inversor
  // Lead pediu um inversor específico: o mais próximo do tamanho que ele quer
  if (e.entrada.modo === 'qtd_placas' && e.entrada.inversor_kw) {
    inversor = (await escolherInversor({ kwp_sistema: e.entrada.inversor_kw, fases: fasesInversor, tensao_v: tensaoInversor }, admin)) || inversor
  }
  if (!inversor) {
    return { erro: `${kit.aviso_estoque || 'Sem inversor compatível no catálogo'} — sistema desse porte pede mais de um inversor; o consultor monta a composição` }
  }

  const { data: linhas } = await admin.from('parametros_precificacao')
    .select('chave, valor_numero, valor_json, unidade').is('vigente_ate', null).eq('ativo', true)
  const params = paramsToRecord(linhas || [])
  const proposta = calcularProposta({
    placa: { qtd: kit.qtd_placas, preco_venda_unitario: kit.placa.preco_venda || 0, modelo: kit.placa.modelo, potencia_wp: kit.placa.potencia_wp },
    inversor: { qtd: 1, preco_venda_unitario: inversor.preco_venda || 0, modelo: inversor.modelo, potencia_kw: inversor.potencia_kw },
    itens_ca: [],
    potencia_kwp: kit.kwp_real,
    distancia_km_extra: 0,
    tipo_projeto: 'fv_ongrid',
  }, params)

  premissas.push(`Rede ${rede.label}`)
  if (e.cidade) premissas.push(`Irradiação de ${e.cidade}`)
  return {
    entrada: e.entrada,
    tipo_rede,
    cidade: e.cidade,
    kwp: kit.kwp_real,
    qtd_placas: kit.qtd_placas,
    placa: { id: kit.placa.id, modelo: kit.placa.modelo, potencia_wp: kit.placa.potencia_wp, area_m2: kit.placa.area_m2 },
    inversor: { id: inversor.id, modelo: inversor.modelo, potencia_kw: inversor.potencia_kw, fases: inversor.fases },
    consumo_kwh_mes: consumo,
    geracao_kwh_mes: Math.round(kit.kwp_real * kwhPorKwpMes(e.cidade)),
    pv_total: Math.round(proposta.pv_total * 100) / 100,
    formas_pagamento: proposta.formas_pagamento,
    interno: { margem_pct: proposta.memoria_calculo.margem_pct, desconto_max_negociacao: proposta.desconto_max_negociacao },
    premissas,
  }
}
