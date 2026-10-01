'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  buscarConversaDoProjetoAction,
  abrirCanalDoProjetoAction,
} from '@/app/inbox/actions'
import { ComposerWhatsApp } from '@/components/chat/ComposerWhatsApp'
import { rotuloNaTela } from '@/lib/equipe/rotulo'

/**
 * Kalebe 2026-09-15: 'acesso a conversa e comunicação diretamente com
 * o cliente dentro do seu card também'.
 *
 * Mini-inbox contextual dentro da página do projeto. Mostra últimas
 * mensagens WhatsApp + composição inline. Realtime.
 */
export function ConversaClienteCard({ projetoId }: { projetoId: string }) {
  const [dados, setDados] = useState<{
    conversa: any | null
    contato: any | null
    mensagens: any[]
    telefone_projeto?: string | null
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    const r = await buscarConversaDoProjetoAction(projetoId, 30)
    if ('erro' in r) return
    setDados(r)
  }

  useEffect(() => {
    refresh()
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    let t: any = null
    const debounced = () => { if (t) clearTimeout(t); t = setTimeout(refresh, 400) }
    const canal = supabase
      .channel(`conv-projeto-${projetoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, debounced)
      .subscribe()
    return () => { supabase.removeChannel(canal); if (t) clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId])

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight
    }
  }, [dados?.mensagens.length])

  // Kalebe 2026-09-29: sem conversa ainda, o 1º envio (texto, arquivo ou
  // chamada) abre o canal do projeto antes — antes a caixa só mandava pro inbox.
  async function garantirConversa(): Promise<string | null> {
    if (dados?.conversa?.id) return dados.conversa.id
    const r = await abrirCanalDoProjetoAction(projetoId)
    if ('erro' in r) { setErro(r.erro); return null }
    return r.conversa_id
  }

  if (!dados) {
    return (
      <SectionCard>
        <p className="text-xs text-white/40 italic p-4 text-center">Carregando conversa...</p>
      </SectionCard>
    )
  }

  const telefone = dados.contato?.telefone || dados.telefone_projeto || null
  if (!telefone) {
    return (
      <SectionCard>
        <div className="p-4 text-center">
          <p className="text-sm text-white/60">Cliente ainda não tem telefone cadastrado.</p>
          <p className="text-[11px] text-white/40 mt-1">Adicione um WhatsApp na seção Cliente pra iniciar conversa.</p>
        </div>
      </SectionCard>
    )
  }

  const janelaExpirada = dados.conversa?.janela_24h_expira_em
    ? new Date(dados.conversa.janela_24h_expira_em) < new Date()
    : true
  const statusInfo = dados.conversa ? ({
    'nova': { cor: 'text-weg-azul', label: 'Nova' },
    'em_qualificacao': { cor: 'text-weg-azul', label: 'IA qualificando' },
    'aguardando_representante': { cor: 'text-sol', label: 'Aguardando rep' },
    'em_atendimento': { cor: 'text-verde', label: 'Em atendimento' },
    'em_atendimento_ia': { cor: 'text-weg-azul', label: 'IA atendendo' },
    'encerrada': { cor: 'text-white/50', label: 'Encerrada' },
  }[dados.conversa.status as string] || { cor: 'text-white/60', label: dados.conversa.status })
    : { cor: 'text-white/50', label: 'Sem conversa ainda' }

  return (
    <SectionCard>
      {/* Header compacto */}
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-white/[0.06] ${statusInfo.cor}`}>
            {statusInfo.label}
          </span>
          {dados.conversa?.agente_ativo && (
            <span className="text-[10px] text-weg-azul">🤖 {dados.conversa.agente_ativo}</span>
          )}
          <span className="text-[10px] text-white/40 font-mono truncate">{telefone}</span>
          {janelaExpirada && (
            <span className="text-[9px] text-coral uppercase tracking-wider font-bold" title="Janela de 24h fechada — só modelo aprovado pela Meta">
              janela 24h ✕
            </span>
          )}
        </div>
        {dados.conversa && (
          <Link
            href={`/inbox?c=${dados.conversa.id}`}
            className="text-[10px] text-sol hover:text-sol/80 font-bold uppercase tracking-wider shrink-0"
          >
            Abrir Inbox →
          </Link>
        )}
      </div>

      {/* Timeline compacta */}
      <div
        ref={timelineRef}
        className="max-h-64 overflow-y-auto p-3 space-y-1.5 bg-noite/40"
      >
        {dados.mensagens.length === 0 ? (
          <p className="text-xs text-white/40 italic text-center py-4">Sem mensagens ainda.</p>
        ) : (
          dados.mensagens.map((m) => <BolhaCompacta key={m.id} m={m} />)
        )}
      </div>

      {/* Composição */}
      <div className="p-3 border-t border-white/10 space-y-2">
        {janelaExpirada && (
          <p className="text-[10px] text-white/45">
            O cliente não mandou mensagem pro número da Spin nas últimas 24h — o WhatsApp só entrega texto e
            arquivo depois que ele responder (ou por modelo aprovado).
          </p>
        )}
        {erro && (
          <p className="text-[11px] text-coral bg-coral/10 border border-coral/30 rounded p-2">{erro}</p>
        )}
        <ComposerWhatsApp
          obterConversaId={garantirConversa}
          placeholder="Mensagem pro cliente"
          onEnviado={refresh}
          onErro={setErro}
        />
      </div>
    </SectionCard>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-white/50 font-bold">💬 Conversa com o cliente</span>
        </div>
      </header>
      {children}
    </section>
  )
}

function BolhaCompacta({ m }: { m: any }) {
  const isInbound = m.direcao === 'inbound'
  // Kalebe 2026-10-01: pessoa da equipe por "primeiro nome · setor"
  const nome = rotuloNaTela(m)
  const hora = new Date(m.criada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const statusIcon = m.status_entrega === 'lida' ? '✓✓'
    : m.status_entrega === 'entregue' ? '✓✓'
    : m.status_entrega === 'enviada' ? '✓'
    : m.status_entrega === 'falhou' ? '⚠' : ''
  const statusCor = m.status_entrega === 'lida' ? 'text-weg-azul'
    : m.status_entrega === 'falhou' ? 'text-coral' : 'text-white/40'

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] rounded px-2.5 py-1.5 ${
        isInbound ? 'bg-white/[0.05] border border-white/10' : 'bg-verde/15 border border-verde/30'
      }`}>
        {!isInbound && nome && (
          <p className="text-[9px] font-bold text-verde mb-0.5">{nome}</p>
        )}
        {m.tipo === 'text' ? (
          <p className="text-xs text-white whitespace-pre-wrap break-words">{m.texto || ''}</p>
        ) : m.tipo === 'audio' && m.midia_meta_id ? (
          <audio controls src={`/api/whatsapp/media/${m.midia_meta_id}`} className="max-w-full h-8 mt-0.5" />
        ) : m.tipo === 'image' && m.midia_meta_id ? (
          <img src={`/api/whatsapp/media/${m.midia_meta_id}`} alt="" className="max-w-full max-h-40 rounded mt-0.5" />
        ) : m.tipo === 'video' && m.midia_meta_id ? (
          <video controls src={`/api/whatsapp/media/${m.midia_meta_id}`} className="max-w-full max-h-40 rounded mt-0.5" />
        ) : m.tipo === 'document' && m.midia_meta_id ? (
          <a href={`/api/whatsapp/media/${m.midia_meta_id}`} target="_blank" rel="noopener" className="text-xs text-white underline">
            📎 Baixar documento
          </a>
        ) : (
          <p className="text-xs text-white italic">[{m.tipo}]</p>
        )}
        <p className={`text-[9px] mt-0.5 flex items-center gap-1 ${isInbound ? 'text-white/40' : 'text-white/50 justify-end'}`}>
          <span>{hora}</span>
          {!isInbound && <span className={statusCor}>{statusIcon}</span>}
        </p>
      </div>
    </div>
  )
}
