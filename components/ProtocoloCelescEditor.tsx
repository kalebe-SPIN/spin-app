'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarProtocoloCelescAction } from '@/app/homologacoes/[id]/actions'

/**
 * Editor inline do número do protocolo CELESC. Aparece em cada linha "Protocolo
 * CELESC" no card de dados da homologação.
 *
 * Estados:
 *  - Aberto (edit): input + salvar/cancelar
 *  - Fechado (view): valor atual + botão ✏
 */
export function ProtocoloCelescEditor({
  homologacaoId,
  valorAtual,
}: {
  homologacaoId: string
  valorAtual: string | null | undefined
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState(valorAtual || '')
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await editarProtocoloCelescAction(homologacaoId, valor)
      if ('erro' in r) setErro(r.erro)
      else { setAberto(false); router.refresh() }
    })
  }

  function cancelar() {
    setValor(valorAtual || '')
    setErro(null)
    setAberto(false)
  }

  if (!aberto) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-white/80">{valorAtual || '—'}</span>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-[10px] text-sol hover:underline"
          title={valorAtual ? 'Editar protocolo' : 'Cadastrar protocolo CELESC'}
        >
          {valorAtual ? '✏ Editar' : '＋ Cadastrar'}
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') salvar()
          if (e.key === 'Escape') cancelar()
        }}
        placeholder="Ex: 2026-CEL-0001234"
        maxLength={60}
        className="px-2 py-0.5 bg-noite border border-sol/40 rounded text-xs text-white tabular-nums focus:outline-none focus:border-sol w-56"
      />
      <button
        type="button"
        onClick={salvar}
        disabled={pending}
        className="text-[10px] font-bold text-verde hover:text-verde/80 px-1.5 py-0.5"
      >
        {pending ? '…' : '✓'}
      </button>
      <button
        type="button"
        onClick={cancelar}
        disabled={pending}
        className="text-[10px] text-white/50 hover:text-white/80 px-1"
      >
        ✕
      </button>
      {erro && <span className="text-[10px] text-coral ml-1">{erro}</span>}
    </span>
  )
}
