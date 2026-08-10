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

// Faixas numéricas para o simulador (marginal por faixa)
export const COMISSAO_SOLAR_CALC: { min: number; max: number; pct: number }[] = [
  { min: 0, max: 60000, pct: 0.03 },
  { min: 60000, max: 100000, pct: 0.04 },
  { min: 100000, max: 140000, pct: 0.05 },
  { min: 140000, max: Infinity, pct: 0.06 },
]

/** Comissão marginal sobre o valor total de vendas no mês. */
export function calcularComissaoSolar(faturamento: number): {
  total: number
  faixas: { label: string; pct: number; base: number; valor: number }[]
} {
  let total = 0
  const faixas: { label: string; pct: number; base: number; valor: number }[] = []
  for (const f of COMISSAO_SOLAR_CALC) {
    if (faturamento <= f.min) break
    const base = Math.min(faturamento, f.max) - f.min
    if (base <= 0) continue
    const valor = base * f.pct
    total += valor
    const topo = f.max === Infinity ? '+' : `R$ ${f.max.toLocaleString('pt-BR')}`
    faixas.push({ label: `R$ ${f.min.toLocaleString('pt-BR')} – ${topo}`, pct: f.pct, base, valor })
  }
  return { total, faixas }
}
