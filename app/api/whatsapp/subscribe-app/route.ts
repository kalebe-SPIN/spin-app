import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWaConfig } from '@/lib/whatsapp/config'

/**
 * Registra este app como receiver de webhooks do phone_number_id.
 *
 * Passo faltante do setup do canal — mesmo com webhook URL configurada
 * na Meta, mensagens reais só chegam depois de POST
 * /{phone_number_id}/subscribed_apps.
 *
 * Só admin acessa. GET pra fácil execução do browser (basta abrir a URL).
 */
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return NextResponse.json({ erro: 'Somente admin' }, { status: 403 })

  const cfg = await getWaConfig()
  const token = cfg.access_token
  const phoneNumberId = cfg.phone_number_id
  if (!token || !phoneNumberId) {
    return NextResponse.json({ erro: 'Token ou phone_number_id não cadastrados. Vá em /admin/whatsapp/config.' }, { status: 500 })
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/subscribed_apps`
  try {
    // 1. Verifica lista atual de apps subscritos
    const rGet = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const jGet = await rGet.json()

    // 2. Faz o POST pra registrar o app atual
    const rPost = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const jPost = await rPost.json()

    return NextResponse.json({
      antes: jGet,
      resultado_post: jPost,
      status_post: rPost.status,
      diagnostico: jPost?.success
        ? '✅ App registrado. Mensagens reais agora chegam no webhook. Manda oi pro +55 48 3263-0182.'
        : `⚠️ POST retornou ${rPost.status}. Erro: ${jPost?.error?.message || JSON.stringify(jPost)}`,
    })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || 'erro desconhecido' }, { status: 500 })
  }
}
