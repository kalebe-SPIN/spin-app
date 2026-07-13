import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DaviChat } from '@/components/DaviChat'
import { formatarMoedaBRL } from '@/lib/formatters'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DaviPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
          <p className="text-white/60 text-sm mt-2">Davi é exclusivo do admin.</p>
        </div>
      </main>
    )
  }

  // Stats
  const dataCorte60d = new Date()
  dataCorte60d.setDate(dataCorte60d.getDate() - 60)
  const dataCorte7d = new Date()
  dataCorte7d.setDate(dataCorte7d.getDate() - 7)

  const [
    { count: totalProdutos },
    { count: comPreco },
    { count: desatualizados },
    { count: cotacoesRecentes },
    { count: solicitacoesAbertas },
    { data: ultimasCotacoes },
  ] = await Promise.all([
    supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('precos_produtos').select('id', { count: 'exact', head: true }).is('vigente_ate', null),
    supabase.from('precos_produtos').select('id', { count: 'exact', head: true })
      .is('vigente_ate', null)
      .lt('vigente_de', dataCorte60d.toISOString().slice(0, 10)),
    supabase.from('cotacoes_mercado').select('id', { count: 'exact', head: true })
      .gte('created_at', dataCorte7d.toISOString()),
    supabase.from('solicitacoes_cotacao').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
    supabase.from('cotacoes_mercado')
      .select(`
        id, preco_cotado, unidade, fornecedor_nome, cidade, uf, aplicada, data_cotacao,
        descricao_livre,
        produto:produto_id (modelo, categoria)
      `)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const semPreco = Math.max(0, (totalProdutos || 0) - (comPreco || 0))

  // Histórico chat
  const { data: conversasRaw } = await supabase
    .from('davi_conversas')
    .select('papel, conteudo, created_at')
    .eq('usuario_id', user.id)
    .eq('arquivada', false)
    .order('created_at', { ascending: false })
    .limit(20)

  const historicoChat = (conversasRaw || [])
    .slice().reverse()
    .map((c) => ({
      papel: c.papel as 'usuario' | 'davi',
      conteudo: c.conteudo,
      timestamp: c.created_at,
    }))

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← Admin
            </Link>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              👔 <span className="text-weg-azul">Davi</span> de Compras
            </h1>
            <p className="text-white/60 mt-1 text-xs">
              Auditor de preços e cotações — Tijucas/SC + região
            </p>
          </div>
        </header>

        {/* Stats compactas */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatBox valor={totalProdutos || 0} label="produtos ativos" />
          <StatBox valor={comPreco || 0} label="com preço" cor="verde" />
          <StatBox valor={semPreco} label="sem preço" cor={semPreco > 0 ? 'coral' : 'branco'} destaque={semPreco > 0} />
          <StatBox valor={desatualizados || 0} label="desatualizados (60d+)" cor={(desatualizados || 0) > 0 ? 'sol' : 'branco'} />
          <StatBox valor={solicitacoesAbertas || 0} label="solicitações abertas" cor={(solicitacoesAbertas || 0) > 0 ? 'coral' : 'branco'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chat (2/3) */}
          <div className="lg:col-span-2">
            <DaviChat historicoInicial={historicoChat} />
          </div>

          {/* Painel lateral */}
          <aside className="space-y-4">
            {/* Últimas cotações */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <h3 className="text-xs uppercase tracking-wider font-bold text-weg-azul mb-3">
                💰 Últimas cotações
              </h3>
              {!ultimasCotacoes || ultimasCotacoes.length === 0 ? (
                <p className="text-xs text-white/40">Nenhuma cotação ainda.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {ultimasCotacoes.map((c: any) => (
                    <div key={c.id} className="bg-noite/40 border border-white/5 rounded p-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-bold text-white truncate flex-1">
                          {c.produto?.modelo || c.descricao_livre || 'Item'}
                        </p>
                        {c.aplicada ? (
                          <span className="text-[9px] uppercase font-bold text-verde bg-verde/10 border border-verde/30 px-1.5 py-0.5 rounded">
                            ✓ aplicada
                          </span>
                        ) : (
                          <span className="text-[9px] uppercase font-bold text-sol bg-sol/10 border border-sol/30 px-1.5 py-0.5 rounded">
                            pendente
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-black text-weg-azul">
                        {formatarMoedaBRL(c.preco_cotado)}
                        <span className="text-[10px] text-white/40 font-normal ml-1">/ {c.unidade}</span>
                      </p>
                      <p className="text-[9px] text-white/50">
                        {c.fornecedor_nome}
                        {c.cidade && ` · ${c.cidade}/${c.uf}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cotações últimos 7d */}
            <div className="bg-weg-azul/5 border border-weg-azul/20 rounded-xl p-3 text-xs text-white/70">
              <p className="font-bold text-weg-azul mb-1">📊 Últimos 7 dias</p>
              <p>{cotacoesRecentes || 0} cotações registradas</p>
            </div>

            {/* Dicas */}
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 text-xs text-white/70">
              <p className="font-bold text-weg-azul mb-2">💡 Fala com o Davi:</p>
              <ul className="space-y-1 text-white/60">
                <li>• "Como estamos?"</li>
                <li>• "Quais produtos sem preço?"</li>
                <li>• "Cotei disjuntor 32A por R$ 38 no Cotel"</li>
                <li>• "Aplica esse preço"</li>
                <li>• "Histórico do inversor SIW300"</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function StatBox({ valor, label, cor = 'branco', destaque = false }: {
  valor: number; label: string; cor?: 'branco' | 'sol' | 'verde' | 'coral'; destaque?: boolean
}) {
  const cores = {
    branco: 'text-white',
    sol: 'text-sol',
    verde: 'text-verde',
    coral: 'text-coral',
  }
  return (
    <div className={`p-3 rounded-lg border ${
      destaque ? 'bg-coral/10 border-coral/30' : 'bg-white/[0.03] border-white/10'
    }`}>
      <p className={`text-2xl font-black ${cores[cor]}`}>{valor}</p>
      <p className="text-[9px] uppercase tracking-wider text-white/50 mt-0.5">{label}</p>
    </div>
  )
}
