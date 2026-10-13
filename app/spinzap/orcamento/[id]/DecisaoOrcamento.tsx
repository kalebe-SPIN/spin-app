'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { aprovarOrcamentoLaisAction, recusarOrcamentoLaisAction } from '../actions'

/** Botões de decisão do orçamento da Laís (Kalebe 2026-10-10). */
export function DecisaoOrcamento({ id, barrado }: { id: string; barrado: boolean }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')

  async function aprovar() {
    if (barrado && !confirm('O auditor barrou este orçamento. Enviar mesmo assim?')) return
    setOcupado(true); setErro(null)
    try {
      const r = await aprovarOrcamentoLaisAction(id)
      if ('erro' in r) setErro(r.erro)
      else router.refresh()
    } finally { setOcupado(false) }
  }
  async function recusar() {
    setOcupado(true); setErro(null)
    try {
      const r = await recusarOrcamentoLaisAction(id, motivo)
      if ('erro' in r) setErro(r.erro)
      else router.refresh()
    } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-2">
      {!recusando ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={aprovar} disabled={ocupado} className="px-4 py-2 rounded-lg bg-verde text-white text-sm font-bold disabled:opacity-50">
            {ocupado ? 'Enviando…' : 'Aprovar e enviar ao cliente'}
          </button>
          <button onClick={() => setRecusando(true)} disabled={ocupado} className="px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white/80 text-sm font-bold">
            Segurar / ajustar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus
            placeholder="Por que segurar? (fica no histórico da conversa; a equipe assume o atendimento)"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={recusar} disabled={ocupado || motivo.trim().length < 3} className="px-4 py-2 rounded-lg bg-coral text-white text-sm font-bold disabled:opacity-50">
              {ocupado ? 'Salvando…' : 'Confirmar'}
            </button>
            <button onClick={() => setRecusando(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white/70 text-sm">Voltar</button>
          </div>
        </div>
      )}
      {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
    </div>
  )
}
