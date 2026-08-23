'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarCampoFaseAction } from '@/app/homologacoes/[id]/actions'

/**
 * Input inline pra campos de data (YYYY-MM-DD) das fases 4 e 7.
 * Salva onBlur automaticamente.
 */
export function EditorCampoData({
  homologacaoId,
  coluna,
  label,
  valorAtual,
}: {
  homologacaoId: string
  coluna: string
  label: string
  valorAtual?: string | null
}) {
  const router = useRouter()
  const [valor, setValor] = useState(valorAtual || '')
  const [pending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    if (valor === (valorAtual || '')) return
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      const r = await salvarCampoFaseAction(homologacaoId, coluna, valor || null)
      if ('erro' in r) setErro(r.erro)
      else {
        setSalvo(true)
        setTimeout(() => setSalvo(false), 2000)
        router.refresh()
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
      <input
        type="date"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        className="w-full px-3 py-2 bg-noite/60 border border-white/15 rounded text-sm text-white focus:outline-none focus:border-sol/60"
      />
      {erro && <p className="text-[10px] text-coral mt-1">⚠ {erro}</p>}
    </div>
  )
}
