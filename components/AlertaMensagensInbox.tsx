'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Kalebe 2026-09-30: alerta na tela quando chega mensagem no inbox.
 *
 * - Realtime em wa_mensagens (só inbound). O RLS decide quem recebe:
 *   admin vê tudo; consultor/representante só as conversas dele.
 * - Aviso no canto da tela (só na aba visível — com várias abas abertas não
 *   repete) + bipe curto; clicar abre a conversa no inbox.
 * - Contador de não lidas desde a última visita ao /inbox: vai pro item
 *   "Inbox" do menu (evento 'spin:inbox-nao-lidas') e pro título da aba.
 * - Estando no /inbox, não avisa (a própria lista atualiza) e zera o contador.
 */

export const EVENTO_NAO_LIDAS = 'spin:inbox-nao-lidas'
export const CHAVE_NAO_LIDAS = 'spin:inbox-nao-lidas'
const CHAVE_VISTO = 'spin:inbox-visto-em'
const DURACAO_MS = 15000

type Aviso = { id: string; conversaId: string; nome: string; texto: string }

const ler = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }

function resumo(m: any): string {
  const t = String(m?.texto || '').trim()
  const rotulo: Record<string, string> = {
    audio: '🎤 Áudio', image: '📷 Foto', video: '🎥 Vídeo', document: '📄 Documento',
    sticker: 'Figurinha', location: '📍 Localização', contacts: '👤 Contato',
  }
  const base = rotulo[m?.tipo] ? `${rotulo[m.tipo]}${t ? ` — ${t}` : ''}` : t || 'Nova mensagem'
  return base.length > 140 ? base.slice(0, 137) + '…' : base
}

function telefoneBR(t: string | null | undefined): string {
  const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t || ''
}

function bip() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.4)
    o.onended = () => { ctx.close().catch(() => {}) }
  } catch {}
}

export function AlertaMensagensInbox() {
  const pathname = usePathname()
  const noInbox = !!pathname?.startsWith('/inbox')
  const noInboxRef = useRef(noInbox)
  noInboxRef.current = noInbox
  const qtdRef = useRef(0)
  const [avisos, setAvisos] = useState<Aviso[]>([])

  function publicar(n: number, espalhar = true) {
    qtdRef.current = Math.max(0, n)
    if (espalhar) gravar(CHAVE_NAO_LIDAS, String(qtdRef.current))
    // O título da aba ("(n) Nome · Spin Solar") é montado pelo AbasPorArea ouvindo este evento
    window.dispatchEvent(new CustomEvent(EVENTO_NAO_LIDAS, { detail: qtdRef.current }))
  }

  // Entrou no inbox → tudo lido
  useEffect(() => {
    if (!noInbox) return
    gravar(CHAVE_VISTO, new Date().toISOString())
    publicar(0)
    setAvisos([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noInbox])

  // Contagem inicial: mensagens recebidas desde a última visita ao inbox
  useEffect(() => {
    if (noInboxRef.current) return
    let visto = ler(CHAVE_VISTO)
    if (!visto) { visto = new Date().toISOString(); gravar(CHAVE_VISTO, visto) }
    const supabase = createClient()
    supabase.from('wa_mensagens').select('id', { count: 'exact', head: true })
      .eq('direcao', 'inbound').gt('criada_em', visto)
      .then(({ count }) => { if (!noInboxRef.current) publicar(count || 0) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Outras abas zeraram/somaram → acompanha
  useEffect(() => {
    function aoMudar(e: StorageEvent) {
      if (e.key === CHAVE_NAO_LIDAS) publicar(Number(e.newValue) || 0, false)
    }
    window.addEventListener('storage', aoMudar)
    return () => window.removeEventListener('storage', aoMudar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mensagem chegando
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`alerta-inbox-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_mensagens', filter: 'direcao=eq.inbound' }, async (payload) => {
        const m: any = payload.new
        if (!m?.conversa_id || noInboxRef.current) return
        publicar(qtdRef.current + 1)
        if (document.visibilityState !== 'visible') return   // só a aba que está na frente avisa

        const { data: conv } = await supabase
          .from('wa_conversas')
          .select('id, contato:contato_id(nome_exibicao, telefone)')
          .eq('id', m.conversa_id)
          .maybeSingle()
        const contato: any = (conv as any)?.contato
        const nome = contato?.nome_exibicao || telefoneBR(contato?.telefone) || 'Contato'
        const aviso: Aviso = { id: m.id || `${Date.now()}`, conversaId: m.conversa_id, nome, texto: resumo(m) }
        setAvisos((atual) => [aviso, ...atual.filter((a) => a.conversaId !== aviso.conversaId)].slice(0, 3))
        bip()
        setTimeout(() => setAvisos((atual) => atual.filter((a) => a.id !== aviso.id)), DURACAO_MS)
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // No <body>: dentro do header (backdrop-blur) o "fixed" fica preso ao cabeçalho
  if (!avisos.length || typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed top-20 right-3 sm:right-4 z-[60] w-[340px] max-w-[calc(100vw-24px)] space-y-2" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className="bg-noite border border-verde/50 rounded-xl shadow-2xl p-3 flex gap-3 items-start">
          <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full bg-verde/15 border border-verde/40 flex items-center justify-center text-verde text-sm">💬</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-verde">Nova mensagem</p>
            <p className="text-sm font-bold text-white truncate">{a.nome}</p>
            <p className="text-xs text-white/70 line-clamp-2 break-words">{a.texto}</p>
            <Link href={`/inbox?c=${a.conversaId}`} className="inline-block mt-1.5 text-xs font-bold text-sol hover:underline"
              onClick={() => setAvisos((atual) => atual.filter((x) => x.id !== a.id))}>
              Abrir conversa →
            </Link>
          </div>
          <button onClick={() => setAvisos((atual) => atual.filter((x) => x.id !== a.id))}
            className="text-white/40 hover:text-white text-sm leading-none" aria-label="Fechar aviso">✕</button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
