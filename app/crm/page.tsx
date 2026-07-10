import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModuloHub } from '@/components/ModuloHub'

export const dynamic = 'force-dynamic'

export default async function CrmHubPage() {
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
          <p className="text-white/60 text-sm mt-2">CRM é exclusivo do admin.</p>
        </div>
      </main>
    )
  }

  const [
    { count: clientes },
    { count: leads },
    { count: interacoes },
    { count: comissoesPendentes },
  ] = await Promise.all([
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('leads').select('id', { count: 'exact', head: true }).not('status', 'in', '(ganho,perdido)'),
    supabase.from('interacoes_cliente').select('id', { count: 'exact', head: true })
      .gte('data_hora', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabase.from('comissoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
  ])

  return (
    <ModuloHub
      titulo="CRM Comercial"
      icone="👥"
      descricao="Clientes, leads, comissões e metas"
      cards={[
        {
          href: '/crm/clientes',
          emoji: '🏢',
          titulo: 'Clientes',
          desc: 'Cadastro central de PF/PJ com histórico e interações.',
          stats: <MiniStat valor={clientes || 0} label="ativos" />,
        },
        {
          href: '/crm/leads',
          emoji: '🎯',
          titulo: 'Leads / Funil',
          desc: 'Pipeline de vendas em kanban por estágio.',
          stats: <MiniStat valor={leads || 0} label="ativos" cor="sol" />,
          emBreve: true,
        },
        {
          href: '/crm/interacoes',
          emoji: '💬',
          titulo: 'Interações',
          desc: 'Timeline de ligações, WhatsApp, reuniões por cliente.',
          stats: <MiniStat valor={interacoes || 0} label="nos últimos 30d" />,
          emBreve: true,
        },
        {
          href: '/crm/comissoes',
          emoji: '💵',
          titulo: 'Comissões',
          desc: 'Cálculo por consultor sobre projetos aceitos.',
          stats: <MiniStat valor={comissoesPendentes || 0} label="pendentes" cor="coral" />,
          restrito: true,
          emBreve: true,
        },
        {
          href: '/crm/metas',
          emoji: '🎯',
          titulo: 'Metas',
          desc: 'Meta mensal/trimestral de vendas por consultor.',
          restrito: true,
          emBreve: true,
        },
      ]}
    />
  )
}

function MiniStat({ valor, label, cor = 'branco' }: { valor: number; label: string; cor?: string }) {
  const cores: Record<string, string> = {
    branco: 'text-white',
    sol: 'text-sol',
    coral: 'text-coral',
    verde: 'text-verde',
  }
  return (
    <div className="mt-3 pt-2 border-t border-white/10 flex items-baseline gap-2">
      <span className={`text-xl font-black ${cores[cor]}`}>{valor}</span>
      <span className="text-[10px] uppercase text-white/50">{label}</span>
    </div>
  )
}
