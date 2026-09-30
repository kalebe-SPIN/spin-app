'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CHAVE_NAO_LIDAS, EVENTO_NAO_LIDAS } from '@/components/AlertaMensagensInbox'

/**
 * Kalebe 2026-09-30: menu do portal só com texto (sem ícones), área atual
 * destacada e contador de mensagens novas no "Inbox". Aparece a partir de
 * 1024px; abaixo disso o MenuMobileHeader (☰) assume.
 */

export type LinkNav = { href: string; label: string }

/** Mensagens novas no inbox (atualizado pelo AlertaMensagensInbox). */
export function useInboxNaoLidas(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    try { setN(Number(localStorage.getItem(CHAVE_NAO_LIDAS)) || 0) } catch {}
    const f = (e: Event) => setN(Number((e as CustomEvent).detail) || 0)
    window.addEventListener(EVENTO_NAO_LIDAS, f)
    return () => window.removeEventListener(EVENTO_NAO_LIDAS, f)
  }, [])
  return n
}

export const linkAtivo = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + '/') || (href === '/crm/pipeline' && pathname.startsWith('/crm'))

export function NavPortal({ links }: { links: LinkNav[] }) {
  const pathname = usePathname() || ''
  const naoLidas = useInboxNaoLidas()
  return (
    <nav className="hidden lg:flex items-center gap-0.5 min-w-0">
      {links.map((l) => {
        const ativo = linkAtivo(pathname, l.href)
        const badge = l.href === '/inbox' && naoLidas > 0 && !ativo
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative px-2.5 xl:px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition ${
              ativo ? 'text-white bg-white/10 font-semibold' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {l.label}
            {badge && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-verde text-noite text-[10px] font-black flex items-center justify-center">
                {naoLidas > 99 ? '99+' : naoLidas}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
