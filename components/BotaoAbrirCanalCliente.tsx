'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { abrirCanalDoProjetoAction } from '@/app/inbox/actions'

/**
 * Botão universal pra abrir o canal WhatsApp Spin com o cliente do projeto.
 * Kalebe 2026-09-14.
 *
 * Uso: <BotaoAbrirCanalCliente projetoId={p.id} />
 *
 * Comportamento:
 *   - Clique → chama action → redireciona pra /inbox?c=<conversa_id>
 *   - Se cliente sem telefone: mostra erro inline
 *   - Estados: idle, loading, erro
 */
export function BotaoAbrirCanalCliente({
  projetoId,
  variante = 'padrao',
  className,
}: {
  projetoId: string
  variante?: 'padrao' | 'compacto' | 'icone'
  className?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    setErro(null)
    startTransition(async () => {
      const r = await abrirCanalDoProjetoAction(projetoId)
      if ('erro' in r) { setErro(r.erro); return }
      router.push(`/inbox?c=${r.conversa_id}`)
    })
  }

  if (variante === 'icone') {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); abrir() }}
        disabled={isPending}
        title="Abrir canal WhatsApp Spin com esse cliente"
        className={`w-8 h-8 flex items-center justify-center rounded bg-verde/10 border border-verde/30 text-verde hover:bg-verde/20 disabled:opacity-40 transition ${className || ''}`}
      >
        {isPending ? '⋯' : '💬'}
      </button>
    )
  }

  if (variante === 'compacto') {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); abrir() }}
        disabled={isPending}
        title="Abrir canal WhatsApp Spin com esse cliente"
        className={`px-2 py-1 rounded bg-verde/10 border border-verde/30 text-verde text-[10px] uppercase tracking-wider font-bold hover:bg-verde/20 disabled:opacity-40 transition ${className || ''}`}
      >
        {isPending ? '...' : '💬 Canal'}
      </button>
    )
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={abrir}
        disabled={isPending}
        title="Abrir canal WhatsApp Spin com esse cliente"
        className={`px-3 py-1.5 rounded-lg bg-verde/15 border border-verde/40 text-verde text-xs uppercase tracking-wider font-bold hover:bg-verde/25 disabled:opacity-40 transition ${className || ''}`}
      >
        {isPending ? 'Abrindo...' : '💬 Abrir canal'}
      </button>
      {erro && <p className="text-[10px] text-coral">{erro}</p>}
    </div>
  )
}
