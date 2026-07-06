'use client'

import { useTransition } from 'react'
import { alternarModoAction } from '@/lib/modo-visualizacao/actions'
import type { ModoVisualizacao } from '@/lib/modo-visualizacao'

type Props = {
  modoAtual: ModoVisualizacao
}

export function AlternarModoButton({ modoAtual }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleAlternar() {
    startTransition(async () => {
      await alternarModoAction()
    })
  }

  const proximoModo = modoAtual === 'admin' ? 'Consultor' : 'Admin'

  return (
    <button
      onClick={handleAlternar}
      disabled={isPending}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider
        transition border
        ${modoAtual === 'admin'
          ? 'bg-sol/10 text-sol border-sol/30 hover:bg-sol/20'
          : 'bg-verde/10 text-verde border-verde/30 hover:bg-verde/20'
        }
        disabled:opacity-50
      `}
      title={`Você está vendo o portal como ${modoAtual === 'admin' ? 'Administrador' : 'Consultor'}. Clique pra ver como ${proximoModo}.`}
    >
      <span className={`w-2 h-2 rounded-full ${modoAtual === 'admin' ? 'bg-sol' : 'bg-verde'} animate-pulse`} />
      {modoAtual === 'admin' ? '👁️ Modo Admin' : '👷 Modo Consultor'}
      <span className="text-white/40 font-normal normal-case">
        {isPending ? '...' : `→ ${proximoModo}`}
      </span>
    </button>
  )
}
