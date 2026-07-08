import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DimensionarPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  const fatura = projeto.analise_fatura
  const telhado = projeto.telhado_secoes
  const padrao = projeto.padrao_entrada

  const consumoMedio = fatura?.consumo_mes_kwh || fatura?.consumo_medio_kwh || fatura?.consumo_kwh || 0
  const horasSol = 4.5
  const perdas = 0.20
  const potCcSugeridaKwp = consumoMedio > 0
    ? (consumoMedio / (30 * horasSol * (1 - perdas)))
    : 0

  const areaTotal = (telhado || []).reduce((sum: number, s: any) => sum + (Number(s.area_m2) || 0), 0)
  const potEstruturaKwp = Math.floor(areaTotal / 5)  // ~5 m²/kWp médio
  const potLimitePadrao: number = padrao ? estimarPotenciaPadrao(padrao) : 0

  const potFinal = Math.min(
    potCcSugeridaKwp || Infinity,
    potEstruturaKwp || Infinity,
    potLimitePadrao || Infinity
  )
  const potFinalKwp = potFinal === Infinity ? 0 : potFinal

  const gargalos: Array<{ tipo: string; msg: string }> = []
  if (potEstruturaKwp && potCcSugeridaKwp > potEstruturaKwp)
    gargalos.push({ tipo: 'telhado', msg: `Área do telhado limita a ${potEstruturaKwp.toFixed(1)} kWp` })
  if (potLimitePadrao && potCcSugeridaKwp > potLimitePadrao)
    gargalos.push({ tipo: 'padrao', msg: `Padrão CELESC atual (${padrao.amperagem}A) suporta ~${potLimitePadrao.toFixed(1)} kWp — considerar upgrade` })

  const camposFaltando: string[] = []
  if (!fatura) camposFaltando.push('Passo 2: fatura')
  if (!telhado || telhado.length === 0) camposFaltando.push('Passo 3: telhado')
  if (!padrao) camposFaltando.push('Passo 4: padrão')

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
              Passo 5 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Dimensionamento consolidado
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Resumo dos dados coletados + potência CC sugerida
          </p>
        </header>

        {camposFaltando.length > 0 && (
          <div className="bg-coral/10 border border-coral/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-coral font-bold mb-1">⚠️ Dados faltando</p>
            <p className="text-xs text-white/80">
              Volte e complete: <strong>{camposFaltando.join(', ')}</strong>
            </p>
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Metric label="Consumo médio" value={consumoMedio > 0 ? `${consumoMedio.toFixed(0)} kWh/mês` : '—'} />
          <Metric label="Área telhado" value={areaTotal > 0 ? `${areaTotal.toFixed(1)} m²` : '—'} />
          <Metric label="Pot. sugerida (fatura)" value={potCcSugeridaKwp > 0 ? `${potCcSugeridaKwp.toFixed(2)} kWp` : '—'} />
          <Metric label="Pot. final recomendada" value={potFinalKwp > 0 ? `${potFinalKwp.toFixed(2)} kWp` : '—'} highlight />
        </section>

        {gargalos.length > 0 && (
          <section className="bg-sol/10 border border-sol/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-sol font-bold mb-2">🚧 Gargalos identificados</p>
            <ul className="space-y-1">
              {gargalos.map((g, i) => (
                <li key={i} className="text-xs text-white/80">
                  · <strong className="uppercase">{g.tipo}:</strong> {g.msg}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Detalhes por passo */}
        <div className="space-y-4">
          <DetalheCard titulo="🧾 Fatura (Passo 2)" ok={!!fatura} link={`/projetos/${projeto.id}/fatura`}>
            {fatura ? (
              <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                <span>Grupo: <strong>{fatura.grupo || fatura.grupo_tarifario || '—'}</strong></span>
                <span>Ligação: <strong>{formatarLigacao(fatura.tipo_ligacao)}</strong></span>
                <span>Consumo médio: <strong>{consumoMedio.toFixed(0)} kWh/mês</strong></span>
                <span>Demanda: <strong>{fatura.demanda_contratada_kw ? fatura.demanda_contratada_kw + 'kW' : '—'}</strong></span>
              </div>
            ) : (
              <p className="text-xs text-coral">Fatura não analisada ainda.</p>
            )}
          </DetalheCard>

          <DetalheCard titulo="🏠 Telhado (Passo 3)" ok={!!(telhado && telhado.length > 0)} link={`/projetos/${projeto.id}/telhado`}>
            {telhado && telhado.length > 0 ? (
              <div className="space-y-1 text-xs text-white/70">
                <p><strong>{telhado.length}</strong> seção(ões) · Área total: <strong>{areaTotal.toFixed(1)} m²</strong></p>
                <p>~ <strong>{potEstruturaKwp} kWp</strong> caberia no telhado (5 m²/kWp médio)</p>
              </div>
            ) : (
              <p className="text-xs text-coral">Telhado não desenhado ainda.</p>
            )}
          </DetalheCard>

          <DetalheCard titulo="⚡ Padrão CELESC (Passo 4)" ok={!!padrao} link={`/projetos/${projeto.id}/padrao`}>
            {padrao ? (
              <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                <span>Amperagem: <strong>{padrao.amperagem ? `${padrao.amperagem} A` : '—'}</strong></span>
                <span>Tensão: <strong>{formatarTensao(padrao.tensao_fornecimento)}</strong></span>
                <span>Ligação: <strong>{formatarLigacao(padrao.tipo_ligacao)}</strong></span>
                <span>Dist. string-QGBT: <strong>{padrao.distancia_string_qgbt_m ? `${padrao.distancia_string_qgbt_m} m` : '—'}</strong></span>
                {potLimitePadrao > 0 && (
                  <span className="col-span-2">Suporta até <strong className="text-sol">{potLimitePadrao.toFixed(1)} kWp</strong></span>
                )}
              </div>
            ) : (
              <p className="text-xs text-coral">Padrão de entrada não preenchido.</p>
            )}
          </DetalheCard>
        </div>

        {/* CTA seguir */}
        {camposFaltando.length === 0 && potFinalKwp > 0 && (
          <div className="mt-8 p-6 bg-verde/10 border border-verde/30 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-verde mb-1">✓ Tudo pronto pra escolher kit</p>
              <p className="text-xs text-white/70">
                Sistema vai sugerir kits compatíveis com <strong>{potFinalKwp.toFixed(2)} kWp</strong>.
              </p>
            </div>
            <Link
              href={`/projetos/${projeto.id}/kit`}
              className="px-5 py-3 bg-verde text-noite font-bold text-sm rounded-lg hover:bg-verde/90"
            >
              Escolher kit →
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}

function formatarTensao(v?: string): string {
  if (!v) return '—'
  const m: Record<string, string> = {
    '127_380': '127V / 380V',
    '220_380': '220V / 380V',
    '127_220': '127V / 220V',
    '220': '220V',
    '380': '380V',
  }
  return m[v] || v
}

function formatarLigacao(v?: string): string {
  if (!v) return '—'
  const m: Record<string, string> = {
    'monofasico': 'Monofásico',
    'monofásico': 'Monofásico',
    'bifasico': 'Bifásico',
    'bifásico': 'Bifásico',
    'trifasico': 'Trifásico',
    'trifásico': 'Trifásico',
  }
  return m[v.toLowerCase()] || v
}

function estimarPotenciaPadrao(padrao: any): number {
  const isTri = padrao?.tipo_ligacao?.includes('trifasico') || padrao?.tipo_ligacao?.includes('trifásico')
  const amp = Number(padrao?.amperagem) || 0
  if (!amp) return 0
  const tensao = isTri ? 380 : 220
  const fase = isTri ? Math.sqrt(3) : 1
  return (amp * tensao * fase * 0.8) / 1000  // 80% do padrão pra reserva
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-sol' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function DetalheCard({ titulo, ok, children, link }: { titulo: string; ok: boolean; children: React.ReactNode; link: string }) {
  return (
    <div className={`p-4 rounded-lg border ${ok ? 'bg-white/[0.03] border-white/10' : 'bg-coral/5 border-coral/20'}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          {titulo} {ok ? <span className="text-verde text-xs">✓</span> : <span className="text-coral text-xs">✗</span>}
        </h3>
        <Link href={link} className="text-xs text-white/40 hover:text-sol">
          Editar →
        </Link>
      </div>
      {children}
    </div>
  )
}
