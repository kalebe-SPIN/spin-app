import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModuloHub } from '@/components/ModuloHub'

export const dynamic = 'force-dynamic'

export default async function OperacoesHubPage() {
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
          <p className="text-white/60 text-sm mt-2">Operações é exclusivo do admin.</p>
        </div>
      </main>
    )
  }

  const [
    { count: fornecedores },
    { count: pedidosAbertos },
    { count: instalacoesAgendadas },
    { count: equipes },
  ] = await Promise.all([
    supabase.from('fornecedores').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('pedidos_compra').select('id', { count: 'exact', head: true }).not('status', 'in', '(recebido,cancelado)'),
    supabase.from('instalacoes').select('id', { count: 'exact', head: true }).eq('status', 'agendada'),
    supabase.from('equipes_instalacao').select('id', { count: 'exact', head: true }).eq('ativo', true),
  ])

  return (
    <ModuloHub
      titulo="Operações"
      icone="🔧"
      descricao="Fornecedores, compras, instalações e equipes"
      cards={[
        {
          href: '/operacoes/fornecedores',
          emoji: '🏭',
          titulo: 'Fornecedores',
          desc: 'WEG, distribuidoras, mão de obra terceirizada.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-white">{fornecedores || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">ativos</span>
            </div>
          ),
          emBreve: true,
        },
        {
          href: '/operacoes/compras',
          emoji: '🛒',
          titulo: 'Pedidos de Compra',
          desc: 'PO pra fornecedor com previsão de entrega.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-sol">{pedidosAbertos || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">em aberto</span>
            </div>
          ),
          restrito: true,
          emBreve: true,
        },
        {
          href: '/operacoes/instalacoes',
          emoji: '🔩',
          titulo: 'Instalações',
          desc: 'Cronograma de instalação por equipe e cliente.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-sol">{instalacoesAgendadas || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">agendadas</span>
            </div>
          ),
          emBreve: true,
        },
        {
          href: '/operacoes/equipes',
          emoji: '👷',
          titulo: 'Equipes',
          desc: 'Grupos de instaladores + funções.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-white">{equipes || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">ativas</span>
            </div>
          ),
          restrito: true,
          emBreve: true,
        },
      ]}
    />
  )
}
