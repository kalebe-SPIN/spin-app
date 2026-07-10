import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

export async function StatsAgenda() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const inicioHoje = new Date()
  inicioHoje.setHours(0, 0, 0, 0)
  const fimHoje = new Date(inicioHoje)
  fimHoje.setDate(fimHoje.getDate() + 1)
  const fimSemana = new Date(inicioHoje)
  fimSemana.setDate(fimSemana.getDate() + 7)
  const hojeYMD = inicioHoje.toISOString().slice(0, 10)

  const [
    { count: eventosHoje },
    { count: eventosSemana },
    { count: tarefasPendentes },
    { count: tarefasVencidas },
    { count: tarefasUrgentes },
  ] = await Promise.all([
    supabase
      .from('agenda_eventos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', user.id)
      .gte('data_hora_inicio', inicioHoje.toISOString())
      .lt('data_hora_inicio', fimHoje.toISOString()),
    supabase
      .from('agenda_eventos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', user.id)
      .gte('data_hora_inicio', inicioHoje.toISOString())
      .lt('data_hora_inicio', fimSemana.toISOString()),
    supabase
      .from('agenda_tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', user.id)
      .eq('status', 'pendente'),
    supabase
      .from('agenda_tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', user.id)
      .eq('status', 'pendente')
      .lt('data_prazo', hojeYMD),
    supabase
      .from('agenda_tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', user.id)
      .eq('status', 'pendente')
      .eq('prioridade', 'urgente'),
  ])

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={eventosHoje || 0} label="hoje" />
        <Kpi valor={eventosSemana || 0} label="7 dias" cor="sol" />
        <Kpi valor={tarefasPendentes || 0} label="tarefas" cor="verde" />
      </KpiRow>
      <StatusChips
        chips={[
          { label: 'vencidas', valor: tarefasVencidas || 0, cor: 'coral' },
          { label: 'urgentes', valor: tarefasUrgentes || 0, cor: 'coral' },
        ]}
      />
    </div>
  )
}
