'use client'

import { useMemo, useState } from 'react'
import {
  FIXO_MENSAL, GARANTIA_ESCALONADA, calcularComissao, MULTIPLICADOR_PCT,
} from '@/lib/proposta-om'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Periodo = 'mes1' | 'mes2' | 'mes3' | 'regime'

// Faixas para a coluna visual (do piso ao topo). O topo (20%) é limitado a
// COL_MAX só para desenho; acima disso a faixa aparece cheia.
const COL_MAX = 125000
const FAIXA_VIS = [
  { min: 0,     max: 15000,   pct: 0,    cor: '#6B7280', label: 'Até R$ 15.000',   sub: 'sem comissão' },
  { min: 15000, max: 30000,   pct: 0.10, cor: '#FFD64A', label: 'R$ 15k – 30k',    sub: '10%' },
  { min: 30000, max: 50000,   pct: 0.14, cor: '#F5B400', label: 'R$ 30k – 50k',    sub: '14%' },
  { min: 50000, max: 75000,   pct: 0.18, cor: '#4EDC8A', label: 'R$ 50k – 75k',    sub: '18%' },
  { min: 75000, max: COL_MAX, pct: 0.20, cor: '#4EA8DE', label: 'Acima de R$ 75k', sub: '20%' },
]

/**
 * Simulador de ganhos.
 *
 * Regra do garantido (meses 1-3) = SEGURO MÍNIMO, não soma:
 *   rendimento normal = base (R$ 2.000) + comissão + bônus
 *   nos 3 primeiros meses o vendedor recebe o MAIOR entre o garantido do mês e
 *   o rendimento normal. Cumprida a meta, garantido integral; senão, proporcional.
 *   No regime não há garantido — recebe base + comissão + bônus.
 */
