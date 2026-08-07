'use client'

import { useMemo, useState } from 'react'
import {
  FIXO_MENSAL, GARANTIA_ESCALONADA, calcularComissao, MULTIPLICADOR_PCT,
} from '@/lib/proposta-om'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Periodo = 'mes1' | 'mes2' | 'mes3' | 'regime'

// Cor por faixa (na ordem 10% / 14% / 18% / 20%)
const CORES_FAIXA = ['#FFD64A', '#F5B400', '#4EDC8A', '#4EA8DE']

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

          {/* Comissão + barra colorida */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-white/70">Comissão por faixa</span>
              <span className="text-white font-semibold">{brl(com.total)}</span>
            </div>
            {com.total > 0 ? (
              <>
                {/* Barra empilhada */}
                <div className="flex h-3 w-full rounded-full overflow-hidden bg-white/5">
                  {com.faixas.map((f, i) => (
                    <div
                      key={i}
                      style={{ width: `${(f.valor / com.total) * 100}%`, background: CORES_FAIXA[i % CORES_FAIXA.length] }}
                      title={`${f.label} · ${brl(f.valor)}`}
                    />
                  ))}
                </div>
                {/* Legenda */}
                <div className="mt-2 flex flex-col gap-1">
                  {com.faixas.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-white/55">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CORES_FAIXA[i % CORES_FAIXA.length] }} />
                        {f.label} · {Math.round(f.pct * 100)}%
                      </span>
                      <span className="text-white/70">{brl(f.valor)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-white/40">Sem comissão nesta faixa (faturamento até R$ 15.000).</p>
            )}
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
