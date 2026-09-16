'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  listarConversasAction,
  listarMensagensAction,
  enviarTextoAction,
  assumirConversaAction,
  encerrarConversaAction,
  abrirConversaManualAction,
  iniciarChamadaAction,
  enviarArquivoAction,
} from '@/app/inbox/actions'

type Conversa = {
  id: string
  status: string
  responsavel_id: string | null
  agente_ativo: string | null
  origem_campanha: string | null
  ultima_mensagem_em: string | null
  janela_24h_expira_em: string | null
  sla_prazo_em: string | null
  criada_em: string
  encerrada_em: string | null
  contato: {
    id: string
    telefone: string
    nome_exibicao: string | null
    tipo: string
    cliente_id: string | null
    projeto_id: string | null
  } | null
  responsavel: { nome_completo: string | null } | null
}

type Mensagem = {
  id: string
  direcao: 'inbound' | 'outbound'
  tipo: string
  texto: string | null
  midia_url: string | null
  midia_mime: string | null
  midia_duracao_seg: number | null
  remetente_id: string | null
  remetente_agente: string | null
  origem_agente_nome: string | null
  status_entrega: string
  erro: string | null
  criada_em: string
  entregue_em: string | null
  lida_em: string | null
  remetente: { nome_completo: string | null } | null
}

