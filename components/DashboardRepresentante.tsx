import Link from 'next/link'
import { fmtNum } from '@/lib/formatters'
import type { DashboardRepresentante as DashboardData, PortfolioSegmento } from '@/lib/representante-agregacoes'

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR')

const SEGMENTO_LABEL: Record<PortfolioSegmento['segmento'], { label: string; emoji: string }> = {
  residencial:    { label: 'Residencial',       emoji: '🏠' },
  comercial:      { label: 'Comercial',         emoji: '🏢' },
  usina:          { label: 'Usina',             emoji: '⚡' },
  carregador:     { label: 'Carregador VE',     emoji: '🔌' },
  om_avulso:      { label: 'Pacote O&M',        emoji: '🛠' },
  servico_avulso: { label: 'Serviço avulso',    emoji: '🔧' },
  outro:          { label: 'Outros',            emoji: '📦' },
}

const ORIGEM_LABEL: Record<string, string> = {
  base_repassada: 'Base repassada · 0,85×',
  lead_spin: 'Lead Spin · 1,00×',
  aquecimento_1: 'Aquecimento 1 · 1,15×',
  lead_verba: 'Lead de campanha · 1,15×',
  aquecimento_2: 'Aquecimento 2 · 1,25×',
  indicacao: 'Indicação · 1,25×',
  prospeccao: 'Prospecção própria · 1,35×',
  resgate: 'Resgate · 1,35×',
}

