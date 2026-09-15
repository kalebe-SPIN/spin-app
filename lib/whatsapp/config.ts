import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Config runtime do canal WhatsApp — LÊ do Supabase primeiro,
 * fallback pra process.env.
 *
 * Kalebe 2026-09-15: perdeu acesso Vercel. Envs ficam agora numa
 * linha singleton em wa_config (RLS admin-only). Ele edita pelo portal
 * (/admin/whatsapp/config) sem precisar dashboard externo.
 *
 * Cache em memória de 30s pra evitar hit no Supabase toda request.
 */
type WaConfigValores = {
  access_token: string | undefined
  phone_number_id: string | undefined
  verify_token: string | undefined
  cron_secret: string | undefined
  anthropic_api_key: string | undefined
}

let _cache: { valores: WaConfigValores; expira_em: number } | null = null
const TTL_MS = 30_000

export async function getWaConfig(): Promise<WaConfigValores> {
  if (_cache && _cache.expira_em > Date.now()) return _cache.valores

  const fallback: WaConfigValores = {
    access_token: process.env.WHATSAPP_ACCESS_TOKEN,
    phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verify_token: process.env.WHATSAPP_VERIFY_TOKEN,
    cron_secret: process.env.CRON_SECRET,
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('wa_config')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_verify_token, cron_secret, anthropic_api_key')
      .eq('id', 1)
      .maybeSingle()
    if (data) {
      const valores: WaConfigValores = {
        access_token: (data.whatsapp_access_token as string | null) || fallback.access_token,
        phone_number_id: (data.whatsapp_phone_number_id as string | null) || fallback.phone_number_id,
        verify_token: (data.whatsapp_verify_token as string | null) || fallback.verify_token,
        cron_secret: (data.cron_secret as string | null) || fallback.cron_secret,
        anthropic_api_key: (data.anthropic_api_key as string | null) || fallback.anthropic_api_key,
      }
      _cache = { valores, expira_em: Date.now() + TTL_MS }
      return valores
    }
  } catch (e) {
    console.warn('[wa/config] falha lendo Supabase, usando env:', e)
  }

  _cache = { valores: fallback, expira_em: Date.now() + TTL_MS }
  return fallback
}

/** Invalida cache imediatamente (chame após atualizar via UI). */
export function invalidarWaConfigCache() {
  _cache = null
}
