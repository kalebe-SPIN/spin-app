import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Diagnóstico da integração WhatsApp Meta Cloud API.
 *
 * Kalebe 2026-09-14: erro 'Meta Cloud API não configurada' apareceu no
 * /inbox. Precisa saber:
 *   - Envs estão setadas? Quais faltam?
 *   - O phone_number_id no Vercel aponta pro número Spin (+55 48 3263-0182)
 *     ou pra outro número teste?
 *   - Nome da WABA que hospeda o número
 *   - Status verificação
 *
 * Só admin acessa. NUNCA retorna o access_token completo.
 * GET /api/whatsapp/whoami
 */
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') {
    return NextResponse.json({ erro: 'Somente admin' }, { status: 403 })
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  const envs = {
    WHATSAPP_ACCESS_TOKEN: token ? `set (${String(token).slice(0, 8)}…${String(token).slice(-4)}, ${token.length} chars)` : 'FALTANDO',
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId || 'FALTANDO',
    WHATSAPP_VERIFY_TOKEN: verifyToken ? `set (${verifyToken.length} chars)` : 'FALTANDO',
  }

  if (!token || !phoneNumberId) {
    return NextResponse.json({
      ok: false,
      envs,
      diagnostico: 'Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID no Vercel → Settings → Environment Variables. Redeploy depois.',
    })
  }

  // Consulta Meta: dados do número
  let numero: any = null
  let numeroErro: any = null
  try {
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,name_status,messaging_limit_tier`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json()
    if (!r.ok) numeroErro = j?.error || j
    else numero = j
  } catch (e: any) {
    numeroErro = { message: e?.message }
  }

  // Consulta Meta: WABA (business account) do phone_number_id
  let waba: any = null
  let wabaErro: any = null
  try {
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=whatsapp_business_account`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json()
    if (!r.ok) wabaErro = j?.error || j
    else waba = j?.whatsapp_business_account || null
  } catch (e: any) {
    wabaErro = { message: e?.message }
  }

  // Ordem esperada: número real deveria ser 554832630182 (canal Spin)
  const NUMERO_ESPERADO_SPIN = '+554832630182'
  const display = numero?.display_phone_number || ''
  const somenteDig = String(display).replace(/\D/g, '')
  const bateSpin = somenteDig === '554832630182'

  return NextResponse.json({
    ok: !numeroErro,
    envs,
    numero,
    numeroErro,
    waba,
    wabaErro,
    canal_spin_esperado: NUMERO_ESPERADO_SPIN,
    numero_bate_canal_spin: bateSpin,
    diagnostico: bateSpin
      ? '✅ phone_number_id aponta pro número Spin. Só falta desconectar o TROIA e apontar webhook Meta pra Vercel.'
      : numeroErro
        ? `❌ Erro Meta API: ${numeroErro.message || JSON.stringify(numeroErro)}. Token pode ter expirado ou phone_number_id inválido.`
        : `⚠️ phone_number_id aponta pra ${display}, NÃO pro canal Spin (${NUMERO_ESPERADO_SPIN}). Provavelmente é um número teste antigo.`,
  })
}
