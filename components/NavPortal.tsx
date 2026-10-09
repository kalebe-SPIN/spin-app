'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CHAVE_NAO_LIDAS, EVENTO_NAO_LIDAS } from '@/components/AlertaMensagensInbox'
import { abrirRegistroSaida } from '@/components/financeiro/LancamentoRapido'

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
        const badge = l.href === '/spinzap' && naoLidas > 0 && !ativo
        // Kalebe 2026-10-01: passar o mouse em Financeiro abre o atalho do dia a dia
        if (l.href === '/financeiro') return <MenuFinanceiro key={l.href} link={l} ativo={ativo} />
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

/** Financeiro com submenu no hover: registrar saída (atalho) e fluxo de caixa. */
function MenuFinanceiro({ link, ativo }: { link: LinkNav; ativo: boolean }) {
  const item = 'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition'
  return (
    <div className="relative group">
      <Link
        href={link.href}
        className={`px-2.5 xl:px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition inline-flex items-center gap-1 ${
          ativo ? 'text-white bg-white/10 font-semibold' : 'text-white/60 hover:text-white hover:bg-white/5 group-hover:text-white group-hover:bg-white/5'
        }`}
      >
        {link.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-60" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </Link>
      {/* pt-1 = ponte invisível: o mouse desce do link pro menu sem fechar */}
      <div className="absolute left-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-50">
        <div className="w-64 p-1.5 rounded-xl bg-noite border border-white/15 shadow-2xl">
          <button type="button" onClick={() => abrirRegistroSaida()} className={`${item} text-white hover:bg-coral/10`}>
            <span className="w-6 h-6 rounded-full bg-coral/15 text-coral flex items-center justify-center font-black shrink-0">−</span>
            <span>
              <span className="block font-semibold">Registrar saída</span>
              <span className="block text-[11px] text-white/50">Despesa ou custo do dia a dia</span>
            </span>
          </button>
          <Link href="/financeiro/fluxo-caixa" className={`${item} text-white/80 hover:bg-white/5 hover:text-white`}>
            <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-xs">📊</span>
            Fluxo de caixa
          </Link>
          <Link href="/financeiro" className={`${item} text-white/80 hover:bg-white/5 hover:text-white`}>
            <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-xs">💼</span>
            Painel financeiro
          </Link>
        </div>
      </div>
    </div>
  )
}
