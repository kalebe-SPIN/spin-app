/**
 * Algoritmo de dimensionamento de sistema híbrido com armazenamento.
 *
 * 3 grandezas INDEPENDENTES do cliente definem cada peça do sistema:
 *
 *   1. CONSUMO MENSAL (kWh) → POTÊNCIA CC (módulos FV)
 *      Pcc = Consumo / (HSP × 30 × PR)
 *      Ex: 800 kWh/mês em Tijucas (HSP 4.5) → ~7.9 kWp de painel
 *
 *   2. CARGA CRÍTICA (kW) + composição → POTÊNCIA CA (inversor híbrido)
 *      Pca ≥ CargaCrítica × margem(indutiva/capacitiva)
 *      Se Pca > modelo maior disponível → PARALELISMO de inversores
 *
 *   3. AUTONOMIA DESEJADA (h) + carga crítica → CAPACIDADE DAS BATERIAS
 *      Ebat = CargaCrítica × Horas / (DoD × η_round_trip)
 *
 * VALIDAÇÃO CRUZADA: Fator de Carregamento CC/CA (FCI) = Pcc/Pca × 100%
 *   Aceitável 100-130%. Se > 130% → inversor limita geração (clipping)
 *
 * Saídas: módulos FV + inversor(es) + baterias + componentes + alertas.
 */

import {
  BATERIAS_WEG,
  CAIXA_JUNCAO_WEG,
  CONTROLADOR_PARALELISMO_WEG,
  MULTIMEDIDOR_WEG,
  calcularMargemInversor,
  calcularQtdCaixasJuncao,
  inversoresCompativeis,
  maxBateriasPorInversor,
  type Bateria,
  type InversorHibrido,
} from './catalogo-weg'

export type EntradaDimensionamentoHibrido = {
  // ═══ 1. CONSUMO → módulos FV ═══
  consumoMensalKwh: number           // ← NOVO: total consumido pelo cliente/mês (da fatura)
  hspKwhM2Dia?: number               // HSP local (default 4.5 pra SC — Tijucas)
  moduloPotenciaWp?: number          // Modelo padrão (default 550Wp WEG)

  // ═══ 2. CARGA CRÍTICA → inversor ═══
  demandaCargaCriticaKw: number     // potência da carga crítica
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico'
  // Composição da carga crítica (soma deve dar ~100%)
  percCargaIndutiva?: number         // motores, ar cond, geladeira (0-100)
  percCargaResistiva?: number        // chuveiro, incandescente, forno (0-100)
  percCargaCapacitiva?: number       // eletrônicos, LED, TV (0-100)

  // ═══ 3. AUTONOMIA → baterias ═══
  autonomiaDesejadaHoras: number    // quantas horas de backup

  // Configurações extras
  usarPeakShaving?: boolean          // Grupo A — despacho em horário de ponta
  usarComplementacaoDemanda?: boolean
  preferirBateria10kwh?: boolean     // menos módulos, mais capacidade
}

export type SaidaDimensionamentoHibrido = {
  // ═══ MÓDULOS FV (calculados do consumo) ═══
  moduloPotenciaWp: number
  qtdModulos: number
  potenciaCcKwp: number              // potência CC total dos painéis
  geracaoMensalEstimadaKwh: number   // quanto o sistema deve gerar

  // ═══ INVERSOR (calculado da carga crítica) ═══
  inversor: InversorHibrido
  qtdInversores: number
  potenciaInversorTotalKw: number    // potência CA total
  usaParalelismo: boolean
  fciPercentual: number              // fator de carregamento Pcc/Pca × 100

  // ═══ BATERIAS (calculadas da autonomia × carga crítica) ═══
  bateria: Bateria
  qtdBaterias: number
  capacidadeBateriaTotalKwh: number
  autonomiaRealHoras: number

  // ═══ COMPONENTES OBRIGATÓRIOS ═══
  qtdMultimedidor: number
  qtdCaixasJuncao: number
  usaControladorParalelismo: boolean

  alertas: string[]
  resumo: string
}

/** DoD (Depth of Discharge) — LiFePO4 aguenta 90% seguro */
const DOD_LIFEPO4 = 0.90
/** Rendimento round-trip do sistema (bateria + inversor) */
const RENDIMENTO_ROUND_TRIP = 0.92
/** Performance Ratio típico sistemas Spin (perdas cabos + inversor + temperatura + sujeira) */
const PR_SISTEMA = 0.78
/** HSP padrão pra Tijucas/SC (Sul do Brasil média anual) */
const HSP_TIJUCAS_SC = 4.5
/** Módulo padrão WEG monocristalino */
const MODULO_PADRAO_WP = 550
/** Faixa aceitável do FCI (fator carregamento CC/CA) */
const FCI_MIN = 100
const FCI_MAX = 130

// ═══════════════════ HELPER: DIMENSIONAMENTO CC (MÓDULOS FV) ═══════════════════
/**
 * Calcula potência CC necessária pra atender o consumo mensal do cliente.
 *   Pcc (kWp) = Consumo (kWh/mês) / (HSP × 30 × PR)
 * Retorna também quantidade de módulos considerando modelo padrão.
 */
