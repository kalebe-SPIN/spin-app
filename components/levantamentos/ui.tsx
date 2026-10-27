'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COR_STATUS } from '@/lib/levantamentos/comum'
import { ROTULO_STATUS, type StatusLevantamento } from '@/lib/levantamentos/types'

export const cardCls = 'rounded-xl border border-white/10 bg-white/[0.03] p-4'
export const inputCls = 'w-full bg-white/5 border rounded-lg px-3 py-2.5 text-white text-base sm:text-sm focus:outline-none'

/** Etiqueta de status: só contorno (visual minimalista). */
export function EtiquetaStatus({ status }: { status: StatusLevantamento }) {
  return (
    <span data-etiqueta className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold text-white/85 whitespace-nowrap ${COR_STATUS[status]}`}>
      {ROTULO_STATUS[status] || status}
    </span>
  )
}

export function BarraProgresso({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full bg-sol transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Lista/detalhe atualizam sozinhos quando outro usuário muda um levantamento
 * (Supabase Realtime, respeitando o RLS de quem está olhando).
 */
export function AtualizaAoMudar({ id }: { id?: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`levantamentos-${id || 'lista'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'levantamentos', ...(id ? { filter: `id=eq.${id}` } : {}) }, () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => router.refresh(), 600)
      })
      .subscribe()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(canal)
    }
  }, [id, router])
  return null
}

export type EventoTela = {
  id: string
  tipo: string
  de_status: StatusLevantamento | null
  para_status: StatusLevantamento | null
  mensagem: string | null
  autor: string
  created_at: string
}

export function Historico({ eventos }: { eventos: EventoTela[] }) {
  if (!eventos.length) return null
  return (
    <details className={cardCls}>
      <summary className="cursor-pointer text-sm font-bold text-white">Histórico <span className="text-white/45 font-normal">({eventos.length})</span></summary>
      <ol className="mt-3 space-y-2">
        {eventos.map((e) => (
          <li key={e.id} className="text-xs text-white/70 border-l border-white/15 pl-3">
            <span className="text-white/45">{dataHoraBR(e.created_at)} · {e.autor}</span>
            <br />
            {e.para_status && e.de_status
              ? <>{ROTULO_STATUS[e.de_status]} → <b className="text-white/85">{ROTULO_STATUS[e.para_status]}</b></>
              : e.para_status && !e.mensagem ? <b className="text-white/85">{ROTULO_STATUS[e.para_status]}</b> : null}
            {e.mensagem && <span className="text-white/80">{e.para_status && e.de_status ? ' · ' : ''}{e.mensagem}</span>}
          </li>
        ))}
      </ol>
    </details>
  )
}
