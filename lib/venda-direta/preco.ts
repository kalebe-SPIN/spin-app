/**
 * Preço vigente de um produto a partir de precos_produtos: linha sem
 * vigente_ate; se houver várias, a de vigente_de mais recente.
 */
export function precoVigente(rows: any): number | null {
  const lista: any[] = Array.isArray(rows) ? rows : rows ? [rows] : []
  const vigentes = lista.filter((r) => !r.vigente_ate)
  const escolhido = (vigentes.length ? vigentes : lista)
    .slice()
    .sort((a, b) => String(b.vigente_de || '').localeCompare(String(a.vigente_de || '')))[0]
  const v = Number(escolhido?.preco_venda)
  return v > 0 ? v : null
}

export type ProdutoCatalogoVD = {
  id: string
  modelo: string
  fabricante: string | null
  descricao: string | null
  categoria: string | null
  preco_tabela: number
}
