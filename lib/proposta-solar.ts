/**
 * Valores da proposta de VENDAS SOLAR (parceiro comercial de sistemas FV).
 * Comissão escalonada marginal (3% a 6%) sobre o VALOR TOTAL da venda, por
 * faturamento de vendas no mês.
 *
 * Garantia de recebimento = SEGURO MÍNIMO só nos 3 primeiros meses (período de
 * experiência): recebe o MAIOR entre o garantido do mês e a comissão. Depois da
 * experiência, NÃO há fixo — 100% comissão. Valores do seguro reaproveitados
 * de proposta-om (mês1 3.000, mês2 3.500, mês3 4.000).
 */
import { GARANTIA_ESCALONADA } from '@/lib/proposta-om'

export { GARANTIA_ESCALONADA }

// Faixas para exibição (marginal)
export const COMISSAO_SOLAR_FAIXAS: { faixa: string; pct: string }[] = [
  { faixa: 'até R$ 60.000', pct: '3%' },
  { faixa: 'R$ 60.001 a 100.000', pct: '4%' },
  { faixa: 'R$ 100.001 a 140.000', pct: '5%' },
  { faixa: 'acima de R$ 140.000', pct: '6%' },
]

// Faixas por faturamento do mês. O % da faixa ATINGIDA incide sobre o TOTAL
// (não é marginal): `ate` é o teto de cada faixa.
export const COMISSAO_SOLAR_CALC: { ate: number; pct: number }[] = [
  { ate: 60000, pct: 0.03 },
  { ate: 100000, pct: 0.04 },
  { ate: 140000, pct: 0.05 },
  { ate: Infinity, pct: 0.06 },
]

/**
 * Comissão do solar: encontra a faixa que o faturamento do mês atinge e aplica
 * o % dela sobre o VALOR TOTAL vendido (comissão "sobre o todo", não marginal).
 */
export function calcularComissaoSolar(faturamento: number): {
  total: number
  pct: number
  faixaLabel: string
} {
  if (faturamento <= 0) return { total: 0, pct: 0, faixaLabel: '—' }
  const faixa = COMISSAO_SOLAR_CALC.find((f) => faturamento <= f.ate) || COMISSAO_SOLAR_CALC[COMISSAO_SOLAR_CALC.length - 1]
  const disp = COMISSAO_SOLAR_FAIXAS.find((_, i) => COMISSAO_SOLAR_CALC[i] === faixa)
  return {
    total: faturamento * faixa.pct,
    pct: faixa.pct,
    faixaLabel: disp?.faixa || '',
  }
}
