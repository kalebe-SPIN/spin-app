'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

type LinkNav = { href: string; label: string }

/**
 * Menu mobile do PortalHeader — botão hamburger visível em <md que abre
 * um drawer vertical com os mesmos links do nav desktop.
 */
export function MenuMobileHeader({ links }: { links: LinkNav[] }) {
  const [aberto, setAberto] = useState(false)
  const pathname = usePathname()

  // Fecha automaticamente quando muda de página
  useEffect(() => { setAberto(false) }, [pathname])

  // Bloqueia scroll do body quando aberto
  useEffect(() => {
    if (aberto) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [aberto])

  return (
    <>
      {/* Botão hamburger (visível só mobile) */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="md:hidden p-2 -ml-1 text-white/70 hover:text-white"
        aria-label="Abrir menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Drawer overlay */}
      {aberto && (
        <div className="md:hidden fixed inset-0 z-50 bg-noite/80 backdrop-blur-sm" onClick={() => setAberto(false)}>
          <div
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-noite border-r border-white/10 p-6 space-y-2 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sol font-black text-lg">MENU</span>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="p-2 text-white/60 hover:text-white"
                aria-label="Fechar menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="space-y-1">
              {links.map((l) => {
                const ativo = pathname === l.href || pathname.startsWith(l.href + '/')
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block px-3 py-2.5 rounded-md text-sm transition ${
                      ativo
                        ? 'bg-sol/15 text-sol border border-sol/30'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {l.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
