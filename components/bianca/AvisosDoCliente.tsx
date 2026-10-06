'use client'

import { useCallback, useEffect, useState } from 'react'
import { AvisoCard, MiniCard } from '@/components/SinoBianca'

/**
 * Kalebe 2026-10-06: "as demais situações a Bianca deve avisar quando o
 * usuário abre o card do cliente". Recados da Bianca/Laís e sugestões de
 * mensagem daquele cliente (projetos + conversas dele), no topo do card.
 * Some quando não há nada.
 */
export function AvisosDoCliente({ clienteId, projetoId, conversaId, compacto = false }: {
  clienteId?: string | null; projetoId?: string | null; conversaId?: string | null; compacto?: boolean
}) {
  const [avisos, setAvisos] = useState<any[]>([])
  const [sugestoes, setSugestoes] = useState<any[]>([])
  const [aberto, setAberto] = useState(!compacto)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const q = new URLSearchParams()
    if (clienteId) q.set('cliente_id', clienteId)
    if (projetoId) q.set('projeto_id', projetoId)
    if (conversaId) q.set('conversa_id', conversaId)
    if (!q.toString()) return
    try {
      const r = await fetch(`/api/avisos/contexto?${q}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      setAvisos(j.avisos || [])
      setSugestoes(j.sugestoes || [])
    } catch {}
  }, [clienteId, projetoId, conversaId])

  useEffect(() => { carregar() }, [carregar])

  const total = avisos.length + sugestoes.length
  if (!total) return null

  async function cienteDeTodos() {
    setOcupado(true)
    try {
      await fetch('/api/avisos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: avisos.map((a) => a.id) }),
      })
      await carregar()
    } finally { setOcupado(false) }
  }

  return (
    <div className={`rounded-xl border border-sol/30 bg-sol/5 ${compacto ? 'mx-3 my-2 p-2.5' : 'mb-6 p-4'} space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setAberto(!aberto)} className="text-left">
          <p className="text-sm font-bold text-sol">🔔 Bianca avisa · {total} recado(s) deste cliente</p>
          {!aberto && <p className="text-[11px] text-white/50">toque pra ver</p>}
        </button>
        {aberto && avisos.length > 1 && (
          <button onClick={cienteDeTodos} disabled={ocupado}
            className="px-2 py-1 text-[10px] font-bold rounded border border-white/15 text-white/70 hover:text-white disabled:opacity-40">
            ✓ Ciente de todos
          </button>
        )}
      </div>
      {aberto && (
        <div className={`grid gap-2 ${compacto ? '' : 'md:grid-cols-2'}`}>
          {avisos.map((a) => <AvisoCard key={a.id} aviso={a} onAcao={carregar} mostrarProjeto={false} mostrarConversa={!conversaId} />)}
          {sugestoes.map((s) => <MiniCard key={s.id} sugestao={s} onAcao={carregar} />)}
        </div>
      )}
    </div>
  )
}
