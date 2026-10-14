'use client'

import { Fragment } from 'react'

/**
 * Texto de mensagem do WhatsApp no Spinzap (Kalebe 2026-10-14): link vira
 * clicável (abre em outra aba) e *negrito* aparece em negrito, como no
 * WhatsApp. Sala de chamada (Jitsi) ganha o botão "Entrar na chamada".
 */
const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g
const SALA_RE = /https:\/\/meet\.jit\.si\/[\w-]+/

function comNegrito(trecho: string, chave: string) {
  const partes = trecho.split(/(\*[^*\n]+\*)/g)
  return partes.map((p, i) =>
    /^\*[^*\n]+\*$/.test(p) ? <strong key={`${chave}-${i}`}>{p.slice(1, -1)}</strong> : <Fragment key={`${chave}-${i}`}>{p}</Fragment>)
}

export function TextoFormatado({ texto, className = 'text-sm text-white whitespace-pre-wrap break-words' }: { texto: string; className?: string }) {
  const partes = texto.split(URL_RE)
  const sala = texto.match(SALA_RE)?.[0] || null
  return (
    <>
      <p className={className}>
        {partes.map((p, i) => (i % 2 === 1
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline break-all hover:text-sol">{p}</a>
          : <Fragment key={i}>{comNegrito(p, String(i))}</Fragment>))}
      </p>
      {sala && (
        <a href={sala} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-verde text-white text-xs font-bold">
          🎥 Entrar na chamada
        </a>
      )}
    </>
  )
}
