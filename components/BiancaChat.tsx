'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Mensagem = {
  papel: 'usuario' | 'bianca'
  conteudo: string
  timestamp?: string
}

// Web Speech API types (não existem no TypeScript padrão)
type SpeechRecognitionType = any

export function BiancaChat({ historicoInicial }: { historicoInicial: Mensagem[] }) {
  const router = useRouter()
  const [mensagens, setMensagens] = useState<Mensagem[]>(historicoInicial)
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [suportaVoz, setSuportaVoz] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionType>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensagens])

  // Detecta se navegador suporta Web Speech API
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      setSuportaVoz(!!SR)
    }
  }, [])

  function iniciarGravacao() {
    if (gravando || enviando) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.')
      return
    }

    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    let textoFinal = ''

    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) textoFinal += res[0].transcript + ' '
        else interim += res[0].transcript
      }
      setInput((textoFinal + interim).trim())
    }

    rec.onerror = (e: any) => {
      console.error('[Bianca] Erro voz:', e.error)
      setGravando(false)
      if (e.error === 'not-allowed') {
        alert('Permissão de microfone negada. Ative nas configurações do site.')
      }
    }

    rec.onend = () => {
      setGravando(false)
      recognitionRef.current = null
      const textoFinalTrimado = textoFinal.trim()
      if (textoFinalTrimado.length > 0) {
        // Auto-envia se transcreveu algo
        setInput(textoFinalTrimado)
        setTimeout(() => enviarComTexto(textoFinalTrimado), 100)
      }
    }

    recognitionRef.current = rec
    setInput('')
    setGravando(true)
    rec.start()
  }

  function pararGravacao() {
    recognitionRef.current?.stop()
    setGravando(false)
  }

  async function enviarComTexto(texto: string) {
    if (!texto.trim() || enviando) return
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
      if (!res.ok) {
        const acao = data.error_acao ? `\n\n👉 ${data.error_acao}` : ''
        throw new Error((data.error || 'Erro no servidor') + acao)
      }
      if (data.chatArquivado) {
        // Bianca criou item — limpa chat local (mensagens migraram pro evento/tarefa)
        setMensagens([{
          papel: 'bianca',
          conteudo: `✓ Contexto salvo em ${data.itensCriados > 1 ? 'suas criações' : 'sua criação'}. Chat limpo — pode começar de novo!`,
        }])
      } else {
        setMensagens((prev) => [...prev, { papel: 'bianca', conteudo: data.resposta }])
      }
      router.refresh()
    } catch (e: any) {
      setMensagens((prev) => [
        ...prev,
        { papel: 'bianca', conteudo: `⚠️ ${e.message}` },
      ])
    } finally {
      setEnviando(false)
    }
  }

  async function enviar() {
    await enviarComTexto(input.trim())
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
          placeholder={gravando ? '🎤 Ouvindo...' : 'Escreve pra Bianca...'}
          disabled={enviando || gravando}
          autoFocus
          className={`flex-1 px-3 py-2 border rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50 ${
            gravando
              ? 'bg-coral/10 border-coral/40 placeholder:text-coral animate-pulse'
              : 'bg-noite/40 border-white/10 focus:border-sol/40'
          }`}
        />
        {suportaVoz && (
          <button
            onClick={gravando ? pararGravacao : iniciarGravacao}
            disabled={enviando}
            title={gravando ? 'Parar gravação' : 'Falar com Bianca'}
            className={`w-11 py-2 rounded-lg text-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${
              gravando
                ? 'bg-coral/20 border border-coral/50 text-coral animate-pulse'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {gravando ? '⏹' : '🎤'}
          </button>
        )}
        <button
          onClick={enviar}
          disabled={!input.trim() || enviando || gravando}
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
        className={`max-w-[85%] min-w-0 px-3 py-2 rounded-lg text-sm ${
          isUsuario
            ? 'bg-sol/20 text-white border border-sol/30'
            : 'bg-white/5 text-white/90 border border-white/10'
        } ${pulsante ? 'animate-pulse italic text-white/60' : ''}`}
      >
        {!isUsuario && !pulsante && (
          <div className="text-[9px] uppercase text-sol font-bold mb-1">Bianca</div>
        )}
        <div className="whitespace-pre-wrap break-words leading-relaxed overflow-hidden">
          {renderComLinks(conteudo)}
        </div>
      </div>
    </div>
  )
}

/**
 * Detecta URLs no texto e transforma em <a> clicável.
 * URLs de wa.me ganham botão verde destacado (chamada visual clara pra Kalebe).
 * Se detectar marker [[COM:{id}]], extrai o ID e adiciona botão "Enviar direto"
 * que chama POST /api/whatsapp/enviar (Meta Cloud API).
 */
function renderComLinks(texto: string): React.ReactNode[] {
  // 1. Extrai IDs de comunicacao (marker [[COM:xxx]]) e remove do texto visivel
  const comIds: string[] = []
  const textoLimpo = texto.replace(/\[\[COM:([a-f0-9-]{36})\]\]/gi, (_, id) => {
    comIds.push(id)
    return ''
  }).replace(/\s{2,}/g, ' ').trim()

  const regex = /(https?:\/\/[^\s<>]+)/g
  const partes: React.ReactNode[] = []
  let ultimo = 0
  let match: RegExpExecArray | null
  let idx = 0

  while ((match = regex.exec(textoLimpo)) !== null) {
    if (match.index > ultimo) {
      partes.push(textoLimpo.substring(ultimo, match.index))
    }
    const url = match[0]
    const ehWhatsApp = url.includes('wa.me/') || url.includes('api.whatsapp.com')
    partes.push(
      ehWhatsApp ? (
        <div key={`wa-${idx++}`} className="mt-2 flex flex-wrap gap-2 max-w-full">
          {/* Botao 1: enviar direto via Meta API (se houver ID de comunicacao) */}
          {comIds.length > 0 && (
            <EnviarDiretoWhatsApp comunicacaoId={comIds[0]} />
          )}
          {/* Botao 2: abrir WhatsApp Web (fallback / envio manual) */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 border border-white/20 text-white text-xs font-bold rounded hover:bg-white/15 break-all"
          >
            📱 Abrir WhatsApp Web
          </a>
        </div>
      ) : (
        <a
          key={`link-${idx++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sol underline hover:text-sol/80 break-all"
        >
          {url}
        </a>
      )
    )
    ultimo = regex.lastIndex
  }
  if (ultimo < textoLimpo.length) partes.push(textoLimpo.substring(ultimo))
  return partes
}

/**
 * Botao "Enviar direto" — chama POST /api/whatsapp/enviar (Meta Cloud API).
 * Se WHATSAPP_ACCESS_TOKEN nao configurado, backend retorna error_code
 * 'integration_missing' e a UI mostra dica pra configurar env vars.
 */
function EnviarDiretoWhatsApp({ comunicacaoId }: { comunicacaoId: string }) {
  const [status, setStatus] = useState<'idle' | 'enviando' | 'enviado' | 'erro'>('idle')
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    setStatus('enviando')
    setErro(null)
    try {
      const res = await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comunicacao_id: comunicacaoId }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.error_code === 'integration_missing') {
          setErro('Meta API não configurada. Use "Abrir WhatsApp Web" ou configure env vars no Vercel.')
        } else if (json.error_code === 'fora_janela_24h') {
          setErro('Cliente não interagiu nas últimas 24h. Precisa mensagem template pré-aprovada pela Meta.')
        } else {
          setErro(json.error || 'Erro ao enviar')
        }
        setStatus('erro')
        return
      }
      setStatus('enviado')
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede')
      setStatus('erro')
    }
  }

  if (status === 'enviado') {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-verde/20 border border-verde/40 text-verde text-xs font-bold rounded">
        ✓ Enviado via Bianca
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={enviar}
        disabled={status === 'enviando'}
        className="inline-flex items-center gap-1 px-3 py-1.5 bg-verde text-noite text-xs font-bold rounded hover:bg-verde/90 disabled:opacity-40"
      >
        {status === 'enviando' ? '⏳ Enviando...' : '🚀 Enviar direto'}
      </button>
      {erro && (
        <p className="text-[10px] text-coral max-w-xs leading-tight">⚠️ {erro}</p>
      )}
    </div>
  )
}
