import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente Supabase pra uso no BROWSER (client components).
 * Usa anon key — segura pra expor publicamente.
 *
 * Uso:
 *   import { createClient } from '@/lib/supabase/client'
 *   const supabase = createClient()
 *   const { data } = await supabase.auth.signInWithPassword(...)
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
