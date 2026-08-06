import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

/**
 * Dashboard exclusivo do vendedor_servicos.
 * Foco: desempenho de trabalho + resultado do mês + gap pra meta.
 * NÃO mostra Orçamento Rápido, Projetos ou Homologação (não são dele).
 */
export async function DashboardVendedorServicos({ userId, nome }: { userId: string; nome: string }) {
  const supabase = createClient()
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth() + 1
  const inicioMes = new Date(ano, hoje.getMonth(), 1)
  const fimMes = new Date(ano, hoje.getMonth() + 1, 0)
  const diasNoMes = fimMes.getDate()
  const diaAtual = hoje.getDate()
  const diasRestantes = Math.max(0, diasNoMes - diaAtual)

  // Meta do mês (se existir)
  const { data: metaRow } = await supabase
    .from('metas')
    .select('meta_vendas_valor, atingido_vendas_valor')
    .eq('consultor_id', userId)
    .eq('ano', ano)
    .eq('mes', mes)
    .maybeSingle()

  const meta = Number(metaRow?.meta_vendas_valor) || 0
  const realizadoRegistrado = Number(metaRow?.atingido_vendas_valor) || 0

  // Interações do usuário nos últimos 30 dias (pro gráfico de desempenho)
  const inicio30 = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000)
  const { data: interacoes } = await supabase
    .from('interacoes_cliente')
    .select('tipo, data_hora')
    .eq('usuario_id', userId)
    .gte('data_hora', inicio30.toISOString())
    .order('data_hora', { ascending: true })

  // Execuções fechadas do vendedor no mês (pro realizado on-the-fly)
  const { data: execFechadas } = await supabase
    .from('execucoes_servicos')
    .select('valor_final, data_conclusao, responsavel_id')
    .eq('responsavel_id', userId)
    .not('data_conclusao', 'is', null)
    .gte('data_conclusao', inicioMes.toISOString())

  const realizadoCalc = (execFechadas || []).reduce((s, e) => s + (Number(e.valor_final) || 0), 0)
  const realizado = Math.max(realizadoRegistrado, realizadoCalc)
  const gap = Math.max(0, meta - realizado)
  const perc = meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : 0
  const ritmoDiario = realizado / Math.max(1, diaAtual)
  const projecaoFimMes = ritmoDiario * diasNoMes
  const noRitmo = meta > 0 ? projecaoFimMes >= meta : null

  // Agrupa interações por dia (últimos 30) — desempenho de trabalho
  const porDia = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000)
    porDia.set(chaveDia(d), 0)
  }
  for (const it of interacoes || []) {
    const k = chaveDia(new Date(it.data_hora))
    if (porDia.has(k)) porDia.set(k, (porDia.get(k) || 0) + 1)
  }
  const dadosDesempenho = Array.from(porDia.entries()).map(([data, qtd]) => ({ data, qtd }))
  const totalAtividades30d = dadosDesempenho.reduce((s, d) => s + d.qtd, 0)
  const mediaAtividadesDia = totalAtividades30d / 30

  // Agrupa fechamentos por semana do mês — resultado comercial
  const porSemana: { semana: string; valor: number }[] = []
  for (let s = 0; s < Math.ceil(diasNoMes / 7); s++) {
    porSemana.push({ semana: `S${s + 1}`, valor: 0 })
  }
  for (const e of execFechadas || []) {
    if (!e.data_conclusao) continue
    const d = new Date(e.data_conclusao)
    const semana = Math.floor((d.getDate() - 1) / 7)
    if (porSemana[semana]) porSemana[semana].valor += Number(e.valor_final) || 0
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Olá, <span className="text-coral">{nome.split(' ')[0]}</span>
            </h1>
            <p className="text-white/60 text-sm mt-1">
              Vendedor de serviços · {mesNome(mes)} de {ano}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/conta" className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white hover:bg-white/10 transition">
              Minha conta
            </Link>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="px-3 py-1.5 text-xs text-white/60 hover:text-coral transition">Sair</button>
            </form>
          </div>
        </header>

        {/* KPIs — resultado + gap */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Realizado no mês" valor={fmtBRL(realizado)} cor="text-verde" hint={`${diaAtual} de ${diasNoMes} dias`} />
          <Kpi
            label="Meta do mês"
            valor={meta > 0 ? fmtBRL(meta) : 'Sem meta'}
            cor={meta > 0 ? 'text-sol' : 'text-white/40'}
            hint={meta === 0 ? 'Peça ao admin pra definir' : `${perc}% atingido`}
          />
          <Kpi
            label="Falta"
            valor={meta > 0 ? fmtBRL(gap) : '—'}
            cor={gap === 0 && meta > 0 ? 'text-verde' : 'text-coral'}
            hint={meta > 0 ? (gap === 0 ? '🎉 meta batida' : `${diasRestantes} dias restantes`) : ''}
          />
          <Kpi
            label="Projeção fim do mês"
            valor={meta > 0 ? fmtBRL(projecaoFimMes) : '—'}
            cor={noRitmo === true ? 'text-verde' : noRitmo === false ? 'text-coral' : 'text-white/40'}
            hint={noRitmo === true ? '✓ no ritmo' : noRitmo === false ? '⚠ abaixo do ritmo' : ''}
          />
        </section>

        {/* Barra de progresso da meta */}
        {meta > 0 && (
          <section className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs uppercase tracking-wider font-bold text-sol">Progresso da meta</p>
              <p className="text-xs text-white/60">
                <span className="text-verde font-bold">{fmtBRL(realizado)}</span> de {fmtBRL(meta)}
              </p>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${perc >= 100 ? 'bg-verde' : perc >= 75 ? 'bg-sol' : perc >= 40 ? 'bg-weg-azul' : 'bg-coral'}`}
                style={{ width: `${perc}%` }}
              />
            </div>
            <p className="text-[10px] text-white/40 mt-1.5 text-right">{perc}%</p>
          </section>
        )}

        {/* 2 GRÁFICOS lado a lado */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Desempenho de trabalho */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-wider font-bold text-sol">📞 Desempenho de trabalho</p>
              <p className="text-[10px] text-white/50 mt-0.5">
                Atividades por dia · últimos 30 dias · média {mediaAtividadesDia.toFixed(1)}/dia
              </p>
            </div>
            <GraficoBarras dados={dadosDesempenho} altura={140} corBarra="#f4d000" />
            <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-white/50 flex justify-between">
              <span>Total 30d: <strong className="text-white/80">{totalAtividades30d}</strong></span>
              <span>Ontem: <strong className="text-white/80">{dadosDesempenho[dadosDesempenho.length - 2]?.qtd || 0}</strong></span>
              <span>Hoje: <strong className="text-sol">{dadosDesempenho[dadosDesempenho.length - 1]?.qtd || 0}</strong></span>
            </div>
          </div>

          {/* Resultado comercial */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-wider font-bold text-sol">💰 Resultado comercial</p>
              <p className="text-[10px] text-white/50 mt-0.5">
                R$ fechado por semana · {mesNome(mes)}/{ano}
              </p>
            </div>
            <GraficoBarras
              dados={porSemana.map(s => ({ data: s.semana, qtd: s.valor }))}
              altura={140}
              corBarra="#0f766e"
              formatValor={(v) => 'R$ ' + (v / 1000).toFixed(1) + 'k'}
            />
            <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-white/50 flex justify-between">
              <span>Ritmo diário: <strong className="text-verde">{fmtBRL(ritmoDiario)}</strong></span>
              <span>Projeção: <strong className="text-white/80">{fmtBRL(projecaoFimMes)}</strong></span>
            </div>
          </div>
        </section>

        {/* Módulos operacionais (só os que fazem sentido pro vendedor) */}
        <section>
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">🎯 Meu trabalho</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ModuloCard href="/crm/pipeline" icone="🎯" titulo="CRM" desc="Meus clientes e propostas" />
            <ModuloCard href="/execucoes"    icone="🔨" titulo="Operações" desc="Serviços contratados" />
            <ModuloCard href="/pos-venda"    icone="🛠️" titulo="Pós-venda" desc="OS e garantias" />
            <ModuloCard href="/agenda"       icone="📅" titulo="Agenda" desc="Compromissos do dia" />
          </div>
        </section>
      </div>
    </main>
  )
}

// ═════════════════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═════════════════════════════════════════════════════════════════════

function Kpi({ label, valor, cor, hint }: { label: string; valor: string; cor: string; hint?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">{label}</p>
      <p className={`text-2xl md:text-3xl font-black mt-1 ${cor}`}>{valor}</p>
      {hint && <p className="text-[10px] text-white/40 mt-0.5">{hint}</p>}
    </div>
  )
}

function ModuloCard({ href, icone, titulo, desc }: { href: string; icone: string; titulo: string; desc: string }) {
  return (
    <Link
      href={href}
      className="bg-white/[0.03] border border-white/10 hover:border-sol/40 hover:bg-white/[0.06] rounded-xl p-4 transition"
    >
      <div className="text-2xl mb-2">{icone}</div>
      <p className="text-sm font-bold text-white">{titulo}</p>
      <p className="text-[10px] text-white/50 mt-0.5">{desc}</p>
    </Link>
  )
}

/** Gráfico de barras em SVG puro (sem dependência de biblioteca). */
function GraficoBarras({
  dados, altura, corBarra, formatValor,
}: {
  dados: { data: string; qtd: number }[]
  altura: number
  corBarra: string
  formatValor?: (v: number) => string
}) {
  if (dados.length === 0) {
    return <div className="text-center py-8 text-xs text-white/40">Sem dados</div>
  }
  const max = Math.max(1, ...dados.map(d => d.qtd))
  const larguraBarra = 100 / dados.length
  return (
    <svg viewBox={`0 0 100 ${altura}`} preserveAspectRatio="none" className="w-full" style={{ height: altura }}>
      {dados.map((d, i) => {
        const h = (d.qtd / max) * (altura - 20)
        return (
          <g key={i}>
            <rect
              x={i * larguraBarra + 0.3}
              y={altura - h - 12}
              width={larguraBarra - 0.6}
              height={h}
              fill={corBarra}
              opacity={d.qtd === 0 ? 0.15 : 0.85}
              rx="0.5"
            >
              <title>{d.data}: {formatValor ? formatValor(d.qtd) : d.qtd}</title>
            </rect>
          </g>
        )
      })}
      {/* Labels do primeiro/último dia */}
      <text x="0.5" y={altura - 2} fontSize="4" fill="rgba(255,255,255,0.4)">{dados[0]?.data.slice(-5)}</text>
      <text x="99.5" y={altura - 2} fontSize="4" fill="rgba(255,255,255,0.4)" textAnchor="end">{dados[dados.length - 1]?.data.slice(-5)}</text>
    </svg>
  )
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function mesNome(mes: number): string {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes - 1]
}
