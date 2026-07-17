'use client'

import { useState, useTransition } from 'react'
import { reprocessarArquivosHomologacaoAction } from '@/app/homologacoes/[id]/actions'

export function ReprocessarArquivosBtn({ homologacaoId }: { homologacaoId: string }) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function acionar() {
    if (!window.confirm('Regenerar TODOS os arquivos das etapas? Isso sobrescreve os existentes.')) return
    setMsg(null)
    startTransition(async () => {
      const res = await reprocessarArquivosHomologacaoAction(homologacaoId)
      if ('erro' in res && res.erro) setMsg('⚠️ ' + res.erro)
      else {
        const ok = (res as any).resultados?.filter((r: any) => r.sucesso).length || 0
        const falhas = (res as any).resultados?.filter((r: any) => !r.sucesso).length || 0
        setMsg(`✓ Regerados ${ok} arquivo${ok !== 1 ? 's' : ''}${falhas > 0 ? ` · ${falhas} falharam (provavelmente IA)` : ''}`)
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={acionar}
        disabled={isPending}
        className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
      >
        {isPending ? '⏳ Regerando...' : '🔄 Regerar arquivos automáticos'}
      </button>
      {msg && <p className="text-[10px] text-white/60 mt-1">{msg}</p>}
    </div>
  )
}
