import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

/**
 * Stats do modulo Operacoes — pipeline execucoes.
 */
export async function StatsOperacoes() {
  const supabase = createClient()

  const safeCount = async (fn: () => any) => {
    try { const r = await fn(); return r.count || 0 } catch { return 0 }
  }

  const hoje = new Date().toISOString().slice(0, 10)

  const [total, agendadas, emExecucao, entregues, atrasadas] = await Promise.all([
    safeCount(() => supabase.from('execucoes_servicos').select('id', { count: 'exact', head: true }).neq('status', 'cancelado')),
    safeCount(() => supabase.from('execucoes_servicos').select('id', { count: 'exact', head: true }).eq('status', 'agendado')),
    safeCount(() => supabase.from('execucoes_servicos').select('id', { count: 'exact', head: true }).in('status', ['em_execucao', 'preparando_material'])),
    safeCount(() => supabase.from('execucoes_servicos').select('id', { count: 'exact', head: true }).eq('status', 'entregue')),
    // Atrasadas: data_agendada < hoje e ainda nao concluido
    safeCount(() => supabase.from('execucoes_servicos')
      .select('id', { count: 'exact', head: true })
      .lt('data_agendada', hoje)
      .in('status', ['agendado', 'preparando_material', 'em_execucao'])
    ),
  ])

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={total} label="total" />
        <Kpi valor={emExecucao} label="em execução" cor="coral" />
        <Kpi valor={entregues} label="entregues" cor="verde" />
      </KpiRow>
      {(agendadas > 0 || atrasadas > 0) && (
        <StatusChips
          chips={[
            agendadas > 0 ? { label: 'agendadas', valor: agendadas, cor: 'sol' as const } : null,
            atrasadas > 0 ? { label: 'atrasadas', valor: atrasadas, cor: 'coral' as const } : null,
          ].filter(Boolean) as any}
        />
      )}
    </div>
  )
}
