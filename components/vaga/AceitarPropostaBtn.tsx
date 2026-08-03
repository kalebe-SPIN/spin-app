'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aceitarPropostaAction, recusarPropostaAction } from '@/app/vaga/actions'

/**
 * Bloco de decisão da proposta: Aceitar (→ contrato) ou Recusar (com motivo).
 * Se a proposta já foi aceita, mostra atalho pro contrato.
 */
export function AceitarPropostaBtn({ jaAceita }: { jaAceita: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarRecusa, setMostrarRecusa] = useState(false)
  const [motivo, setMotivo] = useState('')

  function aceitar() {
    setErro(null)
    startTransition(async () => {
      const res = await aceitarPropostaAction()
      if ('erro' in res) { setErro(res.erro); return }
      router.push('/vaga/contrato')
      router.refresh()
    })
  }

  function recusar() {
    setErro(null)
    startTransition(async () => {
      const res = await recusarPropostaAction(motivo)
      if ('erro' in res) { setErro(res.erro); return }
      router.refresh()
    })
  }

  if (jaAceita) {
    return (
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <span className="inline-flex items-center gap-2 text-verde font-semibold">
          <span className="w-6 h-6 rounded-full bg-verde/20 border border-verde/50 flex items-center justify-center text-sm">✓</span>
          Proposta aceita
        </span>
        <button
          onClick={() => router.push('/vaga/contrato')}
          className="px-6 py-3 bg-sol text-noite-0 font-bold rounded-lg hover:bg-sol-claro transition-colors"
        >
          Ir para o contrato →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <div className="px-4 py-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">{erro}</div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={aceitar}
          disabled={pending}
          className="flex-1 px-8 py-4 bg-sol text-noite-0 font-black text-lg rounded-xl hover:bg-sol-claro transition-colors disabled:opacity-50 shadow-lg shadow-sol/20"
        >
          {pending ? 'Registrando...' : 'Aceitar proposta e seguir para o contrato →'}
        </button>
        {!mostrarRecusa && (
          <button
            onClick={() => setMostrarRecusa(true)}
            disabled={pending}
            className="px-6 py-4 bg-white/5 border border-white/10 text-white/60 font-semibold rounded-xl hover:bg-white/10 transition-colors"
          >
            Recusar
          </button>
        )}
      </div>

      {mostrarRecusa && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3">
          <label className="text-sm text-white/70 font-semibold">
            Tudo bem — pode nos contar rapidamente o motivo? (opcional)
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: valor, formato de contratação, momento..."
            className="input-spin resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={recusar}
              disabled={pending}
              className="px-5 py-2.5 bg-coral/15 border border-coral/40 text-coral font-semibold rounded-lg hover:bg-coral/25 transition-colors disabled:opacity-50"
            >
              {pending ? 'Enviando...' : 'Confirmar recusa'}
            </button>
            <button
              onClick={() => setMostrarRecusa(false)}
              disabled={pending}
              className="px-5 py-2.5 text-white/50 hover:text-white transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
