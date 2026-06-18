import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente Supabase pra uso no SERVER (server components, route handlers, server actions).
 * Lê/grava cookies de auth via Next.js cookies() API.
 *
 * Uso em server component:
 *   import { createClient } from '@/lib/supabase/server'
 *   const supabase = createClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // O `set` é chamado em Server Component que não pode setar cookies.
            // Isso é OK — o middleware atualiza cookies em outros pontos.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Idem.
          }
        },
      },
    }
  )
}
