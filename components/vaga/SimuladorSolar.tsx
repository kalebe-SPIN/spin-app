'use client'

import { useMemo, useState } from 'react'
import { GARANTIA_ESCALONADA, calcularComissaoSolar } from '@/lib/proposta-solar'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Periodo = 'mes1' | 'mes2' | 'mes3' | 'regime'

/**
 * Simulador de vendas solar: comissão marginal (3-6%) sobre o valor vendido no
 * mês. Nos 3 primeiros meses há SEGURO MÍNIMO (recebe o maior entre o garantido
 * e a comissão); no regime é 100% comissão (sem fixo).
 */
export function SimuladorSolar() {
  const [periodo, setPeriodo] = useState<Periodo>('regime')
  const [metaPct, setMetaPct] = useState(100)
  const [vendas, setVendas] = useState(180000)

  const isExp = periodo !== 'regime'
  const garantidoMes = useMemo(() => {
    if (periodo === 'regime') return 0
    const idx = periodo === 'mes1' ? 0 : periodo === 'mes2' ? 1 : 2
    return GARANTIA_ESCALONADA[idx].valor
  }, [periodo])

  const bateuMeta = metaPct >= 100
  const metaFrac = Math.min(1, metaPct / 100)
  const com = useMemo(() => calcularComissaoSolar(vendas), [vendas])
  const pisoSeguro = isExp ? Math.round(garantidoMes * metaFrac) : 0
  const seguroAcionado = isExp && pisoSeguro > com.total
  const total = isExp ? Math.max(pisoSeguro, com.total) : com.total

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
        <p className="text-white/55 text-sm">Informe quanto vendeu no mês e veja sua comissão.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 p-5 md:p-6">
        {/* ENTRADAS */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Período</label>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {periodos.map((p) => (
                <button key={p.v} onClick={() => setPeriodo(p.v)} className={`py-2 rounded-lg text-xs font-bold border transition-colors ${periodo === p.v ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>{p.label}</button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-1.5">
              {isExp ? <>Seguro mínimo do mês: <strong className="text-white/70">{brl(garantidoMes)}</strong></> : 'Regime: 100% comissão, sem fixo.'}
            </p>
          </div>

          {isExp && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Cumprimento da meta</label>
                <span className={`text-sm font-black ${bateuMeta ? 'text-verde' : 'text-coral'}`}>{metaPct}%</span>
              </div>
              <input type="range" min={0} max={100} step={5} value={metaPct} onChange={(e) => setMetaPct(Number(e.target.value))} className="w-full mt-2 accent-[#F5B400]" />
              <p className="text-[11px] mt-1">{bateuMeta ? <span className="text-verde">Meta batida ✓ — seguro integral</span> : <span className="text-coral">Abaixo da meta — seguro proporcional</span>}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Valor vendido no mês</label>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-white/40 text-sm">R$</span>
              <input type="number" min={0} step={5000} value={vendas} onChange={(e) => setVendas(Math.max(0, Number(e.target.value)))} className="input-spin flex-1" />
            </div>
            <p className="text-[11px] text-white/40 mt-1">Soma do valor total dos sistemas vendidos no mês.</p>
          </div>
        </div>

        {/* RESULTADO */}
        <div className="rounded-xl bg-noite-0/60 border border-white/10 p-5 flex flex-col">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Seu rendimento no mês</p>

          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-white/70">Faixa atingida</span>
            <span className="text-white font-semibold">{Math.round(com.pct * 100)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/70">Comissão ({Math.round(com.pct * 100)}% × {brl(vendas)})</span>
            <span className="text-white font-semibold">{brl(com.total)}</span>
          </div>
          <p className="text-[11px] text-white/40 mb-2">O % da faixa incide sobre o total vendido no mês.</p>

          {isExp && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70 flex items-center gap-2">
                🛡 Seguro mínimo
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${seguroAcionado ? 'bg-verde/15 text-verde' : 'bg-white/5 text-white/40'}`}>{seguroAcionado ? 'aplicado' : 'já superado'}</span>
              </span>
              <span className="text-white/70 font-semibold">{brl(pisoSeguro)}</span>
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-white font-bold">Total do mês</span>
            <span className="text-2xl md:text-3xl font-black text-sol">{brl(total)}</span>
          </div>
          <p className="text-[11px] text-white/35 mt-2">
            {isExp ? 'Nos 3 primeiros meses você recebe o MAIOR entre o seguro mínimo e a comissão.' : 'Regime: você recebe a comissão sobre o que vendeu — sem teto.'}
          </p>
        </div>
      </div>
    </div>
  )
}
