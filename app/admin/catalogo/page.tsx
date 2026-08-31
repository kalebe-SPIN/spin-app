import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
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

  // Gate: só role admin no banco. Modo consultor NÃO bloqueia URLs diretas
  // (só esconde botões na UI). Admin sempre pode acessar tudo.
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">
            Só administradores podem gerenciar o catálogo.
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

  // Contagem por categoria — usa GROUP BY implícito lendo todos os produtos ativos.
  // Só um round-trip a mais; devolve mapa {categoria: qtd} pra exibir badges.
  const contagemPorCategoria = await safeData(() =>
    supabase.from('produtos').select('categoria').eq('ativo', true))
  const porCategoria: Record<string, number> = {}
  for (const p of (contagemPorCategoria || []) as { categoria: string }[]) {
    porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1
  }

  const historico = await safeData(() =>
    supabase.from('catalogo_uploads_historico')
      .select('id, tipo, arquivo_nome_original, status, produtos_atualizados, produtos_criados, erro_mensagem, created_at, processado_em')
      .order('created_at', { ascending: false })
      .limit(10))

  // Traz todos produtos (ativos + inativos) — cliente decide filtro.
  // Limit alto pra cobrir todo o catálogo (~500 hoje). Kalebe 2026-08-31:
  // JOIN com precos_produtos pra que o modal de edição já venha com preço
  // vigente, fabricante, descrição e códigos preenchidos.
  const produtosRaw = await safeData(() =>
    supabase.from('produtos')
      .select(`
        id, codigo_weg, codigo_interno_spin, modelo, fabricante,
        categoria, subcategoria, descricao_curta, descricao_tecnica,
        url_datasheet, url_imagem, ativo, disponivel_estoque, specs,
        precos_produtos(preco_venda, vigente_de, vigente_ate)
      `)
      .order('categoria')
      .order('modelo')
      .limit(2000))

  // Achata: escolhe o preço vigente (vigente_ate null OU futuro).
  const hojeIso = new Date().toISOString().slice(0, 10)
  const produtosSemDatasheet = (produtosRaw as any[]).map((p) => {
    const precos = Array.isArray(p.precos_produtos) ? p.precos_produtos : []
    const vigentes = precos.filter((pr: any) => !pr.vigente_ate || pr.vigente_ate >= hojeIso)
    // Pega o mais recente entre os vigentes
    vigentes.sort((a: any, b: any) => (b.vigente_de || '').localeCompare(a.vigente_de || ''))
    const preco = Number(vigentes[0]?.preco_venda) || 0
    return { ...p, preco_venda: preco, precos_produtos: undefined }
  })

  const migrationPendente = totalProdutos > 0 && produtosSemDatasheet.length === 0

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">
                Catálogo WEG
              </h1>
              <p className="text-white/60 mt-1 text-sm">
                Uploads de planilhas de preço, PDF de estoque e datasheets dos produtos.
              </p>
            </div>
            <Link
              href="/admin/precificacao/fotovoltaico"
              className="inline-flex items-center gap-2 px-3 py-2 bg-sol/10 border border-sol/30 text-sol text-xs font-bold rounded-lg hover:bg-sol/20 transition self-start md:self-auto"
              title="Faixas R$/kWp, preço médio kWh CELESC, fator perdas — usados pelo Orçamento Rápido"
            >
              ☀️ Editar precificação FV →
            </Link>
          </div>
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
          porCategoria={porCategoria}
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