export function SimuladorGanhos() {
  const [periodo, setPeriodo] = useState<Periodo>('mes1')
  const [metaPct, setMetaPct] = useState(100)
  const [faturamento, setFaturamento] = useState(100000)
  const [fatProsp, setFatProsp] = useState(0)

  const isExp = periodo !== 'regime'
  const garantidoMes = useMemo(() => {
    if (periodo === 'regime') return 0
    const idx = periodo === 'mes1' ? 0 : periodo === 'mes2' ? 1 : 2
    return GARANTIA_ESCALONADA[idx].valor
  }, [periodo])

  const bateuMeta = metaPct >= 100
  const superou = metaPct > 100
  const metaFrac = Math.min(1, metaPct / 100)

  const com = useMemo(() => calcularComissao(faturamento), [faturamento])

  // Segmentos da coluna: quanto de cada faixa a simulação alcançou
  const segs = useMemo(() => FAIXA_VIS.map((s) => {
    const alcancado = Math.max(0, Math.min(faturamento, s.max) - s.min)
    return {
      ...s,
      fillFrac: Math.max(0, Math.min(1, alcancado / (s.max - s.min))),
      valor: alcancado * s.pct,
      pesoAltura: s.max - s.min,
    }
  }), [faturamento])

  const bonus = useMemo(() => {
    if (!superou || fatProsp <= 0) return 0
    const prosp = Math.min(fatProsp, faturamento)
    const comTopo = com.total - calcularComissao(faturamento - prosp).total
    return Math.max(0, comTopo * MULTIPLICADOR_PCT)
  }, [superou, fatProsp, faturamento, com.total])

  const baseEfetiva = Math.round(FIXO_MENSAL * metaFrac)
  const rendimentoNormal = baseEfetiva + com.total + bonus
  const pisoSeguro = isExp ? Math.round(garantidoMes * metaFrac) : 0
  const seguroAcionado = isExp && pisoSeguro > rendimentoNormal
  const total = Math.max(pisoSeguro, rendimentoNormal)

  const periodos: { v: Periodo; label: string }[] = [
    { v: 'mes1', label: 'Mês 1' },
    { v: 'mes2', label: 'Mês 2' },
    { v: 'mes3', label: 'Mês 3' },
    { v: 'regime', label: 'Regime' },
  ]

  return (
    <div className="rounded-2xl border border-sol/30 bg-gradient-to-br from-sol/[0.07] to-transparent overflow-hidden">
      <div className="px-5 md:px-6 py-4 border-b border-white/10">
        <p className="text-sol font-black text-lg">🧮 Simulador de ganhos</p>
        <p className="text-white/55 text-sm">Mexa nos campos e veja quanto você recebe naquele mês.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 p-5 md:p-6">
        {/* ENTRADAS */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Período</label>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {periodos.map((p) => (
                <button
                  key={p.v}
                  onClick={() => setPeriodo(p.v)}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                    periodo === p.v ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-1.5">
              Base fixa: <strong className="text-white/70">{brl(FIXO_MENSAL)}</strong>
              {isExp && <> · seguro mínimo do mês: <strong className="text-white/70">{brl(garantidoMes)}</strong></>}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Cumprimento da meta de trabalho</label>
              <span className={`text-sm font-black ${bateuMeta ? 'text-verde' : 'text-coral'}`}>{metaPct}%</span>
            </div>
            <input
              type="range" min={0} max={120} step={5}
              value={metaPct} onChange={(e) => setMetaPct(Number(e.target.value))}
              className="w-full mt-2 accent-[#F5B400]"
            />
            <p className="text-[11px] mt-1 leading-snug">
              {superou
                ? <span className="text-verde">Superou a meta ✓ — bônus de prospecção liberado</span>
                : bateuMeta
                  ? <span className="text-verde">Meta batida ✓ — base e seguro integrais</span>
                  : <span className="text-coral">Abaixo da meta — base e seguro proporcionais ao entregue</span>}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Resultado de venda (faturamento recebido no mês)</label>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-white/40 text-sm">R$</span>
              <input
                type="number" min={0} step={1000} value={faturamento}
                onChange={(e) => setFaturamento(Math.max(0, Number(e.target.value)))}
                className="input-spin flex-1"
              />
            </div>
          </div>

          {superou && (
            <div>
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                Desse valor, quanto veio de prospecção sua <span className="text-sol">após bater a meta</span> (bônus +30%)
              </label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-white/40 text-sm">R$</span>
                <input
                  type="number" min={0} max={faturamento} step={1000} value={fatProsp}
                  onChange={(e) => setFatProsp(Math.max(0, Math.min(faturamento, Number(e.target.value))))}
                  className="input-spin flex-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* RESULTADO */}
        <div className="rounded-xl bg-noite-0/60 border border-white/10 p-5 flex flex-col">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Seu rendimento no mês</p>

          <Linha rotulo={bateuMeta ? 'Base fixa' : `Base (${metaPct}% da meta)`} valor={baseEfetiva} />

          {/* Comissão — coluna vertical (vibrante até onde chegou, opaco acima) + legenda */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-white/70">Comissão por faixa</span>
              <span className="text-white font-semibold">{brl(com.total)}</span>
            </div>
            <div className="flex gap-4">
              {/* Coluna */}
              <div className="flex flex-col-reverse w-11 shrink-0 rounded-lg overflow-hidden" style={{ height: 220 }}>
                {segs.map((s, i) => (
                  <div
                    key={i}
                    className="relative w-full"
                    style={{ flexGrow: s.pesoAltura, background: `${s.cor}22`, borderTop: i > 0 ? '1px solid rgba(0,0,0,0.35)' : undefined }}
                    title={`${s.label} · ${brl(s.valor)}`}
                  >
                    <div className="absolute inset-x-0 bottom-0" style={{ height: `${s.fillFrac * 100}%`, background: s.cor }} />
                  </div>
                ))}
              </div>
              {/* Legenda (topo → base, alinhada às cores da coluna) */}
              <div className="flex-1 flex flex-col-reverse justify-between py-0.5">
                {segs.filter((s) => s.pct > 0).map((s, i) => {
                  const ativa = s.fillFrac > 0
                  return (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className={`flex items-center gap-2 text-xs ${ativa ? 'text-white/75' : 'text-white/30'}`}>
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.cor, opacity: ativa ? 1 : 0.35 }} />
                        {s.label} · {s.sub}
                      </span>
                      <span className={`text-xs font-semibold ${ativa ? 'text-white' : 'text-white/30'}`}>{brl(s.valor)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {bonus > 0 && <div className="mt-3"><Linha rotulo="Bônus prospecção (+30%)" valor={bonus} cor="text-sol" /></div>}

          {/* Seguro mínimo (meses 1-3) */}
          {isExp && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-white/70 flex items-center gap-2">
                🛡 Seguro mínimo garantido
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  seguroAcionado ? 'bg-verde/15 text-verde' : 'bg-white/5 text-white/40'
                }`}>{seguroAcionado ? 'aplicado' : 'já superado'}</span>
              </span>
              <span className="text-white/70 font-semibold">{brl(pisoSeguro)}</span>
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-white font-bold">Total do mês</span>
            <span className="text-2xl md:text-3xl font-black text-sol">{brl(total)}</span>
          </div>
          <p className="text-[11px] text-white/35 mt-2">
            {isExp
              ? 'Nos 3 primeiros meses você recebe o MAIOR entre o seguro mínimo e (base + comissão + bônus).'
              : 'Estimativa: base + comissão por faixa + bônus de prospecção.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/70">{rotulo}</span>
      <span className={`font-semibold ${cor || 'text-white'}`}>{brl(valor)}</span>
    </div>
  )
}
