'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Portal Spin] Erro capturado:', error)
  }, [error])

  return (
    <main className="min-h-screen p-8 md:p-12 flex items-center justify-center">
      <div className="max-w-2xl w-full bg-coral/10 border border-coral/30 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">⚠️</span>
          <div>
            <h1 className="text-xl font-black text-coral">Algo deu errado</h1>
            <p className="text-xs text-white/50 mt-1">
              O portal encontrou um erro inesperado nessa página.
            </p>
          </div>
        </div>

        <div className="bg-noite/40 border border-white/10 rounded-lg p-4 mb-6">
          <p className="text-xs text-white/40 uppercase font-bold mb-2">Detalhes técnicos</p>
          <p className="text-sm text-white/80 font-mono break-words">
            {error.message || 'Erro sem mensagem'}
          </p>
          {error.digest && (
            <p className="text-xs text-white/40 mt-2 font-mono">ID: {error.digest}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg"
          >
            🔄 Tentar novamente
          </button>
          <Link
            href="/projetos"
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
          >
            ← Voltar aos projetos
          </Link>
        </div>

        <p className="text-xs text-white/40 mt-6">
          💡 Se persistir, avise Kalebe com esse ID e uma descrição do que estava fazendo.
        </p>
      </div>
    </main>
  )
}
