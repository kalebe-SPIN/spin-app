'use client'

import { useTransition } from 'react'
import { definirModoAction } from '@/lib/modo-visualizacao/actions'
import type { ModoVisualizacao } from '@/lib/modo-visualizacao'

type Props = {
  modoAtual: ModoVisualizacao
}

const MODOS: {
  chave: ModoVisualizacao
  labelCurto: string
  emoji: string
  classeAtivo: string
  classeInativo: string
}[] = [
  {
    chave: 'admin',
    labelCurto: 'Admin',
    emoji: '👁️',
    classeAtivo: 'bg-sol/20 text-sol border-sol/50',
    classeInativo: 'text-white/50 hover:text-sol hover:bg-sol/10 border-transparent',
  },
  {
    chave: 'consultor',
    labelCurto: 'Consultor',
    emoji: '👷',
    classeAtivo: 'bg-verde/20 text-verde border-verde/50',
    classeInativo: 'text-white/50 hover:text-verde hover:bg-verde/10 border-transparent',
  },
  {
    chave: 'vendedor_servicos',
    labelCurto: 'Vendedor Serv.',
    emoji: '🧽',
    classeAtivo: 'bg-coral/20 text-coral border-coral/50',
    classeInativo: 'text-white/50 hover:text-coral hover:bg-coral/10 border-transparent',
  },
]

export function AlternarModoButton({ modoAtual }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick(modo: ModoVisualizacao) {
    if (modo === modoAtual) return
    startTransition(async () => {
      await definirModoAction(modo)
    })
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
      {MODOS.map((modo) => {
        const ativo = modo.chave === modoAtual
        return (
          <button
            key={modo.chave}
            onClick={() => handleClick(modo.chave)}
            disabled={isPending}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider
              transition border
              ${ativo ? modo.classeAtivo : modo.classeInativo}
              disabled:opacity-50
            `}
            title={ativo ? `Você está vendo o portal como ${modo.labelCurto}` : `Clique pra ver como ${modo.labelCurto}`}
          >
            <span>{modo.emoji}</span>
            <span>{modo.labelCurto}</span>
          </button>
        )
      })}
    </div>
  )
}
