/**
 * Helpers de faixas de precificacao por servico.
 *
 * As faixas servem como referencia (comparar com calculo detalhado)
 * e opcionalmente como piso minimo.
 */

export type Faixa = {
  id: string
  chave_servico: string
  unidade: 'placas' | 'kwp' | 'kva' | 'strings' | 'inversores'
  faixa_min: number
  faixa_max: number | null
  valor: number
  descricao: string | null
  ordem: number
  ativo: boolean
}

/**
 * Retorna a faixa que engloba o valor de entrada.
 * Se nenhuma faixa aplica, retorna null.
 */
export function encontrarFaixa(faixas: Faixa[], valor: number): Faixa | null {
  const ativas = faixas.filter(f => f.ativo).sort((a, b) => a.ordem - b.ordem)
  for (const f of ativas) {
    const maxOk = f.faixa_max == null || valor <= f.faixa_max
    if (valor >= f.faixa_min && maxOk) return f
  }
  return null
}

/**
 * Rotulo humano da faixa: "11-25 placas" ou "500+ kWp" etc.
 */
export function labelFaixa(f: Faixa): string {
  const unidadeLabel: Record<Faixa['unidade'], string> = {
    placas: 'placas',
    kwp: 'kWp',
    kva: 'kVA',
    strings: 'strings',
    inversores: 'inversores',
  }
  if (f.faixa_max == null) return `${f.faixa_min}+ ${unidadeLabel[f.unidade]}`
  return `${f.faixa_min}-${f.faixa_max} ${unidadeLabel[f.unidade]}`
}
