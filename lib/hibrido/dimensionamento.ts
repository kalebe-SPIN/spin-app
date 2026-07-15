/**
 * Algoritmo de dimensionamento de sistema híbrido com armazenamento.
 *
 * Entradas:
 *   • Demanda de carga crítica em kW (o que precisa manter no backup)
 *   • Autonomia desejada em horas (quantas horas rodar sem rede)
 *   • Tipo de ligação (mono/tri)
 *   • Se usa peak shaving / complementação de demanda
 *
 * Saídas:
 *   • Inversor(es) escolhidos (potência total ≥ carga crítica)
 *   • Qtd de baterias (capacidade total ≥ carga × autonomia)
 *   • Componentes: multimedidor, caixa junção, controlador
 *   • Alertas / observações
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
  demandaCargaCriticaKw: number     // potência da carga crítica
  autonomiaDesejadaHoras: number    // quantas horas de backup
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico'
  // Composição da carga crítica (soma deve dar ~100%)
  percCargaIndutiva?: number         // motores, ar cond, geladeira (0-100)
  percCargaResistiva?: number        // chuveiro, incandescente, forno (0-100)
  percCargaCapacitiva?: number       // eletrônicos, LED, TV (0-100)
  usarPeakShaving?: boolean          // Grupo A — despacho em horário de ponta
  usarComplementacaoDemanda?: boolean
  preferirBateria10kwh?: boolean     // menos módulos, mais capacidade
}

export type SaidaDimensionamentoHibrido = {
  inversor: InversorHibrido
  qtdInversores: number
  potenciaInversorTotalKw: number
  usaParalelismo: boolean

  bateria: Bateria
  qtdBaterias: number
  capacidadeBateriaTotalKwh: number
  autonomiaRealHoras: number

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
    `${qtdInversores}× ${inversor.modelo} (${potenciaInversorTotalKw}kW ${inversor.fase})`,
    `${qtdBaterias}× ${bateria.modelo} = ${capacidadeBateriaTotalKwh}kWh`,
    `Autonomia real: ${autonomiaRealHoras.toFixed(1)}h @ ${input.demandaCargaCriticaKw}kW carga crítica`,
    `+ 1× ${MULTIMEDIDOR_WEG.modelo}`,
    qtdCaixasJuncao > 0 ? `+ ${qtdCaixasJuncao}× ${CAIXA_JUNCAO_WEG.modelo}` : null,
    usaControladorParalelismo ? `+ 1× ${CONTROLADOR_PARALELISMO_WEG.modelo}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    inversor,
    qtdInversores,
    potenciaInversorTotalKw,
    usaParalelismo,

    bateria,
    qtdBaterias,
    capacidadeBateriaTotalKwh,
    autonomiaRealHoras,

    qtdMultimedidor,
    qtdCaixasJuncao,
    usaControladorParalelismo,

    alertas,
    resumo,
  }
}
