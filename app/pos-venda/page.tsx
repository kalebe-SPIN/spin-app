import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModuloHub } from '@/components/ModuloHub'

export const dynamic = 'force-dynamic'

export default async function PosVendaHubPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hojeYMD = new Date().toISOString().slice(0, 10)
  const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const [
    { count: osAbertas },
    { count: osUrgentes },
    { count: garantiasVencendo },
  ] = await Promise.all([
    supabase.from('ordens_servico').select('id', { count: 'exact', head: true })
      .in('status', ['aberta', 'em_atendimento', 'aguardando_peca']),
    supabase.from('ordens_servico').select('id', { count: 'exact', head: true })
      .in('status', ['aberta', 'em_atendimento']).eq('prioridade', 'urgente'),
    supabase.from('garantias').select('id', { count: 'exact', head: true })
      .gte('data_fim', hojeYMD).lte('data_fim', em30dias),
  ])

  return (
    <ModuloHub
      titulo="Pós-Venda"
      icone="🛠️"
      descricao="Ordens de serviço, garantias e monitoramento"
      cards={[
        {
          href: '/pos-venda/os',
          emoji: '🎫',
          titulo: 'Ordens de Serviço',
          desc: 'Chamados de manutenção, reparo, garantia.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10 flex gap-3">
              <div><span className="text-xl font-black text-sol">{osAbertas || 0}</span><span className="text-[10px] uppercase text-white/50 ml-1">abertas</span></div>
              <div><span className="text-xl font-black text-coral">{osUrgentes || 0}</span><span className="text-[10px] uppercase text-white/50 ml-1">urgentes</span></div>
            </div>
          ),
          emBreve: true,
        },
        {
          href: '/pos-venda/garantias',
          emoji: '🛡️',
          titulo: 'Garantias',
          desc: 'Controle de prazo de garantia por módulo/inversor.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-sol">{garantiasVencendo || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">vencendo em 30d</span>
            </div>
          ),
          emBreve: true,
        },
        {
          href: '/pos-venda/monitoramento',
          emoji: '📡',
          titulo: 'Monitoramento',
          desc: 'Integração com portais WEG/Growatt/Solis.',
          emBreve: true,
        },
      ]}
    />
  )
}
