'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Auto-refresh global do portal.
 *
 * Kalebe 2026-09-16: dispara router.refresh() a cada 60s pra recarregar
 * dados server-side em toda tela — dashboards, kanbans, listas — sem
 * precisar F5 e sem perder estado dos clients (scroll, forms, modais).
 *
 * Regras:
 *   - Só quando aba está visível (document.visibilityState)
 *   - Pula rotas onde reload atrapalha ou não faz sentido:
 *       /login /vaga (fluxos com estado próprio),
 *       /inbox (já tem Realtime + fallback interno de 60s)
 *   - Renderizado no root layout — cobre todo o portal.
 */
const ROTAS_IGNORADAS = ['/login', '/vaga', '/inbox', '/definir-senha', '/esqueci-senha', '/trocar-senha']

export function AutoRefresh() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const ignorar = ROTAS_IGNORADAS.some((r) => pathname?.startsWith(r))
    if (ignorar) return

    const tick = () => {
      if (document.visibilityState !== 'visible') return
      router.refresh()
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [router, pathname])

  return null
}
