'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { enviarMensagemParAction, novaConversaParAction } from '@/app/agenda/chat-par/actions'

type Mensagem = { id: string; autor_id: string; conteudo: string; created_at: string }

/**
 * Chat par-a-par (vendedor ↔ campo). Polling a cada 3s (simples e suficiente
 * pra volume baixo). Botão "Nova conversa" fecha thread atual e cria outra —
 * histórico some da UI mas fica no banco.
 */
export function ChatParEmpresa({
  meuId,
  peerId,
  peerNome,
}: {
  meuId: string
  peerId: string
  peerNome: string
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [isPending, startTransition] = useTransition()
  const [carregando, setCarregando] = useState(true)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const fim = useRef<HTMLDivElement>(null)

  async function carregar() {
    // Pega thread ativa
    const [a, b] = meuId < peerId ? [meuId, peerId] : [peerId, meuId]
    const { data: thread } = await supabase
      .from('chat_par_threads')
      .select('id')
      .eq('participante_a', a)
      .eq('participante_b', b)
      .is('encerrada_em', null)
      .maybeSingle()

    if (!thread?.id) { setMensagens([]); setCarregando(false); return }

    const { data: msgs } = await supabase
      .from('chat_par_mensagens')
      .select('id, autor_id, conteudo, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })

    setMensagens(msgs || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerId, meuId])

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  function enviar() {
    if (!texto.trim()) return
    const conteudo = texto
    setTexto('')
    startTransition(async () => {
      const r = await enviarMensagemParAction(peerId, conteudo)
      if (r?.erro) alert(r.erro)
      await carregar()
    })
  }

  function novaConversa() {
    if (!confirm(`Fechar essa conversa com ${peerNome} e começar outra? O histórico permanece no banco.`)) return
    startTransition(async () => {
      await novaConversaParAction(peerId)
      await carregar()
    })
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl flex flex-col h-[420px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-verde animate-pulse" />
          <p className="text-sm font-bold text-white">{peerNome.split(' ')[0]}</p>
          <span className="text-[10px] uppercase tracking-wider text-white/40">chat direto</span>
        </div>
        <button
          onClick={novaConversa}
          disabled={isPending}
          className="text-[11px] text-white/40 hover:text-sol transition-colors"
        >
          🗑 nova conversa
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {carregando ? (
          <p className="text-xs text-white/30 text-center py-8">carregando...</p>
        ) : mensagens.length === 0 ? (
          <p className="text-xs text-white/30 text-center py-8">
            Sem mensagens. Manda uma pra {peerNome.split(' ')[0]} — o par recebe pelo mesmo painel.
          </p>
        ) : (
          mensagens.map((m) => {
            const meu = m.autor_id === meuId
            return (
              <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                  meu ? 'bg-sol/20 text-white border border-sol/30' : 'bg-white/5 text-white border border-white/10'
                }`}>
                  <p className="leading-snug whitespace-pre-wrap">{m.conteudo}</p>
                  <p className="text-[9px] opacity-40 mt-1">
                    {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={fim} />
      </div>

      <div className="p-2 border-t border-white/10 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), enviar())}
          placeholder={`Mensagem para ${peerNome.split(' ')[0]}...`}
          disabled={isPending}
          className="flex-1 px-3 py-1.5 bg-white/5 border border-white/15 rounded-lg text-sm text-white placeholder:text-white/30"
        />
        <button
          onClick={enviar}
          disabled={isPending || !texto.trim()}
          className="px-4 py-1.5 bg-sol/20 border border-sol/40 text-sol text-sm font-bold rounded-lg hover:bg-sol/30 disabled:opacity-40"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
