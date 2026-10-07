import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

export async function StatsAgenda() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Kalebe 2026-10-07: "hoje" no horário de Brasília (o servidor roda em UTC —
  // depois das 21h o card já contava o dia seguinte)
  const hojeYMD = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const inicioHoje = new Date(`${hojeYMD}T00:00:00-03:00`)
  const fimHoje = new Date(inicioHoje.getTime() + 86400_000)
  const fimSemana = new Date(inicioHoje.getTime() + 7 * 86400_000)

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
