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
  raw?: string  // texto bruto do Claude — pra debug
}

/**
 * Cota UM item online via Claude + WebSearch.
 * Retorna preço em R$ ou null se não achou.
 */
async function cotarItemOnline(anthropic: Anthropic, item: ItemKit): Promise<ResultadoCotacaoWeb> {
  const prompt = `Encontre o menor preço à vista desse item de material elétrico em lojas online brasileiras.

ITEM: ${item.descricao}
CATEGORIA: ${item.categoria}
UNIDADE: ${item.unidade}
${item.observacao ? `ESPECIFICAÇÃO: ${item.observacao}` : ''}

USE web_search pra pesquisar. Sites bons: mercadolivre.com.br, leroymerlin.com.br, kaikonrad.com.br, cobrecom.com.br, kabum.com.br.

Regras:
- Preço à vista (não parcelado)
- Se produto vem em rolo/pacote, calcule o preço por unidade base
- Ignore leilão, usado, ou preços absurdamente baixos
- Prefira produtos com boa reputação

Após pesquisar, responda APENAS no formato JSON (sem markdown):
{"preco_unitario": 12.50, "fonte": "mercadolivre.com.br", "descricao_produto": "Nome do produto"}

Ou se não achar:
{"preco_unitario": null, "erro": "descrição do problema"}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search_20250305' as any,
          name: 'web_search',
          max_uses: 5,
        } as any,
      ],
      messages: [{ role: 'user', content: prompt }],
    })

    // Extrai texto final (pode ter vários blocos)
    const texto = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    console.log(`[Davi] Item "${item.descricao.slice(0, 40)}" — resposta: ${texto.slice(0, 200)}`)

    if (!texto) {
      return { preco_unitario: null, fonte: null, descricao_produto: null, erro: 'resposta vazia do Claude', raw: '' }
    }

    // Tenta parsear JSON — várias estratégias
    const jsonMatch = texto.match(/\{[^{}]*"preco_unitario"[^{}]*\}/s) || texto.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) {
      return { preco_unitario: null, fonte: null, descricao_produto: null, erro: 'JSON não encontrado na resposta', raw: texto.slice(0, 300) }
    }

    try {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        preco_unitario: typeof parsed.preco_unitario === 'number' ? parsed.preco_unitario : null,
        fonte: parsed.fonte || null,
        descricao_produto: parsed.descricao_produto || null,
        erro: parsed.erro,
      }
    } catch (parseErr: any) {
      return { preco_unitario: null, fonte: null, descricao_produto: null, erro: `JSON inválido: ${parseErr.message}`, raw: jsonMatch[0].slice(0, 300) }
    }
  } catch (e: any) {
    console.error(`[Davi] Erro na cotação de "${item.descricao}":`, e?.message || e)
    return {
      preco_unitario: null,
      fonte: null,
      descricao_produto: null,
      erro: e?.message || 'erro desconhecido',
    }
  }
}

/**
 * Cota vários itens em paralelo (max 3 concorrentes pra não estourar rate limit).
 * Persiste cada cotação em cotacoes_mercado e retorna itens enriquecidos.
 */
export async function cotarItensOnline(
  supabase: SupabaseClient,
  itens: ItemKit[],
  apiKey: string,
  userId: string,
): Promise<{ itens: ItemKit[]; erros: { descricao: string; erro: string; raw?: string }[] }> {
  const anthropic = new Anthropic({ apiKey })
  const semPreco = itens.filter((i) => !i.preco_unitario || i.origem_preco === 'sem_preco')
  if (semPreco.length === 0) return { itens, erros: [] }

  // Cota em batches de 3 pra paralelizar sem estourar rate limit
  const BATCH = 3
  const cotados = new Map<string, ResultadoCotacaoWeb>()
  const erros: { descricao: string; erro: string; raw?: string }[] = []

  for (let i = 0; i < semPreco.length; i += BATCH) {
    const batch = semPreco.slice(i, i + BATCH)
    const resultados = await Promise.all(batch.map((item) => cotarItemOnline(anthropic, item)))
    batch.forEach((item, idx) => {
      const key = `${item.categoria}::${item.subcategoria}::${item.descricao}`
      const res = resultados[idx]
      cotados.set(key, res)
      if (!res.preco_unitario && res.erro) {
        erros.push({ descricao: item.descricao, erro: res.erro, raw: res.raw })
      }
    })
  }

  // Persiste no banco (cada cotação bem-sucedida)
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
    const { error: insErr } = await supabase.from('cotacoes_mercado').insert(paraSalvar)
    if (insErr) console.error('[Davi] Erro ao persistir cotações:', insErr.message)
  }

  // Retorna itens enriquecidos
  const itensNovos = itens.map((item) => {
    const key = `${item.categoria}::${item.subcategoria}::${item.descricao}`
    const res = cotados.get(key)
    if (!res || !res.preco_unitario) return item
    return {
      ...item,
      preco_unitario: res.preco_unitario,
      origem_preco: 'catalogo' as const,
      observacao: `${item.observacao || ''} · 🌐 ${res.fonte || 'web'}`.trim(),
    }
  })

  return { itens: itensNovos, erros }
}
