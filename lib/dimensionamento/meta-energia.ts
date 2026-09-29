/**
 * Meta de energia do dimensionamento (Kalebe 2026-09-29) — regra única usada
 * pelo gráfico da Fatura, pelo passo Dimensionar e pelo passo Kit.
 *
 *  - Cliente NOVO: necessidade = consumo médio (UC principal + beneficiárias)
 *  - Cliente que JÁ GERA (ampliação): necessidade = o que falta pra zerar =
 *    consumo a compensar (média − taxa mínima de cada UC) − injetado médio
 *  - Adicional pedido pelo cliente: % sobre a necessidade OU kWh/mês fixos
 *  - Duas opções no Kit: "necessidade real" e "com geração excedente"
 *
 * Referências técnicas (skill analista-de-faturas):
 *  - taxa mínima grupo B (REN ANEEL 1.000): mono 30 · bi 50 · tri 100 kWh/mês
 *  - sistema existente estimado pela injeção: max(máx/130, média/110) kWp
 *  - kWp a partir de kWh/mês: mesmo fator já usado no Dimensionar/Kit
 *    (30 dias × 4,5 h de sol × 80% de rendimento ≈ 108 kWh/kWp/mês)
 */

export const DISPONIBILIDADE_KWH: Record<string, number> = { monofasico: 30, bifasico: 50, trifasico: 100 }
export const HORAS_SOL = 4.5
export const PERDAS = 0.20
const MARGEM_EQUILIBRIO = 0.05

export function kwpParaEnergia(kwhMes: number): number {
  return kwhMes > 0 ? kwhMes / (30 * HORAS_SOL * (1 - PERDAS)) : 0
}

export type SerieUc = {
  uc: string
  historico: any[]
  media: number
  tipo_ligacao?: string | null
  grupo?: string | null
}

export type Balanco = {
  meses_com_injecao: number
  injetado_medio: number
  injetado_max: number
  consumo_total: number
  compensavel: number
  balanco_mes: number               // + sobra / − falta (kWh/mês)
  status: 'superavitario' | 'deficitario' | 'equilibrado'
  kwp_atual_estimado: number
  ampliacao_kwp: number
}

/** Injetado (UC geradora) × consumo a compensar (todas as UCs). null se não há injeção lida. */
export function balancoCreditos(series: SerieUc[]): Balanco | null {
  const principal = series[0]
  if (!principal) return null
  const injetados = (principal.historico || [])
    .map((h: any) => (h?.injetado_kwh === null || h?.injetado_kwh === undefined ? null : Number(h.injetado_kwh)))
    .filter((v): v is number => v !== null && isFinite(v) && v > 0)
  if (injetados.length === 0) return null

  const injetadoMedio = injetados.reduce((s, v) => s + v, 0) / injetados.length
  const injetadoMax = Math.max(...injetados)
  const consumoTotal = series.reduce((s, u) => s + (u.media || 0), 0)
  const compensavel = series.reduce((s, u) => {
    const disp = String(u.grupo || 'B').toUpperCase() === 'A' ? 0 : (DISPONIBILIDADE_KWH[String(u.tipo_ligacao || '')] ?? 0)
    return s + Math.max((u.media || 0) - disp, 0)
  }, 0)
  const balancoMes = injetadoMedio - compensavel
  const status = compensavel <= 0 || balancoMes >= compensavel * MARGEM_EQUILIBRIO ? 'superavitario'
    : balancoMes <= -compensavel * MARGEM_EQUILIBRIO ? 'deficitario' : 'equilibrado'

  return {
    meses_com_injecao: injetados.length,
    injetado_medio: injetadoMedio,
    injetado_max: injetadoMax,
    consumo_total: consumoTotal,
    compensavel,
    balanco_mes: balancoMes,
    status,
    kwp_atual_estimado: Math.max(injetadoMax / 130, injetadoMedio / 110),
    ampliacao_kwp: status === 'deficitario' ? kwpParaEnergia(Math.abs(balancoMes)) : 0,
  }
}

