import { redirect } from 'next/navigation'

/**
 * /inbox virou /spinzap (Kalebe 2026-10-09). Links antigos — avisos já
 * enviados no WhatsApp, favoritos — continuam abrindo a mesma conversa.
 */
export const dynamic = 'force-dynamic'

export default function InboxPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (typeof v === 'string') q.set(k, v)
    else if (Array.isArray(v) && v[0]) q.set(k, v[0])
  }
  const s = q.toString()
  redirect(s ? `/spinzap?${s}` : '/spinzap')
}
