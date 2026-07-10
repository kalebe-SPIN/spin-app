import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

export async function StatsProjetos() {
  const supabase = createClient()
  const { data: projetos } = await supabase.from('projetos').select('status')

  const c: Record<string, number> = {}
  for (const p of projetos || []) {
    c[p.status] = (c[p.status] || 0) + 1
  }

  const total = projetos?.length || 0
  const emAndamento = (projetos || []).filter((p) =>
    !['aceito', 'recusado', 'cancelado', 'expirado'].includes(p.status),
  ).length
  const fechados = c['aceito'] || 0
  const propostaEnviada = c['proposta_enviada'] || 0

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={total} label="total" />
        <Kpi valor={emAndamento} label="em andamento" cor="sol" />
        <Kpi valor={fechados} label="aceitos" cor="verde" />
      </KpiRow>
      <StatusChips
        chips={[
          { label: 'propostas', valor: propostaEnviada, cor: 'sol' },
          { label: 'rascunho', valor: c['rascunho'] || 0, cor: 'branco' },
          { label: 'orçamento', valor: c['orcamento_gerado'] || 0, cor: 'azul' },
        ]}
      />
    </div>
  )
}
