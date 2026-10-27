'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarLevantamentoAction } from '@/app/levantamentos/actions'
import type { ModeloParaEscolha } from '@/lib/levantamentos/servidor'
import type { Finalidade } from '@/lib/levantamentos/types'

/**
 * Botão "Novo levantamento" → escolha da finalidade (um checklist para cada).
 * Dentro do projeto ou da OS, já nasce ligado e pré-preenchido.
 */
export function NovoLevantamento({ modelos, projetoId, osId, rotulo = 'Novo levantamento' }: {
  modelos: ModeloParaEscolha[]
  projetoId?: string | null
  osId?: string | null
  rotulo?: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [criando, setCriando] = useState<Finalidade | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(f: Finalidade) {
    setCriando(f); setErro(null)
    const r = await criarLevantamentoAction({ finalidade: f, projetoId, osId })
    if ('erro' in r) { setErro(r.erro); setCriando(null); return }
    router.push(`/levantamentos/${r.id}`)
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="px-4 py-2.5 bg-sol text-noite text-sm font-bold rounded-lg">
        + {rotulo}
      </button>
    )
  }
  return (
    <div className="w-full rounded-xl border border-sol/40 bg-white/[0.03] p-4 space-y-3">
      <p className="text-sm text-white"><b>Qual a finalidade?</b> <span className="text-white/60">Cada uma tem o próprio checklist.</span></p>
      <div className="grid gap-2">
        {modelos.map((m) => (
          <button key={m.codigo} type="button" disabled={!!criando} onClick={() => criar(m.codigo)}
            className="w-full text-start rounded-lg border border-white/15 hover:border-sol/60 px-4 py-3 transition disabled:opacity-60">
            <span className="block font-bold text-white">{m.nome}{criando === m.codigo ? ' — criando…' : ''}</span>
            <span className="block text-sm text-white/60">{m.descricao}</span>
          </button>
        ))}
      </div>
      {projetoId || osId ? (
        <p className="text-[11px] text-white/45">Os dados que o projeto já tem (cliente, endereço, UC, fatura, padrão, kit, telhado e levantamentos anteriores) entram preenchidos.</p>
      ) : null}
      {erro && <p className="text-sm text-coral">⚠ {erro}</p>}
      <button type="button" onClick={() => { setAberto(false); setErro(null) }} disabled={!!criando} className="px-3 py-2 text-sm text-white/60">Cancelar</button>
    </div>
  )
}
