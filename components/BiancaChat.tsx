'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Mensagem = {
  papel: 'usuario' | 'bianca'
  conteudo: string
  timestamp?: string
}

export function BiancaChat({ historicoInicial }: { historicoInicial: Mensagem[] }) {
  const router = useRouter()
  const [mensagens, setMensagens] = useState<Mensagem[]>(historicoInicial)
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensagens])

  async function enviar() {
    const texto = input.trim()
    if (!texto || enviando) return

    setInput('')
    setMensagens((prev) => [...prev, { papel: 'usuario', conteudo: texto }])
    setEnviando(true)

    try {
      const historicoRecente = mensagens.slice(-12)
      const res = await fetch('/api/bianca/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: texto, historico: historicoRecente }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro no servidor')
      setMensagens((prev) => [...prev, { papel: 'bianca', conteudo: data.resposta }])
      router.refresh()
    } catch (e: any) {
      setMensagens((prev) => [
        ...prev,
        { papel: 'bianca', conteudo: `Ops, deu erro: ${e.message}` },
      ])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden flex flex-col h-[600px]">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 bg-sol/5">
        <div className="text-2xl">👩‍💼</div>
        <div>
          <h3 className="text-sm font-bold text-white">Bianca</h3>
          <p className="text-[10px] text-verde flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-verde rounded-full animate-pulse" />
            online — secretária executiva IA
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {mensagens.length === 0 && (
          <div className="text-center py-12 text-white/40 text-sm">
            <div className="text-4xl mb-3">👋</div>
            <p className="mb-2">Manda uma mensagem pra Bianca começar!</p>
            <div className="mt-4 space-y-1 text-xs text-white/50">
              <p>💡 Ex: "Marca reunião com Vanildo amanhã 14h"</p>
              <p>💡 Ex: "O que tem pra hoje?"</p>
              <p>💡 Ex: "Cria tarefa: revisar proposta até sexta"</p>
            </div>
          </div>
        )}
        {mensagens.map((m, i) => (
          <Bolha key={i} papel={m.papel} conteudo={m.conteudo} />
        ))}
        {enviando && <Bolha papel="bianca" conteudo="digitando..." pulsante />}
      </div>

      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              enviar()
            }
          }}
          placeholder="Escreve pra Bianca..."
          disabled={enviando}
          autoFocus
          className="flex-1 px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-sol/40 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={enviar}
          disabled={!input.trim() || enviando}
          className="px-4 py-2 bg-sol/20 border border-sol/40 rounded-lg text-sm font-bold text-sol hover:bg-sol/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {enviando ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

function Bolha({
  papel,
  conteudo,
  pulsante,
}: {
  papel: 'usuario' | 'bianca'
  conteudo: string
  pulsante?: boolean
}) {
  const isUsuario = papel === 'usuario'
  return (
    <div className={`flex ${isUsuario ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
          isUsuario
            ? 'bg-sol/20 text-white border border-sol/30'
            : 'bg-white/5 text-white/90 border border-white/10'
        } ${pulsante ? 'animate-pulse italic text-white/60' : ''}`}
      >
        {!isUsuario && !pulsante && (
          <div className="text-[9px] uppercase text-sol font-bold mb-1">Bianca</div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">{conteudo}</div>
      </div>
    </div>
  )
}