export function DashboardRepresentante({ dados }: { dados: DashboardData }) {
  const totalAnual = dados.total_mes * 12

  return (
    <div className="space-y-6">
      {/* HEADER — Meu ganho no mês */}
      <section className="bg-gradient-to-br from-sol/[0.08] to-transparent border border-sol/25 rounded-2xl p-6 md:p-8">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-sol font-black">Meu ganho no mês</p>
            <h1 className="text-4xl md:text-5xl font-black text-white leading-none mt-2">
              R$ {fmt(dados.total_mes)}
            </h1>
            <p className="text-white/50 text-sm mt-2">
              Projeção anualizada: <span className="text-white/80 font-mono">R$ {fmtInt(totalAnual)}</span>
            </p>
          </div>
          <div className="text-right">
            <span className={`text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full ${
              dados.nivel === 'Master' ? 'bg-sol text-noite'
              : dados.nivel === 'Sênior' ? 'bg-verde/20 text-verde border border-verde/40'
              : 'bg-white/10 text-white/70 border border-white/20'
            }`}>
              {dados.nivel}
            </span>
            <p className="text-xs text-white/40 mt-2">Nível atual</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <MetricGain label="Comissão bruta" valor={dados.comissao_bruta_mes} destaque />
          <MetricGain label="Bônus anexação O&M" valor={dados.bonus_anexacao_mes} />
          <MetricGain label="Anuidade carteira" valor={dados.anuidade_mensal} />
          <MetricGain label="Retirada fixa" valor={dados.retirada_fixa} />
          <MetricGain label="Verba de apoio" valor={dados.verba_apoio} />
        </div>
      </section>

      {/* BLOCO A — Acelerador ao vivo */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Acelerador</p>
            <h2 className="text-lg font-bold text-white">Volume do mês · faixa atual</h2>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-sol">{dados.acelerador_mult.toFixed(2)}×</p>
            <p className="text-xs text-white/40">multiplicador médio</p>
          </div>
        </div>
        <FaixasAcelerador volumeMes={dados.volume_mes} />
        <div className="mt-3 text-xs text-white/60">
          <span className="font-mono text-white">R$ {fmt(dados.volume_mes)}</span> acumulados este mês ·
          {dados.faixa_atual.proxima_mult
            ? <> faltam <span className="font-mono text-sol">R$ {fmt(dados.faixa_atual.falta_ate_proxima)}</span> pra faixa {dados.faixa_atual.proxima_mult.toFixed(2)}×</>
            : <> na faixa máxima</>}
        </div>
      </section>

      {/* BLOCO B — Portfolio segmentado */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Portfólio do mês</p>
            <h2 className="text-lg font-bold text-white">Vendas por segmento</h2>
          </div>
          <Link href="/projetos?status=vendido" className="text-xs text-sol hover:underline">
            ver todas →
          </Link>
        </div>
        {dados.portfolio.length === 0 ? (
          <p className="text-sm text-white/40 py-8 text-center">Nenhuma venda fechada este mês ainda.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {dados.portfolio.map(p => (
              <CardSegmento key={p.segmento} p={p} />
            ))}
          </div>
        )}
      </section>

      {/* BLOCO C — Carteira recorrente */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Carteira recorrente</p>
            <h2 className="text-lg font-bold text-white">MRR acumulado</h2>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-sol">R$ {fmt(dados.mrr_carteira)}<span className="text-sm text-white/50">/mês</span></p>
            <p className="text-xs text-white/40">anuidade {(dados.faixa_anuidade.pct * 100).toFixed(0)}% → R$ {fmt(dados.anuidade_mensal)}/mês</p>
          </div>
        </div>
        {dados.faixa_anuidade.proxima_pct !== null && (
          <p className="text-xs text-white/60 mt-3">
            Faltam <span className="font-mono text-sol">R$ {fmt(dados.faixa_anuidade.falta_ate_proxima)}/mês</span> de carteira pra subir pra {(dados.faixa_anuidade.proxima_pct * 100).toFixed(0)}% de anuidade
          </p>
        )}
      </section>

      {/* BLOCO D — Breakdown por origem */}
      {dados.breakdown_origem.length > 0 && (
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Últimos 30 dias</p>
            <h2 className="text-lg font-bold text-white">Vendas por origem do lead</h2>
          </div>
          <div className="space-y-2">
            {dados.breakdown_origem.sort((a, b) => b.comissao_estimada - a.comissao_estimada).map(o => (
              <div key={o.origem} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-white text-sm">{ORIGEM_LABEL[o.origem] || o.origem}</span>
                  <span className="text-xs text-white/40">{o.qtd} venda(s)</span>
                </div>
                <span className="text-sol font-mono text-sm">R$ {fmt(o.comissao_estimada)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/40 mt-4">
            Prospecção rende 35% mais que lead Spin. Cadastrar um lead como "prospecção" só é permitido quando você mesmo trouxe o contato — leads distribuídos pelo sistema já vêm com a origem correta.
          </p>
        </section>
      )}

      {/* BLOCO E — Próximo nível */}
      {dados.progresso_proximo_nivel && (
        <section className="bg-white/[0.03] border border-sol/20 rounded-xl p-6">
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-sol font-bold">Próximo nível</p>
            <h2 className="text-lg font-bold text-white">
              Rumo a <span className="text-sol">{dados.progresso_proximo_nivel.proximo}</span>
            </h2>
          </div>
          <div className="space-y-3">
            {dados.progresso_proximo_nivel.criterios.map((c, i) => {
              const pct = c.alvo > 0 ? Math.min(100, (c.atingido / c.alvo) * 100) : 0
              return (
                <div key={i}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className={c.ok ? 'text-verde font-semibold' : 'text-white/70'}>
                      {c.ok ? '✓' : '○'} {c.label}
                    </span>
                    <span className="text-white/60 font-mono">
                      {c.unidade === 'R$/mês' ? `R$ ${fmt(c.atingido)}` : c.atingido} / {c.unidade === 'R$/mês' ? `R$ ${fmtInt(c.alvo)}` : c.alvo}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${c.ok ? 'bg-verde' : 'bg-sol/60'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function MetricGain({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${destaque ? 'bg-sol/10 border-sol/30' : 'bg-white/[0.03] border-white/10'}`}>
      <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold mb-1">{label}</p>
      <p className={`font-mono font-bold ${destaque ? 'text-sol text-base' : 'text-white text-sm'}`}>
        R$ {fmt(valor)}
      </p>
    </div>
  )
}

function CardSegmento({ p }: { p: PortfolioSegmento }) {
  const info = SEGMENTO_LABEL[p.segmento]
  return (
    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{info.emoji}</span>
        <span className="text-xs text-white/70 font-semibold">{info.label}</span>
      </div>
      <p className="text-2xl font-black text-white leading-none">{p.qtd_vendas}</p>
      <p className="text-[10px] text-white/40 mt-1">venda(s)</p>
      <div className="mt-3 pt-3 border-t border-white/5">
        <p className="text-[10px] uppercase tracking-wider text-white/40">Volume</p>
        <p className="text-white font-mono text-xs">R$ {fmt(p.volume)}</p>
        <p className="text-[10px] uppercase tracking-wider text-sol mt-2">Comissão est.</p>
        <p className="text-sol font-mono text-xs font-bold">R$ {fmt(p.comissao_estimada)}</p>
        <p className="text-[9px] text-white/40 mt-0.5">{fmtNum(p.taxa_media_pct, 2)}% médio</p>
      </div>
    </div>
  )
}

function FaixasAcelerador({ volumeMes }: { volumeMes: number }) {
  const FAIXAS = [
    { ate: 50000, label: 'Até 50k', mult: 1.0 },
    { ate: 100000, label: '50–100k', mult: 1.1 },
    { ate: 200000, label: '100–200k', mult: 1.2 },
    { ate: 400000, label: '200–400k', mult: 1.3 },
    { ate: 800000, label: '+400k', mult: 1.4 },
  ]
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {FAIXAS.map((f, i) => {
        const inferiorLimite = i === 0 ? 0 : FAIXAS[i - 1].ate
        const dentro = volumeMes >= inferiorLimite
        const passou = volumeMes >= f.ate
        const preenchimento = passou ? 100 : dentro ? ((volumeMes - inferiorLimite) / (f.ate - inferiorLimite)) * 100 : 0
        return (
          <div key={i}>
            <div className="h-2 bg-white/5 rounded overflow-hidden">
              <div className="h-full bg-sol transition-all" style={{ width: `${preenchimento}%` }} />
            </div>
            <p className={`text-[10px] mt-1 font-mono text-center ${dentro ? 'text-sol font-bold' : 'text-white/40'}`}>
              {f.label} · {f.mult.toFixed(1)}×
            </p>
          </div>
        )
      })}
    </div>
  )
}
