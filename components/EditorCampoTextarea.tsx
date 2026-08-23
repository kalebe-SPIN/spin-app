'use client'

import { useState, useTransition } from 'react'
import { salvarCampoFaseAction } from '@/app/homologacoes/[id]/actions'

/**
 * Textarea inline pra campos texto livre (observações) das fases 1, 3, 4, 5, 7.
 * Salva onBlur automaticamente.
 */
export function EditorCampoTextarea({
  homologacaoId,
  coluna,
  label,
  valorAtual,
  placeholder,
}: {
  homologacaoId: string
  coluna: string
  label: string
  valorAtual?: string | null
  placeholder?: string
}) {
  const [valor, setValor] = useState(valorAtual || '')
  const [pending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)

  function salvar() {
    if (valor === (valorAtual || '')) return
    startTransition(async () => {
      const r = await salvarCampoFaseAction(homologacaoId, coluna, valor || null)
      if (!('erro' in r)) {
        setSalvo(true)
        setTimeout(() => setSalvo(false), 2000)
      }
    })
  }

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">
        {label}
        {pending && <span className="ml-2 text-white/40">…</span>}
        {salvo && <span className="ml-2 text-verde">✓</span>}
      </label>
      <textarea
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 bg-noite/60 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-sol/60 resize-y"
      />
    </div>
  )
}
