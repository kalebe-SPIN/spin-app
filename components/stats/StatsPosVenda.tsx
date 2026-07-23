import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

/**
 * Stats do modulo Pos-venda — projetos ativos + garantia.
 */
export async function StatsPosVenda() {
  const supabase = createClient()

  const safeCount = async (fn: () => any) => {
    try { const r = await fn(); return r.count || 0 } catch { return 0 }
  }

  const [instalados, emGarantia, ativosPos] = await Promise.all([
    safeCount(() => supabase.from('execucoes_servicos').select('id', { count: 'exact', head: true }).eq('status', 'entregue')),
    safeCount(() => supabase.from('execucoes_servicos').select('id', { count: 'exact', head: true }).eq('status', 'pos_venda')),
    safeCount(() => supabase.from('projetos').select('id', { count: 'exact', head: true }).eq('status', 'ativo_pos_venda')),
  ])

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={instalados} label="entregues" cor="verde" />
        <Kpi valor={emGarantia} label="em garantia" cor="azul" />
        <Kpi valor={ativosPos} label="ativos O&M" cor="sol" />
      </KpiRow>
    </div>
  )
}
