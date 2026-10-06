'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AvisoCard, MiniCard } from '@/components/SinoBianca'
import { descartarTodasSugestoesAction } from '@/app/bianca/sugestoes/actions'

/**
 * Central da Bianca (Kalebe 2026-10-06): todos os recados pendentes — avisos
 * dos agentes e sugestões de mensagem — com ações em lote: marcar todas como
 * lidas e excluir todas.
 */
export function CentralBiancaClient({ avisos, sugestoes }: { avisos: any[]; sugestoes: any[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function avisosEmLote(metodo: 'POST' | 'DELETE') {
    if (metodo === 'DELETE' && !confirm(`Excluir os ${avisos.length} aviso(s)? Não dá pra desfazer.`)) return
    setOcupado(true)
    try {
      const r = await fetch('/api/avisos', {
        method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todos: true }),
      })
      setMsg(r.ok ? (metodo === 'POST' ? 'Todos os avisos marcados como lidos.' : 'Avisos excluídos.') : 'Não consegui concluir — tente de novo.')
      router.refresh()
    } finally { setOcupado(false) }
  }

  async function descartarSugestoes() {
    if (!confirm(`Descartar as ${sugestoes.length} sugestão(ões) de mensagem?`)) return
    setOcupado(true)
    try {
      const r = await descartarTodasSugestoesAction()
      setMsg('erro' in r ? `Não consegui: ${r.erro}` : 'Sugestões descartadas.')
      router.refresh()
    } finally { setOcupado(false) }
  }

  const recarregar = async () => { router.refresh() }

  if (!avisos.length && !sugestoes.length) {
    return (
      <div className="p-12 bg-white/[0.02] border border-dashed border-white/10 rounded-xl text-center">
        <div className="text-5xl mb-3">🎯</div>
        <p className="text-lg font-bold text-white mb-1">Nada pendente!</p>
        <p className="text-sm text-white/50">
          Os recados da Bianca e da Laís aparecem aqui e no card de cada cliente quando você abre.
        </p>
        {msg && <p className="text-xs text-verde mt-3">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {msg && <div className="p-3 rounded-lg bg-verde/10 border border-verde/30 text-sm text-verde">{msg}</div>}

      {avisos.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">📣 Avisos <span className="text-white/40 font-normal">({avisos.length})</span></h2>
            <div className="flex gap-2">
              <button onClick={() => avisosEmLote('POST')} disabled={ocupado}
                className="px-3 py-2 bg-verde text-noite text-xs font-bold rounded-lg disabled:opacity-40">
                ✓ Marcar todas como lidas
              </button>
              <button onClick={() => avisosEmLote('DELETE')} disabled={ocupado}
                className="px-3 py-2 bg-coral/10 border border-coral/30 text-coral text-xs font-bold rounded-lg disabled:opacity-40">
                🗑 Excluir todas
              </button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {avisos.map((a) => <AvisoCard key={a.id} aviso={a} onAcao={recarregar} />)}
          </div>
        </section>
      )}

      {sugestoes.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">💡 Sugestões de mensagem <span className="text-white/40 font-normal">({sugestoes.length})</span></h2>
            <button onClick={descartarSugestoes} disabled={ocupado}
              className="px-3 py-2 bg-coral/10 border border-coral/30 text-coral text-xs font-bold rounded-lg disabled:opacity-40">
              🗑 Descartar todas
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {sugestoes.map((s) => <MiniCard key={s.id} sugestao={s} onAcao={recarregar} />)}
          </div>
        </section>
      )}
    </div>
  )
}
