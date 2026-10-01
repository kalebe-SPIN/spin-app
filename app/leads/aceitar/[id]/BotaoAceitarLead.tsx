'use client'

import { useState, useTransition } from 'react'
import { aceitarLeadPortalAction } from './actions'

export function BotaoAceitarLead({ broadcastId }: { broadcastId: string }) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErro(null)
          startTransition(async () => {
            const r = await aceitarLeadPortalAction(broadcastId)
            if (r && 'erro' in r) setErro(r.erro)
          })
        }}
        className="w-full px-4 py-3 bg-sol text-noite font-black text-sm rounded-lg disabled:opacity-50"
      >
        {pending ? 'Aceitando…' : '✋ Aceitar lead'}
      </button>
      {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
    </div>
  )
}
