'use server'

import { createClient } from '@/lib/supabase/server'
import { invalidarWaConfigCache } from '@/lib/whatsapp/config'
import { revalidatePath } from 'next/cache'

/**
 * Kalebe 2026-09-15: sem acesso Vercel. Envs vivem em wa_config
 * (Supabase). Ele edita aqui pelo portal.
 */

async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const }
  return { ok: true as const, user_id: user.id }
}

export type WaConfigForm = {
  whatsapp_access_token: string
  whatsapp_phone_number_id: string
  whatsapp_verify_token: string
  cron_secret: string
  anthropic_api_key: string
}

/**
 * Retorna valores atuais. Token é retornado MASCARADO (só primeiros 8
 * chars + últimos 4) — evita expor no wire; se admin quer trocar,
 * digita valor completo novo.
 */
export async function buscarWaConfigAction(): Promise<
  { valores: Partial<WaConfigForm>; mascaras: Record<string, string> }
  | { erro: string }
> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }
  const supabase = createClient()

  const { data } = await supabase
    .from('wa_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  function mascarar(v: string | null | undefined): string {
    if (!v) return 'não cadastrado'
    if (v.length <= 12) return v
    return `${v.slice(0, 8)}…${v.slice(-4)} (${v.length} chars)`
  }

  return {
    valores: {},   // nunca retorna o valor bruto — só as máscaras
    mascaras: {
      whatsapp_access_token: mascarar(data?.whatsapp_access_token),
      whatsapp_phone_number_id: data?.whatsapp_phone_number_id || 'não cadastrado',
      whatsapp_verify_token: mascarar(data?.whatsapp_verify_token),
      cron_secret: mascarar(data?.cron_secret),
      anthropic_api_key: mascarar(data?.anthropic_api_key),
    },
  }
}

/**
 * Salva apenas os campos preenchidos (não sobrescreve com string vazia).
 * Se admin deixa em branco, mantém valor anterior — útil pra atualizar
 * só uma env sem precisar redigitar tudo.
 */
export async function salvarWaConfigAction(
  entrada: Partial<WaConfigForm>,
): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }
  const supabase = createClient()

  const patch: any = { atualizado_em: new Date().toISOString(), atualizado_por: check.user_id }

  for (const k of ['whatsapp_access_token','whatsapp_phone_number_id','whatsapp_verify_token','cron_secret','anthropic_api_key'] as const) {
    const v = entrada[k]
    if (typeof v === 'string' && v.trim().length > 0) {
      patch[k] = v.trim()
    }
  }

  const { error } = await supabase
    .from('wa_config')
    .upsert({ id: 1, ...patch }, { onConflict: 'id' })

  if (error) return { erro: error.message }

  invalidarWaConfigCache()
  revalidatePath('/admin/whatsapp/config')
  revalidatePath('/admin/whatsapp/setup')
  return { sucesso: true }
}

/**
 * Testa se com essas credentials a Meta responde.
 */
export async function testarWaConfigAction(): Promise<
  { ok: true; numero: string; nome: string | null } | { erro: string }
> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }

  const { getWaConfig } = await import('@/lib/whatsapp/config')
  const cfg = await getWaConfig()
  if (!cfg.access_token || !cfg.phone_number_id) {
    return { erro: 'Token ou phone_number_id não cadastrados.' }
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${cfg.phone_number_id}?fields=display_phone_number,verified_name`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${cfg.access_token}` }, cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) return { erro: j?.error?.message || 'Erro Meta' }
    return { ok: true, numero: j.display_phone_number || '?', nome: j.verified_name || null }
  } catch (e: any) {
    return { erro: e?.message || 'Falha desconhecida' }
  }
}
