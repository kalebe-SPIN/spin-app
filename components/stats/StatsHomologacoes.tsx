import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

export async function StatsHomologacoes() {
  const supabase = createClient()

  const { data: homologacoes } = await supabase
    .from('homologacoes')
    .select('status_geral, etapa_atual, updated_at')

  const c: Record<string, number> = {}
  for (const h of homologacoes || []) {
    c[h.status_geral] = (c[h.status_geral] || 0) + 1
  }

  const total = homologacoes?.length || 0
  const emAndamento = (c['iniciado'] || 0) + (c['em_andamento'] || 0)
  const aprovadas = c['aprovada'] || 0

  // Atrasadas: em_andamento sem update há mais de 5 dias
  const cincoDiasAtras = new Date()
  cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5)
  const atrasadas = (homologacoes || []).filter((h) =>
    ['iniciado', 'em_andamento'].includes(h.status_geral) &&
    new Date(h.updated_at) < cincoDiasAtras
  ).length

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={total} label="total" />
        <Kpi valor={emAndamento} label="ativas" cor="sol" />
        <Kpi valor={aprovadas} label="aprovadas" cor="verde" />
      </KpiRow>
      <StatusChips
        chips={[
          { label: 'atrasadas', valor: atrasadas, cor: 'coral' },
          { label: 'rejeitadas', valor: c['rejeitada'] || 0, cor: 'coral' },
        ]}
      />
    </div>
  )
}
