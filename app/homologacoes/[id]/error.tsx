'use client'

/**
 * Error boundary especifico da rota /homologacoes/[id].
 * Mostra a mensagem do erro em vez do fallback genérico do global error.tsx.
 * Ajuda a depurar quando algo quebra no Server Component render.
 */

import Link from 'next/link'
import { useEffect } from 'react'

export default function HomologacaoErro({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Homologação erro]', error)
  }, [error])

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto p-6 bg-coral/10 border border-coral/30 rounded-xl">
        <p className="text-xs uppercase tracking-wider font-bold text-coral">
          ⚠️ Homologação não pôde ser aberta
        </p>
        <h1 className="text-xl font-bold text-white mt-2">
          {error.message || 'Erro desconhecido'}
        </h1>

        <div className="mt-4 p-3 bg-noite/40 border border-white/10 rounded text-[10px] text-white/60 font-mono">
          <p className="text-white/40">Detalhes técnicos:</p>
          <p className="break-all mt-1">{error.digest || '—'}</p>
          <p className="break-all mt-1">{error.stack?.split('\n')[0] || '—'}</p>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg hover:bg-sol/90"
          >
            🔄 Tentar novamente
          </button>
          <Link
            href="/projetos"
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm hover:bg-white/10"
          >
            ← Voltar aos projetos
          </Link>
        </div>

        <p className="text-[10px] text-white/40 mt-4">
          💡 Se persistir, tira print e me manda com a mensagem acima.
        </p>
      </div>
    </main>
  )
}
