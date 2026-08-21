'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { excluirProjetoAction } from '@/app/crm/pipeline/actions'

/**
 * Barra de ações no rodapé do card do pipeline: Editar (todos)
 * + Excluir (só admin). Excluir passa por confirm com o código do
 * projeto pra reduzir chance de deletar o errado.
 */
export function PipelineCardActions({
  projetoId,
  codigo,
  clienteNome,
  podeExcluir,
}: {
  projetoId: string
  codigo: string
  clienteNome: string
  podeExcluir: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function editar(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    router.push(`/projetos/${projetoId}/editar`)
  }

  function excluir(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const confirmMsg = `Excluir DEFINITIVAMENTE o projeto ${codigo} (${clienteNome})?\n\nIsso apaga também kit, orçamento, agenda e homologação vinculados. Não dá pra desfazer.`
    if (!confirm(confirmMsg)) return

    startTransition(async () => {
      const r = await excluirProjetoAction(projetoId)
      if ('erro' in r) {
        setErro(r.erro)
        alert(r.erro)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/5">
      <button
        onClick={editar}
        disabled={pending}
        className="flex-1 text-[10px] font-semibold px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.10] text-white/70 hover:text-white transition disabled:opacity-40"
        title="Editar dados do projeto"
      >
        ✏ Editar
      </button>
      {podeExcluir && (
        <button
          onClick={excluir}
          disabled={pending}
          className="text-[10px] font-semibold px-2 py-1 rounded bg-coral/10 hover:bg-coral/25 text-coral transition disabled:opacity-40"
          title="Excluir projeto (só admin)"
        >
          🗑 {pending ? '...' : 'Excluir'}
        </button>
      )}
      {erro && <span className="text-[9px] text-coral truncate flex-1">{erro}</span>}
    </div>
  )
}
