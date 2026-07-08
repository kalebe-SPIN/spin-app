import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { KitForm } from '@/components/KitForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function KitPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // ===== Estimar potência CC necessária =====
  // Regra: consumo médio kWh / (30 dias * 4.5 horas de sol/dia médio SC) = kWp CC
  const consumoMedio = projeto.analise_fatura?.consumo_medio_12m_kwh || projeto.analise_fatura?.consumo_mes_kwh || projeto.analise_fatura?.consumo_medio_kwh || projeto.analise_fatura?.consumo_kwh || 0
  const horasSol = 4.5  // SC média anual
  const perdas = 0.20   // 20% perdas totais
  const potCcSugeridaKwp = consumoMedio > 0
    ? (consumoMedio / (30 * horasSol * (1 - perdas)))
    : 5.0 // fallback: 5 kWp

  // ===== Buscar placas disponíveis =====
  const { data: placas } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, fabricante, descricao_curta, specs, disponivel_estoque,
      precos_produtos!inner(preco_venda, vigente_de)
    `)
    .eq('categoria', 'placa')
    .eq('ativo', true)
    .order('specs->potencia_wp', { ascending: false })

  // ===== Buscar inversores disponíveis =====
  const { data: inversores } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, fabricante, descricao_curta, specs, disponivel_estoque,
      precos_produtos!inner(preco_venda, vigente_de)
    `)
    .eq('categoria', 'inversor')
    .eq('ativo', true)
    .order('specs->potencia_kw', { ascending: true })

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Passo 6 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Escolher kit (placa + inversor)
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Sistema sugere baseado em estoque + potência necessária
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Metric label="Consumo médio" value={`${consumoMedio.toFixed(0)} kWh/mês`} />
          <Metric label="Potência CC sugerida" value={`${potCcSugeridaKwp.toFixed(2)} kWp`} highlight />
          <Metric label="Horas de sol/dia" value={`${horasSol.toFixed(1)}h`} />
          <Metric label="Perdas assumidas" value={`${(perdas * 100).toFixed(0)}%`} />
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <KitForm
            projetoId={projeto.id}
            potCcSugeridaKwp={potCcSugeridaKwp}
            placas={(placas || []) as any}
            inversores={(inversores || []) as any}
            kitSalvo={projeto.kit_selecionado}
          />
        </div>
      </div>
    </main>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-sol' : 'text-white'}`}>{value}</p>
    </div>
  )
}
