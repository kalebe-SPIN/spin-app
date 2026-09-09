import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CatalogoBrowse } from './CatalogoBrowse'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Catálogo (visualização) — /catalogo
 *
 * Kalebe 2026-09-09: substitui o antigo "Orçamento Rápido" no ponto de
 * partida do dashboard. O consultor/representante navega o catálogo
 * (placas, inversores, baterias, wallbox, etc), acha o kit que quer, e
 * a partir dali cria projeto formal (fluxo /projetos/novo → /kit → /orcamento).
 *
 * Diferente de /admin/catalogo — aqui é SOMENTE LEITURA (sem CRUD).
 * Acessível pra admin, consultor, representante. Preços exibidos são os
 * de venda cadastrados no admin. Custos internos (fator WEG, margens)
 * NUNCA aparecem — regra da dupla-visão.
 */
export default async function CatalogoBrowsePage({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = perfil?.role || ''
  // profissional_campo não tem CRM/vendas → bloqueia. Todos os demais entram.
  if (role === 'profissional_campo') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">
            O catálogo comercial é da equipe de vendas.
          </p>
        </div>
      </main>
    )
  }

  const q = (searchParams.q || '').trim()
  const cat = (searchParams.cat || '').trim() || null

  // Query defensiva — subcategoria pode não existir em ambientes antigos
  let query = supabase
    .from('produtos')
    .select('id, modelo, marca, categoria, subcategoria, potencia_wp, potencia_kw, preco_venda, disponivel_estoque, descricao_publica, imagem_url')
    .eq('ativo', true)
    .order('categoria')
    .order('modelo')
    .limit(200)

  if (cat) query = query.eq('categoria', cat)
  if (q.length >= 2) {
    // Busca por modelo OU marca (case-insensitive)
    query = query.or(`modelo.ilike.%${q}%,marca.ilike.%${q}%`)
  }

  const { data: produtos, error } = await query

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-xl mx-auto">
        <header className="mb-8">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            🛒 Catálogo
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Encontre o produto ou kit ideal e depois crie o projeto formal.
          </p>
        </header>

        <CatalogoBrowse
          produtos={produtos || []}
          termoInicial={q}
          categoriaInicial={cat}
          erro={error?.message || null}
        />
      </div>
    </main>
  )
}
