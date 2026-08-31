import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PenteFinoClient } from '@/components/PenteFinoClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Pente fino do catálogo — auditoria + correção em massa.
 * Kalebe 2026-08-31.
 */
export default async function PenteFinoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') notFound()

  // Contagens gerais
  const { count: totalProdutos } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true })
  const { count: ativos } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true)

  // Problemas
  const { count: semFabricante } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true })
    .or('fabricante.is.null,fabricante.eq.')
  const { count: semCategoria } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true })
    .or('categoria.is.null,categoria.eq.')
  const { count: semSubcategoria } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true })
    .or('subcategoria.is.null,subcategoria.eq.,subcategoria.eq.sem_categoria')
  const { count: semDescricao } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true })
    .or('descricao_curta.is.null,descricao_curta.eq.')
  const { count: semCodigoInterno } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true })
    .or('codigo_interno_spin.is.null,codigo_interno_spin.eq.')
  const { count: semSpecs } = await supabase
    .from('produtos').select('id', { count: 'exact', head: true })
    .is('specs', null)

  // Produtos ativos sem preço vigente — cruzamento à mão
  const hojeIso = new Date().toISOString().slice(0, 10)
  const { data: prodsAtivos } = await supabase
    .from('produtos').select('id, modelo, categoria, codigo_weg').eq('ativo', true).limit(2000)
  const ids = (prodsAtivos || []).map(p => p.id)
  let precosMap = new Set<string>()
  if (ids.length > 0) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('produto_id, preco_venda, vigente_ate')
      .in('produto_id', ids)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
    for (const p of (precos || [])) {
      const val = Number(p.preco_venda) || 0
      if (val > 0) precosMap.add(p.produto_id)
    }
  }
  const semPrecoVigente = (prodsAtivos || []).filter(p => !precosMap.has(p.id))
  const contagemSemPrecoPorCat: Record<string, number> = {}
  for (const p of semPrecoVigente) {
    const cat = p.categoria || '—'
    contagemSemPrecoPorCat[cat] = (contagemSemPrecoPorCat[cat] || 0) + 1
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/catalogo" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Catálogo
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-1">
            🔍 Pente fino do catálogo
          </h1>
          <p className="text-sm text-white/60">
            Auditoria de campos incompletos + correção em massa.
            {' '}<strong className="text-white">{totalProdutos || 0}</strong> produtos no total
            ({ativos || 0} ativos).
          </p>
        </header>

        <PenteFinoClient
          diagnostico={{
            total_produtos: totalProdutos || 0,
            ativos: ativos || 0,
            sem_fabricante: semFabricante || 0,
            sem_categoria: semCategoria || 0,
            sem_subcategoria: semSubcategoria || 0,
            sem_descricao: semDescricao || 0,
            sem_codigo_interno: semCodigoInterno || 0,
            sem_specs: semSpecs || 0,
            ativos_sem_preco: semPrecoVigente.length,
            ativos_sem_preco_por_cat: contagemSemPrecoPorCat,
          }}
          amostraSemPreco={semPrecoVigente.slice(0, 20).map(p => ({
            id: p.id,
            modelo: p.modelo || '(sem modelo)',
            categoria: p.categoria || '—',
            codigo_weg: p.codigo_weg || '—',
          }))}
        />
      </div>
    </main>
  )
}
