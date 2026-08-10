'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export type Par = { id: string; nome: string; role: string }

export function SeletorPar({
  meuId,
  meuNome,
  pares,
  donoAtualId,
}: {
  meuId: string
  meuNome: string
  pares: Par[]
  donoAtualId: string
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function trocar(novoId: string) {
    const qs = new URLSearchParams(sp?.toString() || '')
    if (novoId === meuId) qs.delete('agenda')
    else qs.set('agenda', novoId)
    router.push(`/agenda${qs.toString() ? `?${qs}` : ''}`)
  }

  if (pares.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Vendo</span>
      <select
        value={donoAtualId}
        onChange={(e) => trocar(e.target.value)}
        className="bg-white/5 border border-white/15 text-white text-sm px-3 py-1.5 rounded-lg"
      >
        <option value={meuId} className="bg-noite">👤 Minha agenda — {meuNome.split(' ')[0]}</option>
        {pares.map((p) => (
          <option key={p.id} value={p.id} className="bg-noite">
            {p.role === 'vendedor_servicos' ? '🧽' : '🚐'} {p.nome} ({rotuloRole(p.role)})
          </option>
        ))}
      </select>
    </div>
  )
}

function rotuloRole(role: string) {
  if (role === 'vendedor_servicos') return 'vendedor'
  if (role === 'profissional_campo') return 'campo'
  return role
}