/** Séries (principal + beneficiárias) a partir do projeto salvo. */
export function seriesDoProjeto(projeto: any): SerieUc[] {
  const f = projeto?.analise_fatura || {}
  const principal: SerieUc = {
    uc: f.uc || 'Principal',
    historico: f.historico_12_meses || [],
    media: Number(f.consumo_medio_12m_kwh || f.consumo_mes_kwh || f.consumo_medio_kwh || f.consumo_kwh || 0),
    tipo_ligacao: f.tipo_ligacao || null,
    grupo: f.grupo || null,
  }
  const benef: SerieUc[] = (projeto?.beneficiarias || []).map((b: any) => ({
    uc: b.uc || `#${b.ordem}`,
    historico: b.analise?.historico_12_meses || [],
    media: Number(b.analise?.consumo_medio_12m_kwh || b.analise?.consumo_mes_kwh || 0),
    tipo_ligacao: b.analise?.tipo_ligacao || null,
    grupo: b.analise?.grupo || null,
  }))
  return [principal, ...benef]
}

export type AjustesEnergia = {
  adicional_tipo: 'percentual' | 'absoluto'
  adicional_valor: number
  opcao: 'real' | 'excedente'
}

export type MetaEnergia = {
  modo: 'novo' | 'ampliacao'
  consumo_total: number
  balanco: Balanco | null
  necessidade_kwh: number          // "necessidade real"
  adicional_kwh: number
  ajustes: AjustesEnergia
  alvo_real_kwh: number
  alvo_excedente_kwh: number
  kwp_real: number
  kwp_excedente: number
  opcao: 'real' | 'excedente'
  alvo_kwh: number                 // da opção escolhida
  kwp_alvo: number
}

export function ajustesDoProjeto(projeto: any): AjustesEnergia {
  const a = projeto?.projeto_tecnico?.dimensionamento_energia || {}
  return {
    adicional_tipo: a.adicional_tipo === 'absoluto' ? 'absoluto' : 'percentual',
    adicional_valor: Math.max(0, Number(a.adicional_valor) || 0),
    opcao: a.opcao === 'excedente' ? 'excedente' : 'real',
  }
}

export function calcularMetaEnergia(projeto: any): MetaEnergia {
  const series = seriesDoProjeto(projeto)
  const consumoTotal = series.reduce((s, u) => s + (u.media || 0), 0)
  const temGeracao = !!projeto?.analise_fatura?.tem_geracao_propria
  const balanco = temGeracao ? balancoCreditos(series) : null
  const modo: MetaEnergia['modo'] = balanco ? 'ampliacao' : 'novo'

  // Quem já gera: só o que falta pra zerar. Novo: o consumo (regra anterior, sem mudança).
  const necessidade = balanco ? Math.max(-balanco.balanco_mes, 0) : consumoTotal
  const ajustes = ajustesDoProjeto(projeto)
  const adicional = ajustes.adicional_tipo === 'absoluto'
    ? ajustes.adicional_valor
    : necessidade * (ajustes.adicional_valor / 100)

  const alvoReal = necessidade
  const alvoExcedente = necessidade + adicional
  const opcao = ajustes.opcao === 'excedente' && adicional > 0 ? 'excedente' : 'real'
  const alvo = opcao === 'excedente' ? alvoExcedente : alvoReal

  return {
    modo,
    consumo_total: consumoTotal,
    balanco,
    necessidade_kwh: necessidade,
    adicional_kwh: adicional,
    ajustes,
    alvo_real_kwh: alvoReal,
    alvo_excedente_kwh: alvoExcedente,
    kwp_real: kwpParaEnergia(alvoReal),
    kwp_excedente: kwpParaEnergia(alvoExcedente),
    opcao,
    alvo_kwh: alvo,
    kwp_alvo: kwpParaEnergia(alvo),
  }
}
