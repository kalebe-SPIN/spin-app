'use client'

import { useState } from 'react'
import { OS_BASE, OS_POR_PLACA, OS_POR_KM, valorOS } from '@/lib/proposta-campo'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Simulador do profissional de campo (empreitada por OS).
 * O profissional informa nº de placas e km (ida+volta) de uma OS típica e
 * quantas OS pretende fazer no mês; vê o valor da OS + a projeção do mês.
 */
export function SimuladorCampo() {
  const [placas, setPlacas] = useState(24)
  const [km, setKm] = useState(40)
  const [osMes, setOsMes] = useState(20)

  const vBase = OS_BASE
  const vPlacas = OS_POR_PLACA * Math.max(0, placas)
  const vKm = OS_POR_KM * Math.max(0, km)
  const vOS = valorOS(placas, km)
  const totalMes = vOS * Math.max(0, osMes)

  return (
    <div className="rounded-2xl border border-sol/30 bg-gradient-to-br from-sol/[0.07] to-transparent overflow-hidden">
      <div className="px-5 md:px-6 py-4 border-b border-white/10">
        <p className="text-sol font-black text-lg">🧮 Simulador de ganhos por OS</p>
        <p className="text-white/55 text-sm">Empreitada: cada serviço executado gera um pagamento.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 p-5 md:p-6">
        {/* ENTRADAS */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Placas do sistema</label>
              <span className="text-sm font-black text-white">{placas}</span>
            </div>
            <input type="range" min={4} max={500} step={2} value={placas} onChange={(e) => setPlacas(Number(e.target.value))} className="w-full mt-2 accent-[#F5B400]" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Km rodados (ida + volta)</label>
              <span className="text-sm font-black text-white">{km} km</span>
            </div>
            <input type="range" min={0} max={300} step={5} value={km} onChange={(e) => setKm(Number(e.target.value))} className="w-full mt-2 accent-[#F5B400]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Quantas OS você faz no mês?</label>
            <input type="number" min={0} step={1} value={osMes} onChange={(e) => setOsMes(Math.max(0, Number(e.target.value)))} className="input-spin mt-2 w-full" />
            <p className="text-[11px] text-white/40 mt-1">Considerando OS parecidas com a de cima (cada OS varia com placas e km).</p>
          </div>
        </div>

        {/* RESULTADO */}
        <div className="rounded-xl bg-noite-0/60 border border-white/10 p-5 flex flex-col">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Valor desta OS</p>
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between"><span className="text-white/70">Base por serviço</span><span className="text-white font-semibold">{brl(vBase)}</span></div>
            <div className="flex items-center justify-between"><span className="text-white/70">Placas · {placas} × {brl(OS_POR_PLACA)}</span><span className="text-white font-semibold">{brl(vPlacas)}</span></div>
            <div className="flex items-center justify-between"><span className="text-white/70">Deslocamento · {km} km × {brl(OS_POR_KM)}</span><span className="text-white font-semibold">{brl(vKm)}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-white font-bold">Você recebe por esta OS</span>
            <span className="text-2xl md:text-3xl font-black text-sol">{brl(vOS)}</span>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-white/70 text-sm">Projeção do mês · {osMes} OS</span>
              <span className="text-xl font-black text-verde">{brl(totalMes)}</span>
            </div>
            <p className="text-[11px] text-white/35 mt-2">
              Estimativa. Você emite NF por serviço executado e recebe a cada serviço — não é salário mensal.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