export function dimensionarModulosFV(
  consumoMensalKwh: number,
  hspKwhM2Dia: number = HSP_TIJUCAS_SC,
  moduloPotenciaWp: number = MODULO_PADRAO_WP,
): {
  potenciaCcKwp: number
  qtdModulos: number
  geracaoMensalEstimadaKwh: number
} {
  const potenciaCcKwp = consumoMensalKwh / (hspKwhM2Dia * 30 * PR_SISTEMA)
  const qtdModulos = Math.ceil((potenciaCcKwp * 1000) / moduloPotenciaWp)
  const potenciaCcReal = (qtdModulos * moduloPotenciaWp) / 1000
  const geracaoMensalEstimadaKwh = potenciaCcReal * hspKwhM2Dia * 30 * PR_SISTEMA
  return {
    potenciaCcKwp: potenciaCcReal,
    qtdModulos,
    geracaoMensalEstimadaKwh,
  }
}

export function dimensionarSistemaHibrido(
  input: EntradaDimensionamentoHibrido,
): SaidaDimensionamentoHibrido {
  const alertas: string[] = []

  // ═══════════════════ 1. ESCOLHA DO INVERSOR ═══════════════════
  // Margem base pela composição da carga (indutiva/resistiva/capacitiva)
  const margem = calcularMargemInversor(
    input.percCargaIndutiva || 0,
    input.percCargaCapacitiva || 0,
  )
  let potenciaInversorMin = input.demandaCargaCriticaKw * margem.fator
  alertas.push(`⚙️ ${margem.motivo}`)

  // Peak shaving (Grupo A) e complementação → margem extra
  if (input.usarPeakShaving) {
    potenciaInversorMin *= 1.3
    alertas.push('⚡ Peak shaving: +30% na potência do inversor pra despacho em horário de ponta')
  }
  if (input.usarComplementacaoDemanda) {
    potenciaInversorMin *= 1.2
    alertas.push('🔋 Complementação de demanda: +20% na potência do inversor')
  }

  const compativeis = inversoresCompativeis(input.tipoLigacao, potenciaInversorMin)
  if (compativeis.length === 0) {
    // Precisa paralelismo: escolhe maior mono/tri e calcula qtd
    const todosDoTipo = inversoresCompativeis(input.tipoLigacao, 0)
    const maior = todosDoTipo[todosDoTipo.length - 1]
    const qtd = Math.ceil(potenciaInversorMin / maior.potencia_kw)
    alertas.push(
      `Demanda ${potenciaInversorMin.toFixed(1)}kW exige paralelismo — ${qtd}× ${maior.modelo}.`,
    )
    return montarResultado({
      input, inversor: maior, qtdInversores: qtd, alertas,
    })
  }

  const inversor = compativeis[0] // menor que atende
  return montarResultado({ input, inversor, qtdInversores: 1, alertas })
}

