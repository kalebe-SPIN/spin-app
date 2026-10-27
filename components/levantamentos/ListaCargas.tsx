'use client'

import { useMemo, useState } from 'react'
import { EQUIPAMENTOS } from '@/lib/hibrido/catalogo-equipamentos'
import { fmtNum } from '@/lib/formatters'
import { numeroBR, numeroParaCampo, somaCargasW } from '@/lib/levantamentos/comum'
import type { ItemCarga } from '@/lib/levantamentos/types'

const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-base sm:text-sm focus:outline-none'

/**
 * Campo "cargas" (Kalebe 2026-10-27): escolhe o equipamento na lista do
 * sistema (catálogo do levantamento de cargas do híbrido, potência típica já
 * preenchida e editável), ajusta quantidade e potência, ou digita um item que
 * não está na lista. A soma pode ir pra "Carga instalada total prevista".
 */
export function ListaCargas({ itens, onChange, borda, onUsarSoma }: {
  itens: ItemCarga[]
  onChange: (itens: ItemCarga[]) => void
  borda: string
  onUsarSoma?: (kw: number) => void
}) {
  const catalogo = useMemo(() => [...EQUIPAMENTOS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [])
  const [potTexto, setPotTexto] = useState<Record<number, string>>({})
  const [manual, setManual] = useState({ item: '', potencia: '' })
  const soma = somaCargasW(itens)

  function adicionarDoCatalogo(id: string) {
    const eq = catalogo.find((e) => e.id === id)
    if (!eq) return
    const i = itens.findIndex((x) => x.equipamento_id === eq.id)
    if (i >= 0) return mudarItem(i, { qtd: itens[i].qtd + 1 })
    onChange([...itens, { item: eq.nome, qtd: 1, potencia_w: eq.potenciaW, equipamento_id: eq.id }])
  }

  function adicionarManual() {
    const nome = manual.item.trim()
    if (!nome) return
    onChange([...itens, { item: nome, qtd: 1, potencia_w: numeroBR(manual.potencia) }])
    setManual({ item: '', potencia: '' })
  }

  function mudarItem(i: number, patch: Partial<ItemCarga>) {
    onChange(itens.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  function remover(i: number) {
    onChange(itens.filter((_, j) => j !== i))
    setPotTexto({})
  }

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${borda}`}>
      {itens.length > 0 && (
        <ul className="space-y-2">
          {itens.map((it, i) => (
            <li key={`${it.equipamento_id || 'm'}-${i}`} className="rounded-lg border border-white/10 p-2.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                {it.equipamento_id
                  ? <span className="text-sm text-white">{it.item}</span>
                  : <input value={it.item} onChange={(e) => mudarItem(i, { item: e.target.value })} className={inputCls} aria-label="Equipamento" />}
                <button type="button" onClick={() => remover(i)} className="px-2 py-1 text-white/50 text-sm shrink-0" aria-label={`Tirar ${it.item}`}>✕</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                <label className="flex items-center gap-1.5">
                  Qtd
                  <span className="flex items-center rounded-lg border border-white/10">
                    <button type="button" onClick={() => mudarItem(i, { qtd: Math.max(1, it.qtd - 1) })} className="px-2.5 py-1.5 text-white" aria-label="Diminuir">−</button>
                    <input value={it.qtd} inputMode="numeric" onChange={(e) => mudarItem(i, { qtd: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)) })}
                      className="w-10 bg-transparent text-center text-white text-base sm:text-sm focus:outline-none" />
                    <button type="button" onClick={() => mudarItem(i, { qtd: Math.min(999, it.qtd + 1) })} className="px-2.5 py-1.5 text-white" aria-label="Aumentar">+</button>
                  </span>
                </label>
                <label className="flex items-center gap-1.5">
                  Potência de cada
                  <input value={potTexto[i] ?? numeroParaCampo(it.potencia_w)} inputMode="decimal"
                    onChange={(e) => { setPotTexto((t) => ({ ...t, [i]: e.target.value })); mudarItem(i, { potencia_w: numeroBR(e.target.value) }) }}
                    className={`w-24 bg-white/5 border rounded-lg px-2 py-1.5 text-white text-base sm:text-sm focus:outline-none ${it.potencia_w ? 'border-white/10' : 'border-sol/70'}`} />
                  W
                </label>
                {it.potencia_w ? <span className="text-white/75">= {fmtNum(it.potencia_w * it.qtd, 0)} W</span> : <span>informe a potência</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <select value="" onChange={(e) => adicionarDoCatalogo(e.target.value)} className={`${inputCls} border-white/15`} aria-label="Adicionar equipamento da lista">
        <option value="">+ Adicionar equipamento da lista…</option>
        {catalogo.map((e) => <option key={e.id} value={e.id}>{e.nome} — {fmtNum(e.potenciaW, 0)} W</option>)}
      </select>

      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_auto] gap-2">
        <input value={manual.item} onChange={(e) => setManual((m) => ({ ...m, item: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarManual() } }}
          placeholder="Outro equipamento (não está na lista)" className={`${inputCls} col-span-2 sm:col-span-1`} />
        <input value={manual.potencia} onChange={(e) => setManual((m) => ({ ...m, potencia: e.target.value }))} inputMode="decimal"
          placeholder="Potência (W)" className={inputCls} />
        <button type="button" onClick={adicionarManual} disabled={!manual.item.trim()} className="px-3 py-2 bg-sol text-noite text-sm font-bold rounded-lg disabled:opacity-40">
          Adicionar
        </button>
      </div>

      {itens.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
          <span className="text-sm text-white">Soma: <b>{fmtNum(soma, 0)} W</b> <span className="text-white/60">({fmtNum(soma / 1000, 2)} kW)</span></span>
          {onUsarSoma && soma > 0 && (
            <button type="button" onClick={() => onUsarSoma(Math.round(soma / 10) / 100)} className="px-3 py-1.5 border border-sol/60 text-white text-xs font-semibold rounded-lg">
              Usar {fmtNum(soma / 1000, 2)} kW na carga instalada
            </button>
          )}
        </div>
      )}
    </div>
  )
}
