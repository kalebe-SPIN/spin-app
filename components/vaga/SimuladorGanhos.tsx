'use client'

import { useMemo, useState } from 'react'
import {
  FIXO_MENSAL, GARANTIA_ESCALONADA, calcularComissao, MULTIPLICADOR_PCT,
} from '@/lib/proposta-om'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Periodo = 'mes1' | 'mes2' | 'mes3' | 'regime'

/**
 * Simulador de ganhos — o vendedor informa o cumprimento da meta de trabalho e
 * um resultado de venda (faturamento) e vê todo o rendimento do período:
 * base (integral só com a meta batida, senão proporcional) + comissão por faixa
 * + bônus de prospecção (+30%) quando supera a meta.
 */
export function SimuladorGanhos() {
  const [periodo, setPeriodo] = useState<Periodo>('regime')
  const [metaPct, setMetaPct] = useState(100)
  const [faturamento, setFaturamento] = useState(40000)
  const [fatProsp, setFatProsp] = useState(0)

  const baseCheia = useMemo(() => {
    if (periodo === 'regime') return FIXO_MENSAL
    const idx = periodo === 'mes1' ? 0 : periodo === 'mes2' ? 1 : 2
    return GARANTIA_ESCALONADA[idx].valor
  }, [periodo])

  const bateuMeta = metaPct >= 100
  const superou = metaPct > 100
  const baseEfetiva = bateuMeta ? baseCheia : Math.round(baseCheia * (metaPct / 100))

  const com = useMemo(() => calcularComissao(faturamento), [faturamento])

  // Bônus: +30% sobre a comissão da parcela de prospecção (fatia de topo do faturamento)
  const bonus = useMemo(() => {
    if (!superou || fatProsp <= 0) return 0
    const prosp = Math.min(fatProsp, faturamento)
    const comTopo = com.total - calcularComissao(faturamento - prosp).total
    return Math.max(0, comTopo * MULTIPLICADOR_PCT)
  }, [superou, fatProsp, faturamento, com.total])

  const total = baseEfetiva + com.total + bonus

  const periodos: { v: Periodo; label: string; base: number }[] = [
    { v: 'mes1', label: 'Mês 1', base: GARANTIA_ESCALONADA[0].valor },
    { v: 'mes2', label: 'Mês 2', base: GARANTIA_ESCALONADA[1].valor },
    { v: 'mes3', label: 'Mês 3', base: GARANTIA_ESCALONADA[2].valor },
    { v: 'regime', label: 'Regime', base: FIXO_MENSAL },
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
          {/* Período */}
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
            <p className="text-[11px] text-white/40 mt-1.5">Base do período: <strong className="text-white/70">{brl(baseCheia)}</strong></p>
          </div>

          {/* Meta de trabalho */}
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
                  ? <span className="text-verde">Meta batida ✓ — base paga integral</span>
                  : <span className="text-coral">Abaixo da meta — base paga proporcional ao entregue</span>}
            </p>
          </div>

          {/* Faturamento */}
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

          {/* Prospecção acima da meta (bônus) */}
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

          <Linha rotulo={`Base (${bateuMeta ? 'meta batida' : `${metaPct}% da meta`})`} valor={baseEfetiva} />

          <div className="mt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Comissão por faixa</span>
              <span className="text-white font-semibold">{brl(com.total)}</span>
            </div>
            {com.faixas.length > 0 && (
              <div className="mt-1 pl-3 border-l border-white/10 flex flex-col gap-0.5">
                {com.faixas.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] text-white/45">
                    <span>{f.label} · {Math.round(f.pct * 100)}%</span>
                    <span>{brl(f.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {bonus > 0 && <Linha rotulo="Bônus prospecção (+30%)" valor={bonus} cor="text-sol" />}

          <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-white font-bold">Total do mês</span>
            <span className="text-2xl md:text-3xl font-black text-sol">{brl(total)}</span>
          </div>
          <p className="text-[11px] text-white/35 mt-2">
            Estimativa. A comissão incide sobre o faturamento efetivamente recebido; o bônus vale sobre as vendas de prospecção acima da meta.
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
