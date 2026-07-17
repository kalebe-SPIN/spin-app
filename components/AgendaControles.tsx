'use client'

/**
 * Controles inline pros cards de tarefa/evento na Agenda:
 *   - Dropdown de mudança de status
 *   - Link "ver detalhes" pra página de acompanhamento
 */

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { mudarStatusTarefaAction, mudarStatusEventoAction } from '@/app/agenda/actions'

const STATUS_TAREFA = [
  { valor: 'pendente', label: '⏳ Pendente', cor: 'text-white/60' },
  { valor: 'em_andamento', label: '🚧 Em andamento', cor: 'text-sol' },
  { valor: 'concluida', label: '✓ Concluída', cor: 'text-verde' },
  { valor: 'cancelada', label: '✗ Cancelada', cor: 'text-coral' },
] as const

const STATUS_EVENTO = [
  { valor: 'agendado', label: '📅 Agendado', cor: 'text-white/60' },
  { valor: 'confirmado', label: '✓ Confirmado', cor: 'text-weg-azul' },
  { valor: 'em_andamento', label: '🚧 Em andamento', cor: 'text-sol' },
  { valor: 'realizado', label: '✓✓ Realizado', cor: 'text-verde' },
  { valor: 'adiado', label: '⏭ Adiado', cor: 'text-white/50' },
  { valor: 'cancelado', label: '✗ Cancelado', cor: 'text-coral' },
] as const

export function StatusTarefaBtn({
  tarefaId, statusAtual,
}: { tarefaId: string; statusAtual: string }) {
  const [isPending, startTransition] = useTransition()
  const [aberto, setAberto] = useState(false)
  const curr = STATUS_TAREFA.find((s) => s.valor === statusAtual) || STATUS_TAREFA[0]

  function trocar(novo: string) {
    setAberto(false)
    startTransition(async () => {
      await mudarStatusTarefaAction(tarefaId, novo as any)
    })
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        disabled={isPending}
        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-white/10 hover:border-sol/40 bg-noite/60 ${curr.cor} disabled:opacity-50`}
      >
        {isPending ? '⏳ ...' : curr.label} ▾
      </button>
      {aberto && (
        <div className="absolute z-10 top-full left-0 mt-1 bg-noite border border-white/15 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
          {STATUS_TAREFA.filter((s) => s.valor !== statusAtual).map((s) => (
            <button
              key={s.valor}
              type="button"
              onClick={() => trocar(s.valor)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 ${s.cor}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function StatusEventoBtn({
  eventoId, statusAtual,
}: { eventoId: string; statusAtual: string }) {
  const [isPending, startTransition] = useTransition()
  const [aberto, setAberto] = useState(false)
  const curr = STATUS_EVENTO.find((s) => s.valor === statusAtual) || STATUS_EVENTO[0]

  function trocar(novo: string) {
    setAberto(false)
    startTransition(async () => {
      await mudarStatusEventoAction(eventoId, novo as any)
    })
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        disabled={isPending}
        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-white/10 hover:border-sol/40 bg-noite/60 ${curr.cor} disabled:opacity-50`}
      >
        {isPending ? '⏳ ...' : curr.label} ▾
      </button>
      {aberto && (
        <div className="absolute z-10 top-full left-0 mt-1 bg-noite border border-white/15 rounded-lg shadow-xl overflow-hidden min-w-[150px]">
          {STATUS_EVENTO.filter((s) => s.valor !== statusAtual).map((s) => (
            <button
              key={s.valor}
              type="button"
              onClick={() => trocar(s.valor)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 ${s.cor}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function LinkDetalhes({ tipo, id }: { tipo: 'tarefa' | 'evento'; id: string }) {
  return (
    <Link
      href={`/agenda/${tipo}/${id}`}
      className="text-[10px] text-white/50 hover:text-sol transition"
      title="Ver histórico + comunicações"
    >
      ver detalhes →
    </Link>
  )
}
