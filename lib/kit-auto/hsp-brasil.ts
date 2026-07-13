/**
 * Horas de Sol Pico (HSP) mediana por UF brasileira.
 * Fonte: Atlas Brasileiro de Energia Solar (INPE) — média anual.
 * Usado pra dimensionamento sem fatura, calcular geração média realista.
 */

export const HSP_POR_UF: Record<string, number> = {
  AC: 4.8, AL: 5.5, AM: 4.5, AP: 4.8,
  BA: 5.5, CE: 5.6, DF: 5.2, ES: 4.9,
  GO: 5.4, MA: 5.3, MG: 5.1, MS: 5.1,
  MT: 5.2, PA: 4.6, PB: 5.6, PE: 5.5,
  PI: 5.7, PR: 4.6, RJ: 4.9, RN: 5.7,
  RO: 4.7, RR: 4.8, RS: 4.5, SC: 4.4,
  SE: 5.5, SP: 4.8, TO: 5.3,
}

/**
 * Retorna HSP estimada + label descritivo. Fallback SC (4.4) se não achar.
 */
export function getHspPorLocal(uf?: string | null, cidade?: string | null): {
  hsp: number
  label: string
} {
  const ufU = (uf || 'SC').toUpperCase()
  const hsp = HSP_POR_UF[ufU] || 4.5

  let label = `${hsp.toFixed(1)} h/dia (${ufU}`
  if (cidade) label += ` — ${cidade}`
  label += ')'
  return { hsp, label }
}
