'use client'

import { useState, useTransition } from 'react'
import { registrarComunicacaoAction, adicionarComentarioAction } from '@/app/agenda/actions'

export function NovaComunicacaoForm({
  tarefaId, eventoId, projetoId, destinatarioSugerido,
}: {
  tarefaId: string | null
  eventoId: string | null
  projetoId: string | null
  destinatarioSugerido: string
}) {
  const [aberto, setAberto] = useState(false)
  const [canal, setCanal] = useState<'whatsapp' | 'email'>('whatsapp')
  const [destinatarioNome, setDestinatarioNome] = useState(destinatarioSugerido)
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [isPending, startTransition] = useTransition()
  const [linkWa, setLinkWa] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function enviar(marcarEnviada = false) {
    setErro(null)
    if (!mensagem.trim()) { setErro('Escreva a mensagem'); return }
    if (canal === 'whatsapp' && !telefone.trim()) { setErro('Informe o telefone'); return }
    if (canal === 'email' && !email.trim()) { setErro('Informe o email'); return }

    startTransition(async () => {
      const res = await registrarComunicacaoAction({
        canal,
        destinatario_nome: destinatarioNome,
        destinatario_telefone: canal === 'whatsapp' ? telefone : undefined,
        destinatario_email: canal === 'email' ? email : undefined,
        assunto: canal === 'email' ? assunto : undefined,
        mensagem,
        tarefaId,
        eventoId,
        projetoId,
        marcar_como_enviada: marcarEnviada,
      })
      if ('erro' in res && res.erro) { setErro(res.erro); return }
      if (res.link_wa) setLinkWa(res.link_wa)
      setMensagem('')
      if (marcarEnviada) {
        setAberto(false)
        setLinkWa(null)
      }
    })
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full px-3 py-2 bg-verde/10 border border-verde/30 text-verde text-xs font-bold rounded hover:bg-verde/20"
      >
        + Registrar nova comunicação (WhatsApp/Email)
      </button>
    )
  }

  return (
    <div className="p-3 bg-noite/40 border border-verde/30 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button type="button" onClick={() => setCanal('whatsapp')}
            className={`px-3 py-1 text-xs font-bold rounded ${canal === 'whatsapp' ? 'bg-verde text-noite' : 'bg-white/5 text-white/60'}`}>
            📱 WhatsApp
          </button>
          <button type="button" onClick={() => setCanal('email')}
            className={`px-3 py-1 text-xs font-bold rounded ${canal === 'email' ? 'bg-verde text-noite' : 'bg-white/5 text-white/60'}`}>
            📧 Email
          </button>
        </div>
        <button type="button" onClick={() => { setAberto(false); setLinkWa(null) }}
          className="text-xs text-white/40 hover:text-white/80">✗</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text" value={destinatarioNome}
          onChange={(e) => setDestinatarioNome(e.target.value)}
          placeholder="Nome do destinatário"
          className="px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40"
        />
        {canal === 'whatsapp' ? (
          <input
            type="tel" value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(48) 99999-9999"
            className="px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40"
          />
        ) : (
          <input
            type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@cliente.com.br"
            className="px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40"
          />
        )}
      </div>

      {canal === 'email' && (
        <input
          type="text" value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          placeholder="Assunto do email"
          className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40"
        />
      )}

      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder={canal === 'whatsapp' ? 'Oi Fulano! Passando pra confirmar a reunião de amanhã...' : 'Prezado(a) Fulano,\n\nSegue...'}
        rows={4}
        className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40 resize-y"
      />

      {erro && <p className="text-xs text-coral">⚠️ {erro}</p>}

      {linkWa ? (
        <div className="p-2 bg-verde/10 border border-verde/30 rounded space-y-2">
          <p className="text-xs text-verde">✓ Comunicação registrada. Clique pra abrir no WhatsApp:</p>
          <a href={linkWa} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-verde text-noite text-xs font-bold rounded hover:bg-verde/90">
            📱 Abrir no WhatsApp
          </a>
          <button type="button" onClick={() => enviar(true)} disabled={isPending}
            className="ml-2 px-3 py-1.5 bg-white/10 border border-white/20 text-white text-xs font-bold rounded hover:bg-white/20">
            ✓ Marcar como enviada
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => enviar(false)}
            disabled={isPending}
            className="flex-1 px-3 py-1.5 bg-verde text-noite text-xs font-bold rounded hover:bg-verde/90 disabled:opacity-40"
          >
            {isPending ? '⏳ Registrando...' : '💾 Registrar (gera link WhatsApp)'}
          </button>
        </div>
      )}
    </div>
  )
}

export function ComentarioForm({
  tarefaId, eventoId,
}: {
  tarefaId: string | null
  eventoId: string | null
}) {
  const [texto, setTexto] = useState('')
  const [isPending, startTransition] = useTransition()

  function enviar() {
    if (!texto.trim()) return
    startTransition(async () => {
      await adicionarComentarioAction({
        tarefaId: tarefaId || undefined,
        eventoId: eventoId || undefined,
        observacao: texto,
      })
      setTexto('')
    })
  }

  return (
    <div className="flex gap-2">
      <input
        type="text" value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && enviar()}
        placeholder="+ Adicionar comentário/observação..."
        className="flex-1 px-3 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40"
      />
      <button
        type="button" onClick={enviar} disabled={isPending || !texto.trim()}
        className="px-3 py-1.5 bg-sol/20 border border-sol/40 text-sol text-xs font-bold rounded hover:bg-sol/30 disabled:opacity-40"
      >
        {isPending ? '⏳' : '💬'}
      </button>
    </div>
  )
}
