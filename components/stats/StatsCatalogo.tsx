import { createClient } from '@/lib/supabase/server'
import { Kpi, KpiRow, StatusChips } from '@/components/MiniStats'

export async function StatsCatalogo() {
  const supabase = createClient()

  const [
    { count: total },
    { count: emEstoque },
    { count: comDatasheet },
    { count: placas },
    { count: inversores },
  ] = await Promise.all([
    supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('disponivel_estoque', true),
    supabase.from('produtos').select('id', { count: 'exact', head: true }).not('url_datasheet', 'is', null),
    supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('categoria', 'placa'),
    supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('categoria', 'inversor'),
  ])

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <KpiRow>
        <Kpi valor={total || 0} label="produtos" />
        <Kpi valor={emEstoque || 0} label="em estoque" cor="verde" />
        <Kpi valor={comDatasheet || 0} label="c/ datasheet" cor="azul" />
      </KpiRow>
      <StatusChips
        chips={[
          { label: 'placas', valor: placas || 0, cor: 'sol' },
          { label: 'inversores', valor: inversores || 0, cor: 'azul' },
        ]}
      />
    </div>
  )
}
