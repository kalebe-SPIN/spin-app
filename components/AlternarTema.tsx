'use client'

import { useEffect, useState } from 'react'

/**
 * ☀️/🌙 — modo claro ou noturno, escolha de cada usuário (Kalebe 2026-10-01).
 * Guarda num cookie (o layout já renderiza no modo certo, sem piscar) e
 * aplica na hora em <html data-tema>. As cores mudam pelo globals.css.
 */
export type Tema = 'escuro' | 'claro'
export const COOKIE_TEMA = 'spin_tema'

export function AlternarTema() {
  const [tema, setTema] = useState<Tema>('escuro')

  useEffect(() => {
    setTema(document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro')
  }, [])

  function alternar() {
    const novo: Tema = tema === 'claro' ? 'escuro' : 'claro'
    document.documentElement.dataset.tema = novo
    document.cookie = `${COOKIE_TEMA}=${novo}; path=/; max-age=31536000; samesite=lax`
    setTema(novo)
  }

  const claro = tema === 'claro'
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={claro ? 'Mudar pro modo noturno' : 'Mudar pro modo claro'}
      title={claro ? 'Modo noturno' : 'Modo claro'}
      className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition"
    >
      {claro ? (
        // Lua — volta pro noturno
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sol — vai pro claro
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  )
}
