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
  calcularQtdCaixasJuncao,
  inversoresCompativeis,
  type Bateria,
  type InversorHibrido,
} from './catalogo-weg'

export type EntradaDimensionamentoHibrido = {
  demandaCargaCriticaKw: number     // potência da carga crítica
  autonomiaDesejadaHoras: number    // quantas horas de backup
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico'
  usarPeakShaving?: boolean          // aumenta potência despachada
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
  // Se peak shaving ou complementação, precisa margem extra
  let potenciaInversorMin = input.demandaCargaCriticaKw
  if (input.usarPeakShaving) potenciaInversorMin *= 1.3
  if (input.usarComplementacaoDemanda) potenciaInversorMin *= 1.2

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

  // Se ultrapassa limite de paralelismo (4 por entrada × entradas do inversor × qtdInversores)
  const maxBateriasPorInversor = 4 * inversor.entradas_bateria
  const maxBateriasTotal = maxBateriasPorInversor * qtdInversores
  if (qtdBaterias > maxBateriasTotal) {
    alertas.push(
      `Autonomia solicitada exige ${qtdBaterias} baterias, mas o sistema (${qtdInversores}× ${inversor.modelo}) suporta no máximo ${maxBateriasTotal}. Considere aumentar potência do inversor ou reduzir autonomia.`,
    )
    qtdBaterias = maxBateriasTotal
  }

  const capacidadeBateriaTotalKwh = qtdBaterias * bateria.capacidade_kwh
  const autonomiaRealHoras =
    (capacidadeBateriaTotalKwh * DOD_LIFEPO4 * RENDIMENTO_ROUND_TRIP) /
    input.demandaCargaCriticaKw

  if (autonomiaRealHoras < input.autonomiaDesejadaHoras * 0.95) {
    alertas.push(
      `Autonomia real (${autonomiaRealHoras.toFixed(1)}h) menor que a solicitada (${input.autonomiaDesejadaHoras}h). Alertar cliente.`,
    )
  }

  // ═══════════════════ 3. COMPONENTES OBRIGATÓRIOS ═══════════════════
  const qtdMultimedidor = 1 // sempre 1
  const qtdCaixasJuncao = calcularQtdCaixasJuncao(qtdBaterias, inversor.entradas_bateria * qtdInversores)
  const usaControladorParalelismo = usaParalelismo

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
