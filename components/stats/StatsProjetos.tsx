import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

export async function StatsProjetos() {
  const supabase = createClient()
  const { data: projetos } = await supabase.from('projetos').select('status')

  const c: Record<string, number> = {}
  for (const p of projetos || []) {
    c[p.status] = (c[p.status] || 0) + 1
  }

  // Projetos = trabalho TÉCNICO (até gerar orçamento). Quando proposta é emitida
  // e enviada, vira "negócio" no CRM — sai desta contagem pra evitar duplicação.
  // Ver [[project_jornada_cliente_spin]]: Orçamento Rápido → Projetos → CRM → ...
  const CRM_STATUS = ['proposta_enviada', 'negociando']
  const ENCERRADO_STATUS = ['aceito', 'recusado', 'cancelado', 'expirado']

  const total = (projetos || []).filter(p => !CRM_STATUS.includes(p.status)).length
  const emAndamentoTecnico = (projetos || []).filter((p) =>
    ![...ENCERRADO_STATUS, ...CRM_STATUS].includes(p.status),
  ).length
  const fechados = c['aceito'] || 0

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={total} label="total" />
        <Kpi valor={emAndamentoTecnico} label="em andamento" cor="sol" />
        <Kpi valor={fechados} label="aceitos" cor="verde" />
      </KpiRow>
      <StatusChips
        chips={[
          { label: 'rascunho', valor: c['rascunho'] || 0, cor: 'branco' },
          { label: 'orçamento', valor: c['orcamento_gerado'] || 0, cor: 'azul' },
        ]}
      />
    </div>
  )
}
