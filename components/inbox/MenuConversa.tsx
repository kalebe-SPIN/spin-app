'use client'

import { useEffect, useState } from 'react'

/**
 * Menu flutuante da conversa (Kalebe 2026-10-13): "substituir todos os botões
 * de acesso dos cadastros por um ícone flutuante menor que expande um menu
 * moderno com fundo de efeito blur na tela". Um botão pequeno no canto do
 * chat; ao tocar, a tela desfoca e aparecem os atalhos em blocos.
 */

export type ItemMenu = {
  chave: string
  icone: string
  rotulo: string
  /** Linha pequena embaixo (ex.: progresso "2/5") */
  detalhe?: string
  /** destaque = bloco largo cheio (ação principal); ok/atencao = borda verde/amarela; perigo = borda vermelha */
  tom?: 'destaque' | 'ok' | 'atencao' | 'perigo'
  href?: string
  onClick?: () => void
  desabilitado?: boolean
}
export type GrupoMenu = { titulo: string; itens: ItemMenu[] }

export function MenuConversa({ titulo, subtitulo, grupos }: { titulo: string; subtitulo?: string; grupos: GrupoMenu[] }) {
  const [aberto, setAberto] = useState(false)
  const [visivel, setVisivel] = useState(false)

  function abrir() {
    setAberto(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisivel(true)))
  }
  function fechar() {
    setVisivel(false)
    setTimeout(() => setAberto(false), 180)
  }
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto])

  const comItens = grupos.filter((g) => g.itens.length)

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Atalhos da conversa"
        title="Atalhos: proposta, cadastro, projeto e atendimento"
        className={`absolute bottom-4 right-4 z-20 w-11 h-11 rounded-full bg-sol text-white shadow-lg shadow-black/40
          flex items-center justify-center transition hover:scale-105 active:scale-95 ${aberto ? 'opacity-0 pointer-events-none' : ''}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:p-6" role="dialog" aria-modal="true">
          <div
            onClick={fechar}
            className={`absolute inset-0 bg-black/30 backdrop-blur-md transition-opacity duration-200 ${visivel ? 'opacity-100' : 'opacity-0'}`}
          />
          <div
            className={`relative w-full sm:w-[440px] max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10
              bg-noite/75 backdrop-blur-2xl shadow-2xl p-5 space-y-5 transition duration-200 ease-out
              ${visivel ? 'opacity-100 translate-y-0 sm:scale-100' : 'opacity-0 translate-y-6 sm:translate-y-2 sm:scale-95'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-white truncate">{titulo}</p>
                {subtitulo && <p className="text-[11px] text-white/50 truncate">{subtitulo}</p>}
              </div>
              <button onClick={fechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/70 hover:text-white flex items-center justify-center shrink-0">✕</button>
            </div>

            {comItens.map((g) => (
              <div key={g.titulo}>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 mb-2">{g.titulo}</p>
                <div className="grid grid-cols-3 gap-2">
                  {g.itens.map((it) => <Bloco key={it.chave} it={it} aoUsar={fechar} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Bloco({ it, aoUsar }: { it: ItemMenu; aoUsar: () => void }) {
  const destaque = it.tom === 'destaque'
  const borda = it.tom === 'ok' ? 'border-verde/45' : it.tom === 'atencao' ? 'border-sol/45' : it.tom === 'perigo' ? 'border-coral/45' : 'border-white/10'
  const cls = destaque
    // text-start (não text-left): a camada do visual minimalista trata text-left como cartão e não pinta o botão
    ? 'col-span-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-verde text-white hover:brightness-110 transition text-start'
    : `flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 min-h-[86px] border ${borda} bg-white/[0.04] hover:bg-white/[0.09] transition text-center disabled:opacity-40`
  const conteudo = (
    <>
      <span className={`${destaque ? 'w-10 h-10 text-xl bg-white/15' : 'w-9 h-9 text-lg bg-white/[0.06]'} rounded-full flex items-center justify-center shrink-0`}>{it.icone}</span>
      <span className="min-w-0">
        <span className={`block ${destaque ? 'text-sm font-bold' : 'text-[11px] font-semibold text-white/85 leading-tight'}`}>{it.rotulo}</span>
        {it.detalhe && <span className={`block ${destaque ? 'text-[11px] text-white/80' : 'text-[10px] text-white/45 font-mono mt-0.5'}`}>{it.detalhe}</span>}
      </span>
    </>
  )
  if (it.href) {
    return <a href={it.href} target="_blank" rel="noreferrer" onClick={aoUsar} className={cls}>{conteudo}</a>
  }
  return (
    <button disabled={it.desabilitado} onClick={() => { aoUsar(); setTimeout(() => it.onClick?.(), 120) }} className={cls}>
      {conteudo}
    </button>
  )
}
