import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase com SERVICE ROLE KEY.
 * BYPASSA RLS — use APENAS em rotas server-side confiáveis,
 * NUNCA em código que roda no browser.
 *
 * Uso:
 *   import { createAdminClient } from '@/lib/supabase/admin'
 *   const supabase = createAdminClient()
 *   const { data } = await supabase.storage.from('bucket').upload(...)
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase admin: envs NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias')
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