export function InboxClient({
  usuarioId,
  usuarioNome,
  usuarioRole,
}: {
  usuarioId: string
  usuarioNome: string | null
  usuarioRole: string | null
}) {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [textoEnvio, setTextoEnvio] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'minhas' | 'sem_atendente' | 'nova'>('todas')
  const [modalAberto, setModalAberto] = useState(false)
  const [novoTelefone, setNovoTelefone] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [isPending, startTransition] = useTransition()
  const timelineRef = useRef<HTMLDivElement>(null)

  async function refreshConversas() {
    const r = await listarConversasAction()
    if ('conversas' in r) setConversas(r.conversas as any)
  }
  async function refreshMensagens(id: string) {
    const r = await listarMensagensAction(id)
    if ('mensagens' in r) setMensagens(r.mensagens as any)
  }

  // Fetch inicial + Realtime
  useEffect(() => {
    refreshConversas()
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const canal = supabase
      .channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, () => {
        refreshConversas()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, (payload) => {
        refreshConversas()
        const nova = (payload.new as any)?.conversa_id
        if (nova && nova === selecionadaId) refreshMensagens(nova)
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-fetch mensagens ao trocar conversa
  useEffect(() => {
    if (selecionadaId) refreshMensagens(selecionadaId)
    else setMensagens([])
  }, [selecionadaId])

  // Fallback refresh de 60s — cobre caso Realtime dropar.
  // Só bate quando aba está visível pra não gastar toa.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      refreshConversas()
      if (selecionadaId) refreshMensagens(selecionadaId)
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [selecionadaId])

  // Scroll ao chegar msg nova
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight
  }, [mensagens])

  // Filtros
  const conversasFiltradas = conversas.filter((c) => {
    if (filtro === 'minhas') return c.responsavel_id === usuarioId && !c.encerrada_em
    if (filtro === 'sem_atendente') return !c.responsavel_id && !c.encerrada_em
    if (filtro === 'nova') return c.status === 'nova' && !c.encerrada_em
    return true
  })

  const selecionada = conversas.find((c) => c.id === selecionadaId) || null

  function enviar() {
    if (!selecionadaId || !textoEnvio.trim()) return
    setErro(null)
    startTransition(async () => {
      const r = await enviarTextoAction({ conversa_id: selecionadaId, texto: textoEnvio })
      if ('erro' in r) { setErro(r.erro); return }
      setTextoEnvio('')
      refreshMensagens(selecionadaId)
    })
  }

  function assumir() {
    if (!selecionadaId) return
    setErro(null)
    startTransition(async () => {
      const r = await assumirConversaAction(selecionadaId)
      if ('erro' in r) { setErro(r.erro); return }
      refreshConversas()
    })
  }

  function encerrar() {
    if (!selecionadaId) return
    if (!confirm('Encerrar conversa?')) return
    setErro(null)
    startTransition(async () => {
      const r = await encerrarConversaAction(selecionadaId)
      if ('erro' in r) { setErro(r.erro); return }
      setSelecionadaId(null)
      refreshConversas()
    })
  }

  function abrirManual() {
    if (!novoTelefone.trim()) return
    setErro(null)
    startTransition(async () => {
      const r = await abrirConversaManualAction({
        telefone: novoTelefone.replace(/\D/g, ''),
        nome_exibicao: novoNome || undefined,
      })
      if ('erro' in r) { setErro(r.erro); return }
      setNovoTelefone(''); setNovoNome(''); setModalAberto(false)
      setSelecionadaId(r.conversa_id)
      refreshConversas()
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0 min-h-[calc(100vh-96px)]">
      {/* ─── Lista de conversas ─── */}
      <aside className="border-r border-white/10 flex flex-col">
        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="grid grid-cols-4 gap-1 text-[10px] font-bold uppercase tracking-wider">
            {(['todas','minhas','sem_atendente','nova'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-2 py-1.5 rounded ${filtro === f ? 'bg-sol/20 text-sol' : 'bg-white/[0.03] text-white/50 hover:bg-white/5'}`}
              >
                {f === 'sem_atendente' ? 'S/ dono' : f}
              </button>
            ))}
          </div>
          {usuarioRole === 'admin' && (
            <button
              onClick={() => setModalAberto(true)}
              className="w-full px-3 py-1.5 rounded bg-verde/20 border border-verde/40 text-verde text-xs font-bold hover:bg-verde/30"
            >
              + Abrir conversa manual
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversasFiltradas.length === 0 ? (
            <p className="p-4 text-xs text-white/40 italic text-center">Nenhuma conversa nesse filtro.</p>
          ) : (
            conversasFiltradas.map((c) => (
              <ItemConversa
                key={c.id}
                c={c}
                selecionada={c.id === selecionadaId}
                onClick={() => setSelecionadaId(c.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ─── Detalhe da conversa ─── */}
      <section className="flex flex-col">
        {!selecionada ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
            Selecione uma conversa à esquerda.
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {selecionada.contato?.nome_exibicao || selecionada.contato?.telefone || 'Contato'}
                </p>
                <p className="text-[11px] text-white/50 font-mono">
                  {selecionada.contato?.telefone}
                  <span className="ml-2 text-white/40">· {selecionada.status.replace(/_/g, ' ')}</span>
                  {selecionada.responsavel?.nome_completo && (
                    <span className="ml-2 text-white/60">👤 {selecionada.responsavel.nome_completo}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(!selecionada.responsavel_id || selecionada.responsavel_id !== usuarioId) && (
                  <button
                    onClick={assumir}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded bg-sol/20 border border-sol/40 text-sol text-xs font-bold hover:bg-sol/30 disabled:opacity-40"
                  >
                    Assumir
                  </button>
                )}
                {!selecionada.encerrada_em && (
                  <button
                    onClick={encerrar}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded bg-coral/10 border border-coral/30 text-coral text-xs font-bold hover:bg-coral/20 disabled:opacity-40"
                  >
                    Encerrar
                  </button>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div ref={timelineRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-noite/60">
              {mensagens.length === 0 ? (
                <p className="text-xs text-white/40 italic text-center py-8">Sem mensagens ainda.</p>
              ) : (
                mensagens.map((m) => <BolhaMensagem key={m.id} m={m} />)
              )}
            </div>

            {/* Composição — Kalebe 2026-09-14: botões arquivo + chamada + vídeo */}
            <div className="p-3 border-t border-white/10 space-y-2">
              {erro && <p className="text-xs text-coral bg-coral/10 border border-coral/30 rounded p-2">{erro}</p>}
              <BarraAcoes
                conversaId={selecionadaId!}
                onErro={setErro}
                onFeito={() => selecionadaId && refreshMensagens(selecionadaId)}
              />
              <div className="flex items-end gap-2">
                <textarea
                  value={textoEnvio}
                  onChange={(e) => setTextoEnvio(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
                  }}
                  placeholder={`Escrever como *${usuarioNome || 'Você'}* (Enter envia)`}
                  className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white resize-none min-h-[42px] max-h-32"
                  rows={1}
                />
                <button
                  onClick={enviar}
                  disabled={isPending || !textoEnvio.trim()}
                  className="px-4 py-2 rounded bg-sol text-noite text-sm font-bold disabled:opacity-40"
                >
                  {isPending ? '...' : 'Enviar'}
                </button>
              </div>
              <p className="text-[10px] text-white/40">
                A mensagem sai prefixada com seu nome. Chamadas geram sala Jitsi (funciona no navegador).
              </p>
            </div>
          </>
        )}
      </section>

      {/* Modal — abrir conversa manual */}
      {modalAberto && (
        <div className="fixed inset-0 bg-noite/80 flex items-center justify-center p-4 z-50" onClick={() => setModalAberto(false)}>
          <div className="bg-noite border border-white/10 rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Abrir conversa manual</h3>
            <div className="space-y-2">
              <input
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                placeholder="Telefone (só números, ex 5548999998888)"
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white font-mono"
              />
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome exibição (opcional)"
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white"
              />
            </div>
            {erro && <p className="text-xs text-coral mt-2">{erro}</p>}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setModalAberto(false)} className="text-xs text-white/60">Cancelar</button>
              <button
                onClick={abrirManual}
                disabled={isPending || !novoTelefone.trim()}
                className="px-4 py-2 rounded bg-verde text-noite text-xs font-bold disabled:opacity-40"
              >
                Abrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemConversa({ c, selecionada, onClick }: {
  c: Conversa; selecionada: boolean; onClick: () => void
}) {
  const nome = c.contato?.nome_exibicao || c.contato?.telefone || 'Sem nome'
  const encerrada = !!c.encerrada_em
  const status = c.status.replace(/_/g, ' ')
  const dt = c.ultima_mensagem_em ? new Date(c.ultima_mensagem_em) : null
  const hora = dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-white/5 transition ${
        selecionada ? 'bg-sol/[0.06] border-l-2 border-l-sol' : 'hover:bg-white/[0.02]'
      } ${encerrada ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white truncate flex-1">{nome}</p>
        <span className="text-[10px] text-white/40 font-mono shrink-0">{hora}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className={`text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded ${
          c.status === 'aguardando_representante' ? 'bg-sol/20 text-sol'
            : c.status === 'em_atendimento' ? 'bg-verde/20 text-verde'
            : c.status === 'encerrada' ? 'bg-white/10 text-white/50'
            : 'bg-weg-azul/20 text-weg-azul'
        }`}>
          {status}
        </span>
        {c.responsavel && (
          <span className="text-[10px] text-white/50 truncate">
            👤 {c.responsavel.nome_completo?.split(' ')[0]}
          </span>
        )}
      </div>
    </button>
  )
}

function BarraAcoes({
  conversaId, onErro, onFeito,
}: {
  conversaId: string
  onErro: (msg: string | null) => void
  onFeito: () => void
}) {
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState<'arquivo' | 'voz' | 'video' | null>(null)

  async function iniciar(tipo: 'voz' | 'video') {
    onErro(null); setEnviando(tipo)
    try {
      const r = await iniciarChamadaAction({ conversa_id: conversaId, tipo })
      if ('erro' in r) { onErro(r.erro); return }
      // Abre a sala do lado do Kalebe automaticamente
      window.open(r.url_sala, '_blank', 'noopener')
      onFeito()
    } finally { setEnviando(null) }
  }

  async function enviarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onErro(null); setEnviando('arquivo')
    try {
      // Limite Meta: 5MB imagens, 16MB áudio/vídeo, 100MB documento
      if (file.size > 100 * 1024 * 1024) {
        onErro('Arquivo maior que 100MB — Meta não aceita.')
        return
      }
      const legenda = window.prompt('Legenda (opcional):') || ''
      const fd = new FormData()
      fd.append('conversa_id', conversaId)
      fd.append('arquivo', file)
      if (legenda) fd.append('legenda', legenda)
      const r = await enviarArquivoAction(fd)
      if ('erro' in r) { onErro(r.erro); return }
      onFeito()
    } finally { setEnviando(null) }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputArquivoRef.current?.click()}
        disabled={!!enviando}
        title="Enviar arquivo, foto, documento ou áudio"
        className="w-9 h-9 flex items-center justify-center rounded bg-white/[0.05] border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-40"
      >
        {enviando === 'arquivo' ? '⋯' : '📎'}
      </button>
      <button
        type="button"
        onClick={() => iniciar('voz')}
        disabled={!!enviando}
        title="Iniciar chamada de voz (sala Jitsi)"
        className="w-9 h-9 flex items-center justify-center rounded bg-verde/10 border border-verde/30 text-verde hover:bg-verde/20 disabled:opacity-40"
      >
        {enviando === 'voz' ? '⋯' : '📞'}
      </button>
      <button
        type="button"
        onClick={() => iniciar('video')}
        disabled={!!enviando}
        title="Iniciar videochamada (sala Jitsi)"
        className="w-9 h-9 flex items-center justify-center rounded bg-weg-azul/10 border border-weg-azul/30 text-weg-azul hover:bg-weg-azul/20 disabled:opacity-40"
      >
        {enviando === 'video' ? '⋯' : '📹'}
      </button>
      <span className="text-[10px] text-white/40 ml-2">
        {enviando ? 'Enviando...' : ''}
      </span>
      <input
        ref={inputArquivoRef}
        type="file"
        className="hidden"
        onChange={enviarArquivo}
        accept="image/*,application/pdf,audio/*,video/*,.doc,.docx,.xls,.xlsx"
      />
    </div>
  )
}

function BolhaMensagem({ m }: { m: Mensagem }) {
  const isInbound = m.direcao === 'inbound'
  const nomeRemetente = m.remetente?.nome_completo || m.origem_agente_nome || m.remetente_agente || null
  const hora = new Date(m.criada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const statusIcon = m.status_entrega === 'lida' ? '✓✓' :
    m.status_entrega === 'entregue' ? '✓✓' :
    m.status_entrega === 'enviada' ? '✓' :
    m.status_entrega === 'falhou' ? '⚠' : '⋯'
  const statusCor = m.status_entrega === 'lida' ? 'text-weg-azul'
    : m.status_entrega === 'falhou' ? 'text-coral'
    : 'text-white/40'

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[70%] rounded-lg px-3 py-2 ${
        isInbound ? 'bg-white/[0.05] border border-white/10' : 'bg-verde/15 border border-verde/30'
      }`}>
        {!isInbound && nomeRemetente && (
          <p className="text-[10px] font-bold text-verde mb-0.5">{nomeRemetente}</p>
        )}
        {m.tipo === 'text' ? (
          <p className="text-sm text-white whitespace-pre-wrap break-words">{m.texto || ''}</p>
        ) : m.tipo === 'audio' ? (
          <p className="text-sm text-white italic">🎙 áudio {m.midia_duracao_seg ? `(${m.midia_duracao_seg}s)` : ''}</p>
        ) : m.tipo === 'image' ? (
          <p className="text-sm text-white italic">🖼 imagem</p>
        ) : m.tipo === 'document' ? (
          <p className="text-sm text-white italic">📎 documento</p>
        ) : (
          <p className="text-sm text-white italic">[{m.tipo}]</p>
        )}
        <p className={`text-[10px] mt-1 flex items-center gap-1 ${isInbound ? 'text-white/40' : 'text-white/50 justify-end'}`}>
          <span>{hora}</span>
          {!isInbound && <span className={statusCor}>{statusIcon}</span>}
          {m.erro && <span className="text-coral">· {m.erro}</span>}
        </p>
      </div>
    </div>
  )
}
