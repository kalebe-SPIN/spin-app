'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fmtNum } from '@/lib/formatters'
import { kwpParaEnergia, type MetaEnergia } from '@/lib/dimensionamento/meta-energia'
import { salvarAjustesEnergiaAction } from '@/app/projetos/[id]/dimensionar/actions'

/**
 * Meta de energia do sistema (Kalebe 2026-09-29) — no Dimensionar e no Kit.
 *  - mostra a necessidade real tirada das faturas (quem já gera: só o que
 *    falta pra zerar, somando as beneficiárias)
 *  - campo do adicional que o cliente quer: % sobre a necessidade ou kWh/mês
 *  - duas opções pro kit: 🎯 necessidade real · ➕ com geração excedente
 */
export function MetaEnergiaCard({ projetoId, meta }: { projetoId: string; meta: MetaEnergia }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tipo, setTipo] = useState(meta.ajustes.adicional_tipo)
  const [valor, setValor] = useState(meta.ajustes.adicional_valor ? String(meta.ajustes.adicional_valor).replace('.', ',') : '')
  const [erro, setErro] = useState<string | null>(null)

  const valorNum = Number(String(valor).replace(',', '.')) || 0
  const adicionalPrevia = tipo === 'absoluto' ? valorNum : meta.necessidade_kwh * (valorNum / 100)
  const alterado = tipo !== meta.ajustes.adicional_tipo || valorNum !== meta.ajustes.adicional_valor

  function salvar(extra: Partial<{ opcao: 'real' | 'excedente' }> = {}) {
    setErro(null)
    start(async () => {
      const r = await salvarAjustesEnergiaAction(projetoId, { adicional_tipo: tipo, adicional_valor: valorNum, ...extra })
      if ('erro' in r) { setErro(r.erro); return }
      router.refresh()
    })
  }

  const b = meta.balanco
  const opcoes = [
    {
      k: 'real' as const, titulo: '🎯 Necessidade real',
      kwh: meta.alvo_real_kwh, kwp: meta.kwp_real,
      desc: meta.modo === 'ampliacao' ? 'O que falta pra zerar a fatura' : 'O consumo registrado nas faturas',
    },
    {
      k: 'excedente' as const, titulo: '➕ Com geração excedente',
      kwh: meta.necessidade_kwh + adicionalPrevia, kwp: kwpParaEnergia(meta.necessidade_kwh + adicionalPrevia),
      desc: adicionalPrevia > 0
        ? `Necessidade + ${fmtNum(adicionalPrevia, 0)} kWh/mês pedidos pelo cliente`
        : 'Defina o adicional ao lado pra liberar',
    },
  ]

  return (
    <section className="bg-white/[0.03] border border-sol/30 rounded-xl p-5 mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">⚡ Meta de energia do sistema</h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-white/50">
          {meta.modo === 'ampliacao' ? 'Ampliação — cliente já gera' : 'Sistema novo'}
        </span>
      </div>

      {meta.modo === 'ampliacao' && b && (
        <p className="text-xs text-white/70 leading-relaxed">
          Já injeta <strong className="text-white">{fmtNum(b.injetado_medio, 0)} kWh/mês</strong> (≈ {fmtNum(b.kwp_atual_estimado, 2)} kWp existentes)
          contra <strong className="text-white">{fmtNum(b.compensavel, 0)} kWh/mês</strong> a compensar
          (consumo menos a taxa mínima, somando as beneficiárias).{' '}
          {b.status === 'deficitario'
            ? <>Faltam <strong className="text-coral">{fmtNum(Math.abs(b.balanco_mes), 0)} kWh/mês</strong> — essa é a necessidade real da ampliação.</>
            : <>Hoje <strong className="text-verde">sobram {fmtNum(Math.abs(b.balanco_mes), 0)} kWh/mês</strong> — só amplia se o cliente quiser gerar a mais.</>}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.1fr] gap-3">
        {opcoes.map((o) => {
          const ativa = meta.opcao === o.k
          const desabilitada = o.k === 'excedente' && meta.adicional_kwh <= 0
          return (
            <button
              key={o.k}
              type="button"
              disabled={pending || desabilitada || ativa}
              onClick={() => salvar({ opcao: o.k })}
              className={`text-left p-4 rounded-lg border transition ${
                ativa ? 'bg-sol/15 border-sol/60' : 'bg-white/[0.02] border-white/10 hover:border-white/25'
              } disabled:cursor-default ${desabilitada ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{o.titulo}</span>
                {ativa && <span className="text-sol text-xs font-bold">✓ usada no kit</span>}
              </div>
              <p className="text-2xl font-black text-white mt-1">{fmtNum(o.kwh, 0)} <span className="text-sm font-bold text-white/50">kWh/mês</span></p>
              <p className="text-sm text-sol font-bold">≈ {fmtNum(o.kwp, 2)} kWp</p>
              <p className="text-[11px] text-white/50 mt-1">{o.desc}</p>
            </button>
          )
        })}

        <div className="p-4 rounded-lg bg-white/[0.02] border border-white/10 space-y-2">
          <p className="text-xs font-bold text-white">Energia a mais que o cliente quer</p>
          <div className="flex gap-1 text-[11px] font-bold">
            <button type="button" onClick={() => setTipo('percentual')}
              className={`px-3 py-1 rounded ${tipo === 'percentual' ? 'bg-sol/20 text-sol' : 'bg-white/5 text-white/50'}`}>%</button>
            <button type="button" onClick={() => setTipo('absoluto')}
              className={`px-3 py-1 rounded ${tipo === 'absoluto' ? 'bg-sol/20 text-sol' : 'bg-white/5 text-white/50'}`}>kWh/mês</button>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder={tipo === 'percentual' ? 'ex.: 20' : 'ex.: 150'}
              className="w-24 bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
            <span className="text-xs text-white/60">{tipo === 'percentual' ? '% sobre a necessidade' : 'kWh/mês'}</span>
          </div>
          <p className="text-[11px] text-white/50">= {fmtNum(adicionalPrevia, 0)} kWh/mês a mais</p>
          <button type="button" onClick={() => salvar(valorNum > 0 ? { opcao: 'excedente' } : { opcao: 'real' })} disabled={pending || !alterado}
            className="w-full px-3 py-2 bg-sol text-noite font-bold text-xs rounded-lg disabled:opacity-40">
            {pending ? 'Salvando…' : 'Salvar adicional'}
          </button>
        </div>
      </div>

      {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
      <p className="text-[10px] text-white/40">
        kWp estimado com 4,5 h de sol e 80% de rendimento (≈ 108 kWh/kWp/mês) — o mesmo critério do kit. A opção marcada define a
        potência que o passo Kit usa pra sugerir o sistema.
      </p>
    </section>
  )
}
