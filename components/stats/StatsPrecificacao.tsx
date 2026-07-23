import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow } from '@/components/MiniStats'

export async function StatsPrecificacao() {
  const supabase = createClient()

  const [
    { count: params },
    { count: faixasTotal },
    { count: faixasAtivas },
  ] = await Promise.all([
    supabase.from('parametros_precificacao_servicos').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('faixas_precificacao_servicos').select('id', { count: 'exact', head: true }),
    supabase.from('faixas_precificacao_servicos').select('id', { count: 'exact', head: true }).eq('ativo', true),
  ])

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={params || 0} label="serviços" cor="sol" />
        <Kpi valor={faixasAtivas || 0} label="faixas ativas" cor="verde" />
        <Kpi valor={faixasTotal || 0} label="total faixas" />
      </KpiRow>
    </div>
  )
}
