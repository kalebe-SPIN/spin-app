'use client'

import { useTransition } from 'react'
import { definirModoAction } from '@/lib/modo-visualizacao/actions'
import type { ModoVisualizacao } from '@/lib/modo-visualizacao'

type Props = {
  modoAtual: ModoVisualizacao
}

// Kalebe 2026-09-30: lista suspensa compacta (antes eram 4 botões largos). A→Z.
const MODOS: { chave: ModoVisualizacao; label: string; cor: string }[] = [
  { chave: 'admin', label: 'Admin', cor: 'text-sol' },
  { chave: 'profissional_campo', label: 'Campo', cor: 'text-weg-azul' },
  { chave: 'consultor', label: 'Consultor', cor: 'text-verde' },
  { chave: 'representante', label: 'Representante', cor: 'text-sol' },
]

const OPT_STYLE: React.CSSProperties = { backgroundColor: '#050B16', color: '#ffffff' }

export function AlternarModoButton({ modoAtual }: Props) {
  const [isPending, startTransition] = useTransition()
  const atual = MODOS.find((m) => m.chave === modoAtual) || MODOS[0]

  function trocar(modo: ModoVisualizacao) {
    if (modo === modoAtual) return
    startTransition(async () => {
      await definirModoAction(modo)
    })
  }

  return (
    <label
      className="relative flex items-center shrink-0 rounded-lg bg-white/5 border border-white/10 hover:border-white/25 focus-within:border-sol"
      title="Ver o portal como…"
    >
      {/* "Ver como" só a partir do tablet — no celular o espaço é curto */}
      <span className="hidden sm:inline pl-2.5 text-[10px] font-bold uppercase tracking-wider text-white/40 whitespace-nowrap">Ver como</span>
      <span className="sr-only sm:hidden">Ver o portal como</span>
      <select
        value={modoAtual}
        onChange={(e) => trocar(e.target.value as ModoVisualizacao)}
        disabled={isPending}
        className={`appearance-none cursor-pointer bg-transparent pl-2 sm:pl-1.5 pr-6 py-1.5 text-[11px] font-bold uppercase tracking-wider focus:outline-none disabled:opacity-50 ${atual.cor}`}
      >
        {MODOS.map((m) => (
          <option key={m.chave} value={m.chave} style={OPT_STYLE}>
            {m.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 text-white/50" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </label>
  )
}
