import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

/**
 * Stats do modulo CRM — clientes + leads + pipeline comercial.
 */
export async function StatsCRM() {
  const supabase = createClient()

  const safeCount = async (fn: () => any) => {
    try { const r = await fn(); return r.count || 0 } catch { return 0 }
  }

  const [totalClientes, totalLeads, propostas, negociando] = await Promise.all([
    safeCount(() => supabase.from('clientes').select('id', { count: 'exact', head: true })),
    safeCount(() => supabase.from('leads').select('id', { count: 'exact', head: true })),
    safeCount(() => supabase.from('projetos').select('id', { count: 'exact', head: true }).eq('status', 'proposta_enviada')),
    safeCount(() => supabase.from('projetos').select('id', { count: 'exact', head: true }).eq('status', 'negociando')),
  ])

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={totalClientes} label="clientes" />
        <Kpi valor={totalLeads} label="leads" cor="azul" />
        <Kpi valor={propostas + negociando} label="em negociação" cor="sol" />
      </KpiRow>
      {(propostas > 0 || negociando > 0) && (
        <StatusChips
          chips={[
            propostas > 0 ? { label: 'proposta enviada', valor: propostas, cor: 'sol' as const } : null,
            negociando > 0 ? { label: 'negociando', valor: negociando, cor: 'sol' as const } : null,
          ].filter(Boolean) as any}
        />
      )}
    </div>
  )
}
