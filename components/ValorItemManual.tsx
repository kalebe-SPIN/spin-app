'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  definirValorItemManualAction,
  excluirProjetoItemAction,
} from '@/app/projetos/[id]/orcamento/actions'
import { fmtNum } from '@/lib/formatters'

/**
 * Ações inline num projeto_item da proposta consolidada:
 * - ✏ Definir/Editar valor manualmente (sem passar pelo fluxo automático)
 * - 🗑 Excluir o item (marca status='removido', não apaga fisicamente)
 *
 * Uso: dentro do card "Proposta consolidada" em cada item.
 */
export function ValorItemManual({
  itemId,
  projetoId,
  titulo,
  valorAtual,
}: {
  itemId: string
  projetoId: string
  titulo: string
  valorAtual?: number | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState<string>(
    valorAtual ? fmtNum(valorAtual, 2) : ''
  )
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    // Aceita "12.345,67" ou "12345.67" ou "12345,67"
    const limpo = valor.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(limpo)
    if (!isFinite(n) || n <= 0) {
      setErro('Valor inválido')
      return
    }
    setErro(null)
    startTransition(async () => {
      const r = await definirValorItemManualAction(itemId, n, projetoId)
      if ('erro' in r) {
        setErro(r.erro)
      } else {
        setAberto(false)
        router.refresh()
      }
    })
  }

  function excluir() {
    const msg = valorAtual
      ? `Excluir "${titulo}" da proposta?\n\nO valor de R$ ${fmtNum(valorAtual, 2)} sai do total consolidado. O item fica apenas marcado como removido — não apaga o kit ou o orçamento vinculado.`
      : `Excluir "${titulo}" da proposta?\n\nO item fica apenas marcado como removido — não apaga nada vinculado.`
    if (!confirm(msg)) return
    startTransition(async () => {
      const r = await excluirProjetoItemAction(itemId, projetoId)
      if ('erro' in r) alert(r.erro)
      else router.refresh()
    })
  }

  if (!aberto) {
    return (
      <span className="inline-flex items-center gap-2 ml-2">
        <button
          onClick={() => setAberto(true)}
          className="text-[10px] text-sol hover:underline"
          title={valorAtual ? `Editar valor de ${titulo}` : `Definir valor pra ${titulo}`}
        >
          {valorAtual ? '✏ Editar' : '✏ Definir valor'}
        </button>
        <button
          onClick={excluir}
          disabled={pending}
          className="text-[10px] text-coral hover:underline disabled:opacity-40"
          title={`Excluir ${titulo} da proposta`}
        >
          🗑 Excluir
        </button>
      </span>
    )
  }

  return (
    <div className="inline-flex items-center gap-1 ml-2">
      <span className="text-[10px] text-white/50">R$</span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') salvar()
          if (e.key === 'Escape') { setAberto(false); setErro(null) }
        }}
        placeholder="32.480,00"
        className="w-28 px-2 py-0.5 bg-noite/60 border border-sol/40 rounded text-xs text-white tabular-nums focus:outline-none focus:border-sol"
      />
      <button
        onClick={salvar}
        disabled={pending}
        className="text-[10px] font-bold text-verde hover:text-verde/80 px-1.5 py-0.5"
      >
        {pending ? '…' : '✓ Salvar'}
      </button>
      <button
        onClick={() => { setAberto(false); setErro(null) }}
        disabled={pending}
        className="text-[10px] text-white/50 hover:text-white/80 px-1"
      >
        ✕
      </button>
      {erro && <span className="text-[9px] text-coral ml-1">{erro}</span>}
    </div>
  )
}
