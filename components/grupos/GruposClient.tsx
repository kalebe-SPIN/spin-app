'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  listarGruposAction,
  mensagensDoGrupoAction,
  enviarMensagemGrupoAction,
  membrosAction,
  alterarMembroAction,
  type GrupoResumo,
} from '@/app/grupos/actions'
import { IconeEnviar } from '@/components/chat/IconesChat'

/**
 * Grupos internos por setor (Kalebe 2026-09-29). A Bianca administra: posta
 * campanhas e avisos (que também caem no sino de cada membro). Admin
 * participa de todos, publica aviso "pela Bianca" e gerencia membros.
 */

const NOME_AGENTE: Record<string, string> = { bianca: 'Bianca', qualificacao: 'Laís', davi: 'Davi' }

export function GruposClient({ usuarioId }: { usuarioId: string }) {
  const [grupos, setGrupos] = useState<GrupoResumo[]>([])
  const [ehAdmin, setEhAdmin] = useState(false)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [comoAviso, setComoAviso] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [membrosAberto, setMembrosAberto] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = selecionado

  async function carregarGrupos() {
    const r = await listarGruposAction()
    if ('erro' in r) { setErro(r.erro); return }
    setGrupos(r.grupos); setEhAdmin(r.eh_admin)
    if (!selRef.current && r.grupos[0]) setSelecionado(r.grupos[0].id)
  }
  async function carregarMensagens(id: string) {
    const r = await mensagensDoGrupoAction(id)
    if (!('erro' in r)) setMensagens(r.mensagens)
  }

  useEffect(() => {
    carregarGrupos()
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const canal = supabase
      .channel('grupos-internos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'grupos_mensagens' }, (p) => {
        if ((p.new as any)?.grupo_id === selRef.current) carregarMensagens(selRef.current!)
        carregarGrupos()
      })
      .subscribe()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregarGrupos() }, 60_000)
    return () => { supabase.removeChannel(canal); clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (selecionado) { carregarMensagens(selecionado); setInfo(null); setErro(null) } }, [selecionado])
  useEffect(() => { if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight }, [mensagens])

  async function enviar() {
    if (!selecionado || !texto.trim() || enviando) return
    setEnviando(true); setErro(null); setInfo(null)
    try {
      const r = await enviarMensagemGrupoAction({ grupo_id: selecionado, texto, como_aviso_bianca: comoAviso })
      if ('erro' in r) { setErro(r.erro); return }
      setTexto('')
      if (comoAviso) setInfo(`📣 Aviso publicado pela Bianca — ${r.notificados ?? 0} pessoa(s) avisada(s) no sino.`)
      carregarMensagens(selecionado); carregarGrupos()
    } finally { setEnviando(false) }
  }

  const grupo = grupos.find((g) => g.id === selecionado) || null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] border border-white/10 rounded-xl overflow-hidden min-h-[70vh]">
      <aside className="border-r border-white/10 bg-white/[0.02]">
        {grupos.map((g) => (
          <button key={g.id} onClick={() => setSelecionado(g.id)}
            className={`w-full text-left px-4 py-3 border-b border-white/5 ${g.id === selecionado ? 'bg-sol/[0.07] border-l-2 border-l-sol' : 'hover:bg-white/[0.03]'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-white truncate">{g.emoji} {g.nome}</span>
              {g.nao_lidas > 0 && g.id !== selecionado && (
                <span className="text-[10px] font-bold bg-verde text-noite rounded-full px-1.5 min-w-[18px] text-center">{g.nao_lidas}</span>
              )}
            </div>
            <p className="text-[11px] text-white/45 truncate mt-0.5">{g.ultima?.texto || g.descricao || 'Sem mensagens ainda'}</p>
          </button>
        ))}
        {grupos.length === 0 && !erro && <p className="p-4 text-xs text-white/40">Carregando grupos…</p>}
      </aside>

      <section className="flex flex-col min-h-0">
        {!grupo ? (
          <div className="flex-1 flex items-center justify-center text-sm text-white/40 p-6">{erro || 'Escolha um grupo.'}</div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{grupo.emoji} {grupo.nome}</p>
                <p className="text-[11px] text-white/45 truncate">{grupo.descricao} · administrado pela Bianca</p>
              </div>
              <button onClick={() => setMembrosAberto(true)} className="text-xs text-white/60 hover:text-white shrink-0">👥 Membros</button>
            </div>

            <div ref={timelineRef} className="flex-1 min-h-[300px] max-h-[60vh] overflow-y-auto p-4 space-y-2">
              {mensagens.length === 0 && <p className="text-xs text-white/40 text-center py-8">Nenhuma mensagem neste grupo ainda.</p>}
              {mensagens.map((m) => {
                const meu = m.autor_usuario_id === usuarioId && !m.autor_agente
                const autor = m.autor_agente
                  ? `${NOME_AGENTE[m.autor_agente] || m.autor_agente}${m.autor?.nome_completo ? ` · a pedido de ${m.autor.nome_completo.split(' ')[0]}` : ''}`
                  : (m.autor?.nome_completo || 'Alguém da equipe')
                const destaque = m.tipo === 'campanha' ? 'border-verde/50 bg-verde/10'
                  : m.tipo === 'aviso' ? 'border-sol/50 bg-sol/10'
                  : meu ? 'border-verde/25 bg-verde/[0.08]' : 'border-white/10 bg-white/[0.04]'
                return (
                  <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg border px-3 py-2 ${destaque}`}>
                      <p className="text-[10px] font-bold text-white/55 mb-0.5">
                        {m.tipo === 'campanha' ? '🎁 ' : m.tipo === 'aviso' ? '📣 ' : ''}{autor}
                      </p>
                      <p className="text-sm text-white whitespace-pre-wrap break-words">{m.texto}</p>
                      {m.link && <Link href={m.link} className="text-[11px] text-sol underline">abrir</Link>}
                      <p className="text-[10px] text-white/35 mt-1 text-right">
                        {new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-3 border-t border-white/10 space-y-2">
              {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
              {info && <p className="text-xs text-verde">{info}</p>}
              {ehAdmin && (
                <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                  <input type="checkbox" checked={comoAviso} onChange={(e) => setComoAviso(e.target.checked)} />
                  📣 Publicar como aviso da Bianca (avisa cada membro no sino e no WhatsApp quando der)
                </label>
              )}
              <div className="flex items-end gap-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder={comoAviso ? 'Aviso que a Bianca vai repassar ao grupo…' : `Mensagem pro grupo ${grupo.nome}`}
                  className="flex-1 px-4 py-2 bg-white/[0.05] border border-white/10 focus:border-white/25 rounded-2xl text-sm text-white resize-none focus:outline-none max-h-32" />
                <button onClick={enviar} disabled={enviando || !texto.trim()}
                  className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-verde text-noite disabled:opacity-40" title="Enviar">
                  <IconeEnviar size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {membrosAberto && grupo && (
        <ModalMembros grupo={grupo} ehAdmin={ehAdmin} onFechar={() => setMembrosAberto(false)} />
      )}
    </div>
  )
}

function ModalMembros({ grupo, ehAdmin, onFechar }: { grupo: GrupoResumo; ehAdmin: boolean; onFechar: () => void }) {
  const [dados, setDados] = useState<{ membros: any[]; todos: any[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function carregar() {
    const r = await membrosAction(grupo.id)
    if ('erro' in r) setErro(r.erro); else setDados(r)
  }
  useEffect(() => { carregar() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo.id])
  async function alternar(id: string, incluir: boolean) {
    const r = await alterarMembroAction(grupo.id, id, incluir)
    if ('erro' in r) setErro(r.erro); else carregar()
  }
  const ids = new Set((dados?.membros || []).map((m) => m.id))
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-noite border border-white/15 rounded-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{grupo.emoji} Membros — {grupo.nome}</h2>
          <button onClick={onFechar} className="text-white/40 hover:text-white/80">✕</button>
        </div>
        <p className="text-[11px] text-white/45">Admin participa de todos os grupos automaticamente.</p>
        {!dados ? <p className="text-xs text-white/40">Carregando…</p> : (
          <ul className="space-y-1">
            {(ehAdmin ? dados.todos : dados.membros).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white/[0.03]">
                <span className="text-sm text-white">{p.nome} <span className="text-[10px] text-white/40">· {p.papel}</span></span>
                {ehAdmin && p.papel !== 'admin' ? (
                  <input type="checkbox" checked={ids.has(p.id)} onChange={(e) => alternar(p.id, e.target.checked)} />
                ) : (
                  <span className="text-[10px] text-verde">{p.papel === 'admin' ? 'admin' : 'membro'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
      </div>
    </div>
  )
}
