import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { CatalogoClient } from '@/components/CatalogoClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CatalogoAdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { modo } = await getModoVisualizacao()

  if (perfil?.role !== 'admin' || modo !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">
            {modo === 'consultor'
              ? 'Você está em modo Consultor. Alterne pra Admin no header.'
              : 'Só administradores podem gerenciar o catálogo.'}
          </p>
        </div>
      </main>
    )
  }

  // Cada query em try individual pra não derrubar a página se schema tá desatualizado
  const safeCount = async (fn: () => any) => {
    try { const r = await fn(); return r.count || 0 } catch { return 0 }
  }
  const safeData = async (fn: () => any) => {
    try { const r = await fn(); return r.data || [] } catch { return [] }
  }

  const totalProdutos = await safeCount(() =>
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true))
  const totalPlacas = await safeCount(() =>
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('categoria', 'placa').eq('ativo', true))
  const totalInversores = await safeCount(() =>
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('categoria', 'inversor').eq('ativo', true))
  const emEstoque = await safeCount(() =>
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true).eq('disponivel_estoque', true))
  const comDatasheet = await safeCount(() =>
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true).not('url_datasheet', 'is', null))

  const historico = await safeData(() =>
    supabase.from('catalogo_uploads_historico')
      .select('id, tipo, arquivo_nome_original, status, produtos_atualizados, produtos_criados, erro_mensagem, created_at, processado_em')
      .order('created_at', { ascending: false })
      .limit(10))

  const produtosSemDatasheet = await safeData(() =>
    supabase.from('produtos')
      .select('id, codigo_weg, modelo, categoria, subcategoria, url_datasheet')
      .eq('ativo', true)
      .order('categoria')
      .order('modelo')
      .limit(100))

  const migrationPendente = totalProdutos > 0 && produtosSemDatasheet.length === 0

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Catálogo WEG
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Uploads de planilhas de preço, PDF de estoque e datasheets dos produtos.
          </p>
        </header>

        {migrationPendente && (
          <div className="bg-coral/10 border border-coral/30 rounded-xl p-4 mb-6">
            <p className="text-sm font-bold text-coral mb-1">⚠️ Migration pendente</p>
            <p className="text-xs text-white/70">
              Rode a Migration 016 no Supabase SQL Editor pra ativar as colunas de datasheet
              e a tabela de histórico. O botão de upload de planilha e PDF já funciona
              (só os dados adicionais ficam indisponíveis).
            </p>
          </div>
        )}

        {/* Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <Stat label="Total ativos" value={totalProdutos} />
          <Stat label="Placas" value={totalPlacas} />
          <Stat label="Inversores" value={totalInversores} />
          <Stat label="Em estoque" value={emEstoque} cor="verde" />
          <Stat label="Com datasheet" value={comDatasheet} cor="sol" />
        </div>

        <CatalogoClient
          historico={historico}
          produtos={produtosSemDatasheet}
        />
      </div>
    </main>
  )
}

function Stat({ label, value, cor }: { label: string; value: number; cor?: 'sol' | 'verde' | 'coral' }) {
  const corClass = cor === 'sol' ? 'text-sol' : cor === 'verde' ? 'text-verde' : 'text-white'
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</p>
      <p className={`text-2xl font-black ${corClass}`}>{value.toLocaleString('pt-BR')}</p>
    </div>
  )
}
