'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Mensagem = {
  papel: 'usuario' | 'davi'
  conteudo: string
  timestamp?: string
}

export function DaviChat({ historicoInicial }: { historicoInicial: Mensagem[] }) {
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
    setMensagens((p) => [...p, { papel: 'usuario', conteudo: texto }])
    setEnviando(true)
    try {
      const res = await fetch('/api/davi/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: texto, historico: mensagens.slice(-12) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')
      setMensagens((p) => [...p, { papel: 'davi', conteudo: data.resposta }])
      router.refresh()
    } catch (e: any) {
      setMensagens((p) => [...p, { papel: 'davi', conteudo: `Ops, deu erro: ${e.message}` }])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden flex flex-col h-[600px]">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 bg-weg-azul/5">
        <div className="text-2xl">👔</div>
        <div>
          <h3 className="text-sm font-bold text-white">Davi de Compras</h3>
          <p className="text-[10px] text-verde flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-verde rounded-full animate-pulse" />
            online — auditor de preços da Spin
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {mensagens.length === 0 && (
          <div className="text-center py-12 text-white/40 text-sm">
            <div className="text-4xl mb-3">💰</div>
            <p className="mb-2">Fala com o Davi pra cotar preços!</p>
            <div className="mt-4 space-y-1 text-xs text-white/50">
              <p>💡 "Quais produtos estão sem preço?"</p>
              <p>💡 "Como estamos?"</p>
              <p>💡 "Recebi cotação do disjuntor 40A por R$ 45 no Materials"</p>
              <p>💡 "Que preços estão desatualizados?"</p>
            </div>
          </div>
        )}
        {mensagens.map((m, i) => (
          <Bolha key={i} papel={m.papel} conteudo={m.conteudo} />
        ))}
        {enviando && <Bolha papel="davi" conteudo="analisando..." pulsante />}
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
          placeholder="Cola cotação, pergunta preço, pede análise..."
          disabled={enviando}
          autoFocus
          className="flex-1 px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-weg-azul/40 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={enviar}
          disabled={!input.trim() || enviando}
          className="px-4 py-2 bg-weg-azul/20 border border-weg-azul/40 rounded-lg text-sm font-bold text-weg-azul hover:bg-weg-azul/30 disabled:opacity-40"
        >
          {enviando ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

function Bolha({ papel, conteudo, pulsante }: { papel: 'usuario' | 'davi'; conteudo: string; pulsante?: boolean }) {
  const isUsuario = papel === 'usuario'
  return (
    <div className={`flex ${isUsuario ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
        isUsuario
          ? 'bg-weg-azul/20 text-white border border-weg-azul/30'
          : 'bg-white/5 text-white/90 border border-white/10'
      } ${pulsante ? 'animate-pulse italic text-white/60' : ''}`}>
        {!isUsuario && !pulsante && <div className="text-[9px] uppercase text-weg-azul font-bold mb-1">Davi</div>}
        <div className="whitespace-pre-wrap leading-relaxed">{conteudo}</div>
      </div>
    </div>
  )
}
