import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { METAS, MODULOS_MIN } from '@/lib/proposta-om'

/**
 * Dashboard exclusivo do vendedor_servicos.
 *
 * Duas metas independentes lado a lado:
 *   • Meta de TRABALHO (fixa global) — 3 sub-metas: telhados, contatos, propostas.
 *     Realizado calculado das tabelas telhados + interacoes_cliente.
 *   • Meta COMERCIAL (por vendedor) — R$ realizado / meta / falta / projeção.
 *     Valor da tabela metas + soma de execucoes_servicos concluídas.
 *
 * NÃO mostra Orçamento Rápido, Projetos ou Homologação.
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
  const fatorProjecao = diasNoMes / Math.max(1, diaAtual)

  // ─── Meta COMERCIAL (por vendedor) ────────────────────────────────────
  const { data: metaRow } = await supabase
    .from('metas')
    .select('meta_vendas_valor, atingido_vendas_valor')
    .eq('consultor_id', userId)
    .eq('ano', ano)
    .eq('mes', mes)
    .maybeSingle()

  const metaR = Number(metaRow?.meta_vendas_valor) || 0
  const realizadoRegistrado = Number(metaRow?.atingido_vendas_valor) || 0

  const { data: execFechadas } = await supabase
    .from('execucoes_servicos')
    .select('valor_final, data_conclusao')
    .eq('responsavel_id', userId)
    .not('data_conclusao', 'is', null)
    .gte('data_conclusao', inicioMes.toISOString())

  const realizadoR = Math.max(
    realizadoRegistrado,
    (execFechadas || []).reduce((s, e) => s + (Number(e.valor_final) || 0), 0),
  )
  const gapR = Math.max(0, metaR - realizadoR)
  const percR = metaR > 0 ? Math.min(100, Math.round((realizadoR / metaR) * 100)) : 0
  const projecaoR = realizadoR * fatorProjecao

  // Fechamentos por semana (gráfico da meta comercial)
  const porSemana: { semana: string; valor: number }[] = []
  for (let s = 0; s < Math.ceil(diasNoMes / 7); s++) porSemana.push({ semana: `S${s + 1}`, valor: 0 })
  for (const e of execFechadas || []) {
    if (!e.data_conclusao) continue
    const d = new Date(e.data_conclusao)
    const idx = Math.floor((d.getDate() - 1) / 7)
    if (porSemana[idx]) porSemana[idx].valor += Number(e.valor_final) || 0
  }

  // ─── Meta de TRABALHO (alinhada com METAS da proposta comercial) ─────
  // Fonte única de verdade em lib/proposta-om.ts — se Kalebe editar lá, o
  // dashboard segue automático. As colunas em configuracoes_empresa (mig
  // 068) ficam sem uso; podem ser dropadas depois.
  const metaTelhados = METAS.telhados
  const metaContatos = METAS.conversas
  const metaPropostas = METAS.propostas

  // Telhados cadastrados no mês — só conta os com ≥ MODULOS_MIN placas
  // (conforme regra da proposta: "telhados ≥ 50 módulos / mês")
  const { count: countTelhados } = await supabase
    .from('telhados')
    .select('*', { count: 'exact', head: true })
    .eq('vendedor_id', userId)
    .gte('qtd_placas_estimada', MODULOS_MIN)
    .gte('criado_em', inicioMes.toISOString())

  const feitoTelhados = countTelhados || 0

  // Interações registradas no mês (proxy pra "conversas com decisor")
  const { count: countContatos } = await supabase
    .from('interacoes_cliente')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .gte('data_hora', inicioMes.toISOString())

  const feitoContatos = countContatos || 0

  // "Propostas enviadas" — telhados ≥ MODULOS_MIN que chegaram em proposta ou fechado
  const { count: countPropostas } = await supabase
    .from('telhados')
    .select('*', { count: 'exact', head: true })
    .eq('vendedor_id', userId)
    .gte('qtd_placas_estimada', MODULOS_MIN)
    .in('fase', ['proposta', 'fechado'])
    .gte('criado_em', inicioMes.toISOString())

  const feitoPropostas = countPropostas || 0

  // Interações por dia (últimos 30) — gráfico da meta de trabalho
  const inicio30 = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000)
  const { data: interacoes30 } = await supabase
    .from('interacoes_cliente')
    .select('data_hora')
    .eq('usuario_id', userId)
    .gte('data_hora', inicio30.toISOString())
    .order('data_hora', { ascending: true })

  const porDia = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000)
    porDia.set(chaveDia(d), 0)
  }
  for (const it of interacoes30 || []) {
    const k = chaveDia(new Date(it.data_hora))
    if (porDia.has(k)) porDia.set(k, (porDia.get(k) || 0) + 1)
  }
  const dadosDesempenho = Array.from(porDia.entries()).map(([data, qtd]) => ({ data, qtd }))

  // Score consolidado da meta de trabalho (média das 3 barras) pro status agregado
  const percTrabalho = Math.round((
    (metaTelhados > 0 ? Math.min(1, feitoTelhados / metaTelhados) : 0) +
    (metaContatos > 0 ? Math.min(1, feitoContatos / metaContatos) : 0) +
    (metaPropostas > 0 ? Math.min(1, feitoPropostas / metaPropostas) : 0)
  ) / 3 * 100)

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Olá, <span className="text-coral">{nome.split(' ')[0]}</span>
            </h1>
            <p className="text-white/60 text-sm mt-1">
              Vendedor de serviços · {mesNome(mes)} de {ano} · {diaAtual}/{diasNoMes} dias · {diasRestantes} restantes
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

        {/* 2 BLOCOS DE META lado a lado */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ═══════════════ META DE TRABALHO ═══════════════ */}
          <div className="bg-gradient-to-br from-sol/[0.06] to-transparent border border-sol/25 rounded-2xl p-5 md:p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-sol">🏃 Meta de trabalho</p>
                <p className="text-white/50 text-xs mt-0.5">Mesmas metas descritas na proposta comercial</p>
              </div>
              <div className="text-right">
                <p className="text-3xl md:text-4xl font-black text-sol tabular-nums">{percTrabalho}%</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">consolidado</p>
              </div>
            </div>

            <div className="space-y-3">
              <SubMeta rotulo={`🏠 Telhados ≥ ${MODULOS_MIN} módulos`} feito={feitoTelhados} meta={metaTelhados} unidade="" cor="sol" />
              <SubMeta rotulo="💬 Conversas com decisor" feito={feitoContatos}  meta={metaContatos}  unidade="" cor="weg-azul" />
              <SubMeta rotulo="📄 Propostas enviadas"    feito={feitoPropostas} meta={metaPropostas} unidade="" cor="verde" />
            </div>

            {/* Gráfico interações 30d */}
            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-2">Ritmo de interações · últimos 30 dias</p>
              <GraficoBarras dados={dadosDesempenho} altura={90} corBarra="#f4d000" />
            </div>
          </div>

          {/* ═══════════════ META COMERCIAL ═══════════════ */}
          <div className="bg-gradient-to-br from-verde/[0.06] to-transparent border border-verde/25 rounded-2xl p-5 md:p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-verde">💰 Meta comercial</p>
                <p className="text-white/50 text-xs mt-0.5">R$ fechado · personalizada por vendedor</p>
              </div>
              <div className="text-right">
                {metaR > 0 ? (
                  <>
                    <p className="text-3xl md:text-4xl font-black text-verde tabular-nums">{percR}%</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">atingido</p>
                  </>
                ) : (
                  <p className="text-xs text-white/40">Sem meta</p>
                )}
              </div>
            </div>

            {/* Mini KPIs comerciais */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <MiniStat label="Realizado" valor={fmtBRL(realizadoR)} cor="text-verde" />
              <MiniStat label="Meta" valor={metaR > 0 ? fmtBRL(metaR) : '—'} cor="text-white" />
              <MiniStat
                label="Falta"
                valor={metaR > 0 ? fmtBRL(Math.max(0, gapR)) : '—'}
                cor={gapR === 0 && metaR > 0 ? 'text-verde' : 'text-coral'}
              />
              <MiniStat
                label="Projeção fim do mês"
                valor={fmtBRL(projecaoR)}
                cor={metaR > 0 && projecaoR >= metaR ? 'text-verde' : 'text-coral'}
              />
            </div>

            {/* Barra progresso R$ */}
            {metaR > 0 && (
              <div className="mb-4">
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${percR >= 100 ? 'bg-verde' : percR >= 75 ? 'bg-sol' : percR >= 40 ? 'bg-weg-azul' : 'bg-coral'}`}
                    style={{ width: `${percR}%` }}
                  />
                </div>
                <p className="text-[10px] text-white/40 mt-1 text-right">
                  {fmtBRL(realizadoR)} de {fmtBRL(metaR)} · {gapR > 0 ? `faltam ${fmtBRL(gapR)}` : '🎉 meta batida'}
                </p>
              </div>
            )}

            {/* Gráfico R$ por semana */}
            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-2">R$ fechado por semana</p>
              <GraficoBarras
                dados={porSemana.map(s => ({ data: s.semana, qtd: s.valor }))}
                altura={90}
                corBarra="#0f766e"
                formatValor={(v) => 'R$ ' + (v / 1000).toFixed(1) + 'k'}
              />
            </div>
          </div>
        </section>

        {/* Módulos operacionais (só os que fazem sentido pro vendedor) */}
        <section>
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">🎯 Meu trabalho</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ModuloCard href="/crm/servicos" icone="🎯" titulo="CRM · Prospecção" desc="Telhados avistados → fechados" />
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

function SubMeta({
  rotulo, feito, meta, unidade, cor,
}: {
  rotulo: string
  feito: number
  meta: number
  unidade: string
  cor: 'sol' | 'weg-azul' | 'verde' | 'coral'
}) {
  const perc = meta > 0 ? Math.min(100, Math.round((feito / meta) * 100)) : 0
  const cores: Record<typeof cor, { texto: string; barra: string }> = {
    sol: { texto: 'text-sol', barra: 'bg-sol' },
    'weg-azul': { texto: 'text-weg-azul', barra: 'bg-weg-azul' },
    verde: { texto: 'text-verde', barra: 'bg-verde' },
    coral: { texto: 'text-coral', barra: 'bg-coral' },
  }
  const c = cores[cor]
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm text-white/80 font-semibold">{rotulo}</p>
        <p className="text-sm tabular-nums">
          <span className={`font-black ${c.texto}`}>{feito}</span>
          <span className="text-white/40"> / {meta}{unidade}</span>
          <span className="text-white/40 text-[10px] ml-2">({perc}%)</span>
        </p>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full transition-all ${c.barra}`} style={{ width: `${perc}%` }} />
      </div>
    </div>
  )
}

function MiniStat({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2.5">
      <p className="text-[9px] uppercase tracking-wider text-white/50 font-semibold leading-tight">{label}</p>
      <p className={`text-lg font-black mt-0.5 leading-tight ${cor}`}>{valor}</p>
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
    return <div className="text-center py-6 text-xs text-white/40">Sem dados</div>
  }
  const max = Math.max(1, ...dados.map(d => d.qtd))
  const larguraBarra = 100 / dados.length
  return (
    <svg viewBox={`0 0 100 ${altura}`} preserveAspectRatio="none" className="w-full" style={{ height: altura }}>
      {dados.map((d, i) => {
        const h = (d.qtd / max) * (altura - 14)
        return (
          <g key={i}>
            <rect
              x={i * larguraBarra + 0.3}
              y={altura - h - 8}
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
      <text x="0.5" y={altura - 1} fontSize="3.5" fill="rgba(255,255,255,0.4)">{dados[0]?.data.slice(-5)}</text>
      <text x="99.5" y={altura - 1} fontSize="3.5" fill="rgba(255,255,255,0.4)" textAnchor="end">{dados[dados.length - 1]?.data.slice(-5)}</text>
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
