'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { concluirEnvioDocsAction } from '@/app/vaga/actions'

export function ConcluirEnvioBtn({ habilitado }: { habilitado: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function concluir() {
    setErro(null)
    startTransition(async () => {
      const res = await concluirEnvioDocsAction()
      if ('erro' in res) { setErro(res.erro); return }
      router.refresh()
    })
  }

  return (
    <div>
      {erro && <p className="text-coral text-sm mb-3">{erro}</p>}
      <button
        onClick={concluir}
        disabled={pending || !habilitado}
        className="w-full px-8 py-4 bg-sol text-noite-0 font-black text-lg rounded-xl hover:bg-sol-claro transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-sol/20"
        title={habilitado ? '' : 'Envie ao menos os documentos obrigatórios'}
      >
        {pending ? 'Finalizando...' : 'Finalizar envio de documentos'}
      </button>
    </div>
  )
}
