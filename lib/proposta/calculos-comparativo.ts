/**
 * Cálculos do Comparativo Financeiro — as 3 objeções universais.
 * Alimenta o bloco ComparativoFinanceiro.tsx.
 */

import type { ComparativoFinanceiro, DadosProposta } from './tipos'

export function calcularComparativo(d: DadosProposta): ComparativoFinanceiro {
  const p = d.parametros
  const anoAtual = new Date().getFullYear()

  // === PARAMETROS UTEIS ===
  const tarifaBase = d.segmento === 'residencial'
    ? (p.celesc_tarifa_b1_kwh || 0.95)
    : (p.celesc_tarifa_b3_kwh || 0.85)

  const fioBTusd = p.celesc_fio_b_tusd_kwh || 0.35
  const percFioB = getPercFioB(p, anoAtual)

  const taxaMinKwh = d.tipoLigacao === 'trifasico' ? (p.celesc_taxa_minima_tri_kwh || 100)
    : d.tipoLigacao === 'bifasico' ? (p.celesc_taxa_minima_bi_kwh || 50)
    : (p.celesc_taxa_minima_mono_kwh || 30)

  // === OBJEÇÃO 1: parcela vs conta atual ===
  const contaAtualMensal = d.consumoMedioKwhMes * tarifaBase

  const parcelaSolarMensal = d.parcelaFinanciada60x

  // Conta pós solar = taxa mínima + fio B sobre geração compensada
  const taxaMinima = taxaMinKwh * tarifaBase
  const geracaoCompensadaMes = Math.min(d.geracaoEstimadaKwhMes, d.consumoMedioKwhMes)
  const fioBCompensadoMensal = geracaoCompensadaMes * fioBTusd * percFioB

  const totalContaPosSolarMensal = taxaMinima + fioBCompensadoMensal

  // Economia real desde o mês 1
  const economiaMensalDesdePrimeiroMes = contaAtualMensal - parcelaSolarMensal - totalContaPosSolarMensal

  // === OBJEÇÃO 3: rendimento à vista ===
  // Economia anual = 12 × (conta atual - conta pós solar)
  const economiaAnualMediaSolar = 12 * (contaAtualMensal - totalContaPosSolarMensal)

  // Retorno solar % a.a. = economia_anual / valor_total_a_vista
  const retornoSolarPercAA = (economiaAnualMediaSolar / d.valorTotal) * 100

  // Economia em 25 anos (com inflação energética composta)
  const inflacao = (p.inflacao_energia_aa || 8.0) / 100
  const degradacao = (p.degradacao_placa_aa || 0.5) / 100
  const anos = Math.floor(p.vida_util_sistema_anos || 25)
  let economia25Anos = 0
  for (let ano = 1; ano <= anos; ano++) {
    const fatorInflacao = Math.pow(1 + inflacao, ano - 1)
    const fatorDegradacao = Math.pow(1 - degradacao, ano - 1)
    economia25Anos += economiaAnualMediaSolar * fatorInflacao * fatorDegradacao
  }

  const paybackAnos = d.valorTotal / economiaAnualMediaSolar

  return {
    contaAtualMensal,
    parcelaSolarMensal,
    economiaMensalDesdePrimeiroMes,
    taxaMinimaDisponibilidade: taxaMinima,
    fioBCompensadoMensal,
    totalContaPosSolarMensal,
    economiaAnualMediaSolar,
    retornoSolarPercAA,
    rendimentoCDIPercAA: p.cdi_atual_aa || 10.75,
    rendimentoPoupancaPercAA: p.poupanca_aa || 7.5,
    economia25Anos,
    paybackAnos,
  }
}

/**
 * Retorna % do Fio B cobrado no ano atual conforme progressão da Lei 14.300.
 */
function getPercFioB(p: Record<string, number>, ano: number): number {
  const chave = `lei_14300_perc_${ano}` as const
  if (p[chave] !== undefined) return p[chave]
  // Fallback: se >= 2030, cobra 100%
  if (ano >= 2030) return 1.0
  return 0.45 // fallback conservador
}

/**
 * Calcula parcela do financiamento pelo sistema Price.
 */
export function calcularParcelaFinanciamento(
  valorTotal: number,
  taxaAnualPerc: number,
  prazoMeses: number,
): number {
  const taxaMensal = Math.pow(1 + taxaAnualPerc / 100, 1 / 12) - 1
  if (taxaMensal === 0) return valorTotal / prazoMeses
  const num = valorTotal * (taxaMensal * Math.pow(1 + taxaMensal, prazoMeses))
  const den = Math.pow(1 + taxaMensal, prazoMeses) - 1
  return num / den
}
