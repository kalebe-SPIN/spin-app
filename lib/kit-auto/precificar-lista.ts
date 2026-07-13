/**
 * Enriquece itens da Lista CA com preços vindos do catálogo WEG.
 * Tenta matching automático por categoria + palavras-chave na descrição.
 *
 * Estratégia:
 *   1. Busca todos produtos ativos da categoria correspondente na v_produtos_ativos
 *   2. Ranqueia por overlap de palavras-chave entre descrição do item e descricao_curta
 *   3. Retorna melhor match ou marca como 'sem_preco' se nada bate
 *
 * Rodada no server component da Lista CA — batelada única antes de render.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItemKit } from './montar-kit'

type ProdutoCatalogo = {
  id: string
  categoria: string
  subcategoria: string | null
  descricao_curta: string
  preco_venda: number | null
  unidade: string | null
  codigo_weg: string | null
}

/**
 * Enriquece cada item da lista com preço/produto_id vindos do catálogo.
 * Preserva preços já existentes (não sobrescreve preço manual).
 */
export async function precificarLista(
  supabase: SupabaseClient,
  itens: ItemKit[],
): Promise<ItemKit[]> {
  if (itens.length === 0) return itens

  const categorias = Array.from(new Set(itens.map((i) => i.categoria)))

  const { data: produtos } = await supabase
    .from('v_produtos_ativos')
    .select('id, categoria, subcategoria, descricao_curta, preco_venda, unidade, codigo_weg')
    .in('categoria', categorias)

  const catalogo = (produtos || []) as ProdutoCatalogo[]

  return itens.map((item) => {
    // Preserva preço manual existente
    if (item.origem_preco === 'manual' && typeof item.preco_unitario === 'number') {
      return item
    }
    // Se já tem produto_id vinculado, respeita
    if (item.produto_id) {
      const p = catalogo.find((x) => x.id === item.produto_id)
      if (p && p.preco_venda !== null) {
        return { ...item, preco_unitario: Number(p.preco_venda), origem_preco: 'catalogo' as const }
      }
    }

    const candidatos = catalogo.filter((p) => p.categoria === item.categoria)
    if (candidatos.length === 0) {
      return { ...item, preco_unitario: 0, origem_preco: 'sem_preco' as const }
    }

    // Ranqueia por overlap de palavras-chave
    const keywordsItem = extrairPalavrasChave(`${item.descricao} ${item.subcategoria || ''}`)
    let melhor: { p: ProdutoCatalogo; score: number } | null = null
    for (const p of candidatos) {
      const keywordsProd = extrairPalavrasChave(`${p.descricao_curta} ${p.subcategoria || ''}`)
      const overlap = keywordsItem.filter((k) => keywordsProd.includes(k)).length
      if (!melhor || overlap > melhor.score) melhor = { p, score: overlap }
    }

    if (!melhor || melhor.score === 0 || melhor.p.preco_venda === null) {
      // Não achou match relevante — usa o primeiro candidato como fallback
      const fallback = candidatos.find((c) => c.preco_venda !== null)
      if (!fallback || fallback.preco_venda === null) {
        return { ...item, preco_unitario: 0, origem_preco: 'sem_preco' as const }
      }
      return {
        ...item,
        produto_id: fallback.id,
        preco_unitario: Number(fallback.preco_venda),
        origem_preco: 'catalogo' as const,
        codigo_weg: item.codigo_weg || fallback.codigo_weg,
      }
    }

    return {
      ...item,
      produto_id: melhor.p.id,
      preco_unitario: Number(melhor.p.preco_venda),
      origem_preco: 'catalogo' as const,
      codigo_weg: item.codigo_weg || melhor.p.codigo_weg,
    }
  })
}

/** Extrai tokens minúsculos relevantes de uma descrição, ignorando ruído. */
function extrairPalavrasChave(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s.,/]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'para', 'com', 'sem', 'ou', 'um', 'uma', 'os', 'as',
  'no', 'na', 'em', 'e', 'kit', 'ca', 'cc', 'un', 'par', 'sistema',
])

/**
 * Calcula subtotal e agrupa por categoria — pra exibição no form.
 */
export function calcularSubtotais(itens: ItemKit[]) {
  const porCategoria: Record<string, { qtd_itens: number; total: number }> = {}
  let totalGeral = 0
  let semPreco = 0

  for (const i of itens) {
    const preco = i.preco_unitario || 0
    const subtotal = preco * (i.qtd || 0)
    if (!porCategoria[i.categoria]) porCategoria[i.categoria] = { qtd_itens: 0, total: 0 }
    porCategoria[i.categoria].qtd_itens++
    porCategoria[i.categoria].total += subtotal
    totalGeral += subtotal
    if (i.origem_preco === 'sem_preco' || !preco) semPreco++
  }

  return { porCategoria, totalGeral, semPreco, totalItens: itens.length }
}
