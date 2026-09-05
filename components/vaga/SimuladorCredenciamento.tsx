'use client'

import { useState } from 'react'
import { simular, acelerador, type SimuladorState } from '@/lib/proposta-credenciamento'

const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')

/**
 * Simulador de ganho mensal do credenciado — mesmo motor da landing page
 * pública (lib/proposta-credenciamento), com a Semana de Fechamento embutida.
 */
export function SimuladorCredenciamento() {
  const [st, setSt] = useState<SimuladorState>({
    volume: 300000,
    res: 70,
    com: 20,
    usi: 10,
    prosp: 50,
    anex: 40,
    ano: 3,
    recup: 0,
  })

  const set = (patch: Partial<SimuladorState>) => setSt((s) => ({ ...s, ...patch }))

  // Mantém o mix somando 100 ao mexer numa das linhas
  function setMix(changed: 'res' | 'com' | 'usi', valor: number) {
    setSt((s) => {
      const novo = { ...s, [changed]: valor }
      const outros = (['res', 'com', 'usi'] as const).filter((k) => k !== changed)
      const resto = 100 - valor
      const soma = s[outros[0]] + s[outros[1]]
      if (soma <= 0) {
        novo[outros[0]] = Math.round(resto / 2)
        novo[outros[1]] = resto - novo[outros[0]]
      } else {
        const a = Math.round(resto * (s[outros[0]] / soma))
        novo[outros[0]] = a
        novo[outros[1]] = resto - a
      }
      return novo
    })
  }

  const r = simular(st)
  const acc = acelerador(st.volume)

  return (
    <div className="rounded-2xl border border-sol/30 bg-gradient-to-br from-sol/[0.07] to-transparent overflow-hidden">
      <div className="px-5 md:px-6 py-4 border-b border-white/10">
        <p className="text-sol font-black text-lg">🧮 Simule seu ganho no mês</p>
        <p className="text-white/55 text-sm">Volume, mix de produto, origem do negócio e anexação de plano.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 p-5 md:p-6">
        {/* ENTRADAS */}
        <div className="flex flex-col gap-5">
          <Range
            label="Volume vendido no mês"
            valor={brl(st.volume)}
            min={20000}
            max={800000}
            step={10000}
            value={st.volume}
            onChange={(v) => set({ volume: v })}
          />

          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Mix de produto</p>
            <div className="flex flex-col gap-3">
              <Range label="Residencial" valor={`${st.res}%`} min={0} max={100} step={5} value={st.res} onChange={(v) => setMix('res', v)} compact />
              <Range label="Comercial" valor={`${st.com}%`} min={0} max={100} step={5} value={st.com} onChange={(v) => setMix('com', v)} compact />
              <Range label="Usina" valor={`${st.usi}%`} min={0} max={100} step={5} value={st.usi} onChange={(v) => setMix('usi', v)} compact />
            </div>
          </div>

          <Range
            label="Prospecção própria"
            valor={`${st.prosp}%`}
            sub={`resto (${100 - st.prosp}%) são leads da SPIN`}
            min={0}
            max={100}
            step={5}
            value={st.prosp}
            onChange={(v) => set({ prosp: v })}
          />

          <Range
            label="Anexação de plano de O&M"
            valor={`${st.anex}%`}
            min={0}
            max={100}
            step={5}
            value={st.anex}
            onChange={(v) => set({ anex: v })}
          />

          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Ano da carteira</p>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((a) => (
                <button
                  key={a}
                  onClick={() => set({ ano: a })}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors ${st.ano === a ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Semana de Fechamento — separado por linha --sol */}
          <div className="pt-4 border-t border-sol/40">
            <Range
              label="Semana de Fechamento — recuperações"
              valor={String(st.recup)}
              sub="leads de outros consultores, com condição facilitada"
              min={0}
              max={6}
              step={1}
              value={st.recup}
              onChange={(v) => set({ recup: v })}
            />
          </div>
        </div>

        {/* RESULTADO */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-noite-0/60 border border-white/10 p-4">
            <Linha rot="Comissão de venda" val={brl(r.comissao)} />
            <Linha rot="Bônus de anexação" val={brl(r.bonus)} />
            <Linha rot="Carteira (anuidade)" val={brl(r.anuidade)} />
            <Linha rot="Fixo (retirada)" val={brl(r.retirada)} />
            <p className="text-[11px] text-white/40 mt-2">Acelerador de volume aplicado: <span className="text-sol font-semibold">{acc.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}×</span></p>
          </div>

          {st.recup > 0 && (
            <div className="rounded-xl border border-sol/50 p-4" style={{ background: 'rgba(245,166,35,0.08)' }}>
              <div className="flex items-center justify-between">
                <span className="text-white/80 font-semibold text-sm">Semana de Fechamento</span>
                <span className="text-sol font-black">{brl(r.recupTotal)}</span>
              </div>
              <p className="text-[11px] text-white/50 mt-1">
                {st.recup} recupera{st.recup > 1 ? 'ções' : 'ção'} · {brl(r.recupBonus)} de bônus · soma ao ganho do mês
              </p>
            </div>
          )}

          <div className="rounded-xl bg-sol/[0.1] border border-sol/40 p-5 mt-auto">
            <p className="text-[11px] font-bold text-sol uppercase tracking-wider">Ganho total no mês</p>
            <p className="text-3xl md:text-4xl font-black text-sol mt-1">{brl(r.total)}</p>
            <p className="text-[11px] text-verde mt-2">
              Renda recorrente que continua: {brl(r.recorrente)}/mês · verba de apoio {brl(r.verba)} (à parte)
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-6 pb-5">
        <p className="text-[11px] text-white/40 leading-relaxed">
          Estimativa para orientação. Comissão com acelerador de volume (faixas marginais) e multiplicador de origem;
          carteira acumula com o tempo. A verba de apoio é separada do ganho.
        </p>
      </div>
    </div>
  )
}

function Range({
  label,
  valor,
  sub,
  min,
  max,
  step,
  value,
  onChange,
  compact,
}: {
  label: string
  valor: string
  sub?: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  compact?: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={`font-semibold text-white/60 ${compact ? 'text-xs' : 'text-xs uppercase tracking-wider'}`}>{label}</label>
        <span className="text-sm font-bold text-sol font-mono">{valor}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-sol"
      />
      {sub && <p className="text-[11px] text-white/40 mt-1">{sub}</p>}
    </div>
  )
}

function Linha({ rot, val }: { rot: string; val: string }) {
  return (
    <div className="flex items-center justify-between text-sm mb-1.5">
      <span className="text-white/60">{rot}</span>
      <span className="text-white font-semibold font-mono">{val}</span>
    </div>
  )
}
