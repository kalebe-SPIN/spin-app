/**
 * Cotação online via WebSearch (Davi) pra itens que não têm preço no catálogo.
 * Usado como fallback pra alimentar Lista CA enquanto não temos preços próprios.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItemKit } from '@/lib/kit-auto/montar-kit'

type ResultadoCotacaoWeb = {
  preco_unitario: number | null
  fonte: string | null
  descricao_produto: string | null
  erro?: string
}

/**
 * Cota UM item online via Claude + WebSearch.
 * Retorna preço em R$ ou null se não achou.
 */
async function cotarItemOnline(anthropic: Anthropic, item: ItemKit): Promise<ResultadoCotacaoWeb> {
  const prompt = `Você é o Davi, comprador da Spin Solar (Tijucas/SC).

Encontre o MENOR preço à vista (não parcelado) desse item em lojas brasileiras online.

ITEM: ${item.descricao}
CATEGORIA: ${item.categoria}
UNIDADE: ${item.unidade}
${item.observacao ? `ESPECIFICAÇÃO: ${item.observacao}` : ''}

Sites preferidos (com bons preços de materiais elétricos):
- mercadolivre.com.br
- leroymerlin.com.br
- kaikonrad.com.br
- cobrecom.com.br
- kabum.com.br
- amazon.com.br

Regras:
- Preço deve ser À VISTA (não parcelado)
- Se produto vendido em rolo/pacote, ajustar pra unidade base (m, un, par etc)
- Ignorar preços de leilão, usados, ou muito baixos (< 30% do mercado)
- Considerar frete grátis ou custo justo pra Grande Florianópolis

Responda APENAS neste formato JSON, sem markdown:
{"preco_unitario": 12.50, "fonte": "mercadolivre.com.br", "descricao_produto": "..."}

Se não achar preço confiável:
{"preco_unitario": null, "erro": "não encontrado"}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      tools: [{ type: 'web_search_20250305' as any, name: 'web_search', max_uses: 3 } as any],
      messages: [{ role: 'user', content: prompt }],
    })

    // Extrai texto final
    const texto = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    // Tenta parsear JSON (pode vir sujo com markdown)
    const jsonMatch = texto.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return { preco_unitario: null, fonte: null, descricao_produto: null, erro: 'sem JSON' }

    const parsed = JSON.parse(jsonMatch[0])
    return {
      preco_unitario: typeof parsed.preco_unitario === 'number' ? parsed.preco_unitario : null,
      fonte: parsed.fonte || null,
      descricao_produto: parsed.descricao_produto || null,
      erro: parsed.erro,
    }
  } catch (e: any) {
    return { preco_unitario: null, fonte: null, descricao_produto: null, erro: e?.message }
  }
}

/**
 * Cota vários itens em paralelo (max 4 concorrentes pra não estourar rate limit).
 * Persiste cada cotação em cotacoes_mercado e retorna itens enriquecidos.
 */
export async function cotarItensOnline(
  supabase: SupabaseClient,
  itens: ItemKit[],
  apiKey: string,
  userId: string,
): Promise<ItemKit[]> {
  const anthropic = new Anthropic({ apiKey })
  const semPreco = itens.filter((i) => !i.preco_unitario || i.origem_preco === 'sem_preco')
  if (semPreco.length === 0) return itens

  // Cota em batches de 4 pra paralelizar sem estourar rate limit
  const BATCH = 4
  const cotados = new Map<string, ResultadoCotacaoWeb>()

  for (let i = 0; i < semPreco.length; i += BATCH) {
    const batch = semPreco.slice(i, i + BATCH)
    const resultados = await Promise.all(batch.map((item) => cotarItemOnline(anthropic, item)))
    batch.forEach((item, idx) => {
      const key = `${item.categoria}::${item.subcategoria}::${item.descricao}`
      cotados.set(key, resultados[idx])
    })
  }

  // Persiste no banco (cada cotação) — em background, não bloqueia
  const paraSalvar: any[] = []
  for (const [key, res] of cotados) {
    if (res.preco_unitario) {
      const [categoria, , descricao] = key.split('::')
      paraSalvar.push({
        descricao_livre: res.descricao_produto || descricao,
        categoria,
        preco_cotado: res.preco_unitario,
        unidade: 'un',
        fornecedor_nome: res.fonte || 'web',
        cidade: 'Online',
        uf: null,
        fonte: 'web_pesquisa',
        criado_por: userId,
        observacoes: 'Cotado via Davi WebSearch',
      })
    }
  }
  if (paraSalvar.length > 0) {
    await supabase.from('cotacoes_mercado').insert(paraSalvar)
  }

  // Retorna itens enriquecidos
  return itens.map((item) => {
    const key = `${item.categoria}::${item.subcategoria}::${item.descricao}`
    const res = cotados.get(key)
    if (!res || !res.preco_unitario) return item
    return {
      ...item,
      preco_unitario: res.preco_unitario,
      origem_preco: 'catalogo' as const, // usa 'catalogo' pra display verde; observacao guarda origem web
      observacao: `${item.observacao || ''} · 🌐 cotado em ${res.fonte || 'web'}`.trim(),
    }
  })
}