function montarResultado(args: {
  input: EntradaDimensionamentoHibrido
  inversor: InversorHibrido
  qtdInversores: number
  alertas: string[]
}): SaidaDimensionamentoHibrido {
  const { input, inversor, qtdInversores, alertas } = args
  const potenciaInversorTotalKw = inversor.potencia_kw * qtdInversores
  const usaParalelismo = qtdInversores > 1

  // ═══════════════════ 0. MÓDULOS FV — DERIVAM DO CONSUMO ═══════════════════
  const modulos = dimensionarModulosFV(
    input.consumoMensalKwh,
    input.hspKwhM2Dia,
    input.moduloPotenciaWp,
  )
  const moduloPotenciaWp = input.moduloPotenciaWp ?? MODULO_PADRAO_WP

  // Validação FCI (Fator de Carregamento CC/CA)
  const fciPercentual = potenciaInversorTotalKw > 0
    ? (modulos.potenciaCcKwp / potenciaInversorTotalKw) * 100
    : 0
  if (fciPercentual > FCI_MAX) {
    alertas.push(
      `⚠️ FCI ${fciPercentual.toFixed(0)}% > ${FCI_MAX}% — inversor será limitante (clipping). ` +
      `Consumo pede ${modulos.potenciaCcKwp.toFixed(1)}kWp CC mas inversor entrega só ${potenciaInversorTotalKw}kW CA. ` +
      `Solução: adicionar inversor em paralelo OU reduzir consumo estimado.`,
    )
  } else if (fciPercentual < FCI_MIN) {
    alertas.push(
      `⚠️ FCI ${fciPercentual.toFixed(0)}% < ${FCI_MIN}% — inversor sobredimensionado para o consumo. ` +
      `Considere inversor menor pra reduzir custo.`,
    )
  } else {
    alertas.push(
      `✓ FCI ${fciPercentual.toFixed(0)}% dentro da faixa ideal (${FCI_MIN}-${FCI_MAX}%). Pcc=${modulos.potenciaCcKwp.toFixed(1)}kWp / Pca=${potenciaInversorTotalKw}kW`,
    )
  }

  // ═══════════════════ 2. ESCOLHA DA BATERIA + QUANTIDADE ═══════════════════
  const bateria = input.preferirBateria10kwh
    ? BATERIAS_WEG.find((b) => b.capacidade_kwh === 10)!
    : BATERIAS_WEG.find((b) => b.capacidade_kwh === 5)!

  // Energia necessária = carga × autonomia / (DoD × rendimento)
  const energiaTotalKwh =
    (input.demandaCargaCriticaKw * input.autonomiaDesejadaHoras) /
    (DOD_LIFEPO4 * RENDIMENTO_ROUND_TRIP)

  let qtdBaterias = Math.ceil(energiaTotalKwh / bateria.capacidade_kwh)

  // Limite físico: mono = 4 bat/inversor; tri = 8 bat/inversor
  const maxPorInv = maxBateriasPorInversor(inversor)
  const maxBateriasTotal = maxPorInv * qtdInversores
  if (qtdBaterias > maxBateriasTotal) {
    alertas.push(
      `⚠️ Autonomia solicitada exige ${qtdBaterias}× ${bateria.modelo}, mas ${qtdInversores}× ${inversor.modelo} suporta no máximo ${maxBateriasTotal} baterias (${inversor.entradas_bateria} entrada${inversor.entradas_bateria > 1 ? 's' : ''} × 4 via JBW). Sugestão: usar baterias 10kWh ou adicionar inversor em paralelo.`,
    )
    qtdBaterias = maxBateriasTotal
  }

  // Distribuição das baterias: precisa ser uniforme entre entradas do inversor
  const capacidadeBateriaTotalKwh = qtdBaterias * bateria.capacidade_kwh

  // Regra crítica de homogeneidade — SEMPRE respeitada porque só usamos 1 modelo
  alertas.push(`✓ Homogeneidade: todas ${qtdBaterias} baterias são ${bateria.modelo} (${bateria.capacidade_kwh}kWh)`)
  const autonomiaRealHoras =
    (capacidadeBateriaTotalKwh * DOD_LIFEPO4 * RENDIMENTO_ROUND_TRIP) /
    input.demandaCargaCriticaKw

  if (autonomiaRealHoras < input.autonomiaDesejadaHoras * 0.95) {
    alertas.push(
      `Autonomia real (${autonomiaRealHoras.toFixed(1)}h) menor que a solicitada (${input.autonomiaDesejadaHoras}h). Alertar cliente.`,
    )
  }

  // ═══════════════════ 3. COMPONENTES OBRIGATÓRIOS ═══════════════════
  // Multimedidor MMW03-M22CH: sempre 1 (obrigatório pra queda de energia + paralelismo)
  const qtdMultimedidor = 1
  const totalEntradas = inversor.entradas_bateria * qtdInversores
  const qtdCaixasJuncao = calcularQtdCaixasJuncao(qtdBaterias, totalEntradas)
  // EMBOX obrigatório se paralelismo de inversores
  const usaControladorParalelismo = usaParalelismo
  if (usaControladorParalelismo) {
    alertas.push('🔧 Paralelismo: EMBOX + MMW03-M22CH obrigatórios (ambos gerenciam o paralelismo em conjunto)')
  }

  // Resumo
  const resumo = [
    `${modulos.qtdModulos}× módulos ${moduloPotenciaWp}Wp = ${modulos.potenciaCcKwp.toFixed(2)}kWp CC`,
    `${qtdInversores}× ${inversor.modelo} (${potenciaInversorTotalKw}kW ${inversor.fase}) · FCI ${fciPercentual.toFixed(0)}%`,
    `${qtdBaterias}× ${bateria.modelo} = ${capacidadeBateriaTotalKwh}kWh`,
    `Autonomia real: ${autonomiaRealHoras.toFixed(1)}h @ ${input.demandaCargaCriticaKw}kW carga crítica`,
    `+ 1× ${MULTIMEDIDOR_WEG.modelo}`,
    qtdCaixasJuncao > 0 ? `+ ${qtdCaixasJuncao}× ${CAIXA_JUNCAO_WEG.modelo}` : null,
    usaControladorParalelismo ? `+ 1× ${CONTROLADOR_PARALELISMO_WEG.modelo}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    // Módulos FV (do consumo)
    moduloPotenciaWp,
    qtdModulos: modulos.qtdModulos,
    potenciaCcKwp: modulos.potenciaCcKwp,
    geracaoMensalEstimadaKwh: modulos.geracaoMensalEstimadaKwh,

    // Inversor (da carga crítica)
    inversor,
    qtdInversores,
    potenciaInversorTotalKw,
    usaParalelismo,
    fciPercentual,

    // Baterias (da autonomia)
    bateria,
    qtdBaterias,
    capacidadeBateriaTotalKwh,
    autonomiaRealHoras,

    // Componentes
    qtdMultimedidor,
    qtdCaixasJuncao,
    usaControladorParalelismo,

    alertas,
    resumo,
  }
}
