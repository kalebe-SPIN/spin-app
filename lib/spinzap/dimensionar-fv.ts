import { PARAMETROS_DEFAULT, fatorSolPorCidade } from '@/lib/orcamento-rapido/tipos'

/**
 * Dimensionamento do kit FV — o MESMO na tela (prévia ao vivo do "Montar
 * proposta") e no servidor (lib/spinzap/orcamento-lead.ts), pra os dois
 * chegarem no mesmo kit. Kalebe 2026-10-15: "o sistema diga a potência do kit
 * e, segundo os parâmetros técnicos, só abra as opções de equipamentos para
 * esta opção" + aumento extra de geração.
 *
 * Faixa técnica da relação CC/CA (FCI) — a do auditor do orçamento:
 * mínimo 80%; máximo 150% string, 200% híbrido, 145% micro.
 */

export type SistemaKit = 'string' | 'micro' | 'hibrido'

export const FCI_MIN = 0.8
export const FCI_MAX: Record<SistemaKit, number> = { string: 1.5, hibrido: 2.0, micro: 1.45 }
/** Aumento extra de geração aceito (% sobre o consumo) */
export const AUMENTO_GERACAO_MAX_PCT = 100

/** kWh gerados por mês por kWp, pela irradiação da cidade (mesma conta do Orçamento Rápido). */
export const kwhPorKwpMes = (cidade: string | null | undefined) =>
  fatorSolPorCidade(cidade || null, PARAMETROS_DEFAULT.fator_dimensionamento_sc) * 30 * 0.85

/** kWp necessário pro consumo, com o aumento extra de geração (%). */
export function kwpParaConsumo(consumoKwhMes: number, cidade: string | null | undefined, aumentoPct = 0): number {
  const aumento = Math.min(Math.max(Number(aumentoPct) || 0, 0), AUMENTO_GERACAO_MAX_PCT)
  return (consumoKwhMes * (1 + aumento / 100)) / kwhPorKwpMes(cidade)
}

export type InversorParaKit = { id: string; potencia_kw: number | null; entradas: number | null; preco_venda?: number }
export type OpcaoInversorKit<T> = { inv: T; qtd: number; fci: number; compativel: boolean }

/** Micro: um por grupo de placas (entradas), múltiplo do nº de fases da rede (balanceado). */
export function qtdMicros(qtdPlacas: number, entradas: number | null, nFases: number): number {
  let q = Math.ceil(qtdPlacas / (entradas || 1))
  if (q % nFases) q += nFases - (q % nFases)
  return q
}

/**
 * Cada modelo com a quantidade que o kit pede e a relação CC/CA resultante;
 * `compativel` = dentro da faixa técnica. String/híbrido: 1 inversor se ele
 * dá conta; senão vários do mesmo modelo (~130% CC/CA). Micro: pelas entradas.
 */
export function opcoesDeInversor<T extends InversorParaKit>(lista: T[], k: {
  kwp: number; qtdPlacas: number; sistema: SistemaKit; nFases: number
}): Array<OpcaoInversorKit<T>> {
  const fciMax = FCI_MAX[k.sistema]
  return lista
    .filter((i) => (i.potencia_kw || 0) > 0)
    .map((inv) => {
      const p = inv.potencia_kw!
      const qtd = k.sistema === 'micro'
        ? qtdMicros(k.qtdPlacas, inv.entradas, k.nFases)
        : p >= k.kwp / fciMax ? 1 : Math.max(1, Math.ceil(k.kwp / (p * 1.3)))
      const fci = k.kwp / (p * qtd)
      return { inv, qtd, fci, compativel: fci >= FCI_MIN && fci <= fciMax }
    })
}

/**
 * O recomendado (mesma regra de antes do motor):
 *  - string/híbrido: o MENOR que atende sozinho; sistema grande → vários do maior
 *  - micro: o que fica na faixa e, entre esses, o de menor custo total
 */
export function inversorRecomendado<T extends InversorParaKit>(ops: Array<OpcaoInversorKit<T>>, sistema: SistemaKit): OpcaoInversorKit<T> | undefined {
  if (!ops.length) return undefined
  if (sistema === 'micro') {
    const fora = (o: OpcaoInversorKit<T>) => (o.fci < FCI_MIN ? FCI_MIN - o.fci : o.fci > FCI_MAX.micro ? o.fci - FCI_MAX.micro : 0)
    return [...ops].sort((a, b) =>
      fora(a) - fora(b)
      || (a.inv.preco_venda || 0) * a.qtd - (b.inv.preco_venda || 0) * b.qtd
      || (b.inv.entradas || 1) - (a.inv.entradas || 1))[0]
  }
  const sozinho = ops.filter((o) => o.qtd === 1 && o.compativel).sort((a, b) => a.inv.potencia_kw! - b.inv.potencia_kw!)
  if (sozinho.length) return sozinho[0]
  // Nenhum dá conta sozinho: vários do maior modelo
  const porPotencia = [...ops].sort((a, b) => a.inv.potencia_kw! - b.inv.potencia_kw!)
  const maior = porPotencia[porPotencia.length - 1]
  if (maior.qtd > 1) return maior
  // Sistema pequeno demais pra qualquer modelo: o menor (o auditor aponta a relação CC/CA)
  return porPotencia[0]
}
