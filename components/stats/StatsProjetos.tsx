import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'
import { STATUS_FECHADOS } from '@/lib/dashboard/regras'

// Mesmas regras de /dashboard/lista (lib/dashboard/listas.ts)
const ANTES_DA_PROPOSTA = ['rascunho', 'fatura_analisada', 'telhado_preenchido', 'dimensionado', 'kit_selecionado', 'lista_ca_confirmada', 'orcamento_gerado']
const lista = (m: string) => `/dashboard/lista?m=${m}`

export async function StatsProjetos() {
  const supabase = createClient()
  // Kalebe 2026-10-06: sem os excluídos (igual à lista de projetos)
  const { data: projetos } = await supabase.from('projetos').select('status').is('excluida_em', null).limit(10000)

  const c: Record<string, number> = {}
  for (const p of projetos || []) {
    c[p.status] = (c[p.status] || 0) + 1
  }

  // Kalebe 2026-10-06: cada número abre a lista do que conta. "aceitos" só
  // contava o status legado 'aceito' (o fechamento grava 'vendido') → vendidos.
  const total = (projetos || []).length
  const emAndamento = (projetos || []).filter((p) => ANTES_DA_PROPOSTA.includes(p.status)).length
  const vendidos = (projetos || []).filter((p) => STATUS_FECHADOS.includes(p.status)).length

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={total} label="total" href={lista('projetos_todos')} />
        <Kpi valor={emAndamento} label="em andamento" cor="sol" href={lista('projetos_andamento')} />
        <Kpi valor={vendidos} label="vendidos" cor="verde" href={lista('projetos_vendidos')} />
      </KpiRow>
      <StatusChips
        chips={[
          { label: 'rascunho', valor: c['rascunho'] || 0, cor: 'branco', href: lista('projetos_rascunho') },
          { label: 'orçamento', valor: c['orcamento_gerado'] || 0, cor: 'azul', href: lista('projetos_orcamento') },
        ]}
      />
    </div>
  )
}
