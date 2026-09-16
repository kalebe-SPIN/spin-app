import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWaConfig } from '@/lib/whatsapp/config'

/**
 * Registra este app como receiver de webhooks da WABA.
 *
 * Mesmo com webhook URL configurada, POST /{WABA_ID}/subscribed_apps
 * precisa ser chamado uma vez pra Meta começar a entregar mensagens
 * reais no webhook — sem isso Meta só entrega webhooks de teste.
 *
 * WABA_ID hardcoded (286157384591672 = Spin Solar). Depois posso mover
 * pra wa_config quando tiver multi-WABA.
 */
export const runtime = 'nodejs'

const WABA_ID_SPIN = '286157384591672'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return NextResponse.json({ erro: 'Somente admin' }, { status: 403 })

  const cfg = await getWaConfig()
  const token = cfg.access_token
  if (!token) {
    return NextResponse.json({ erro: 'Token não cadastrado. Vá em /admin/whatsapp/config.' }, { status: 500 })
  }

  const urlSub = `https://graph.facebook.com/v20.0/${WABA_ID_SPIN}/subscribed_apps`

  try {
    // 1. Lista apps já assinados
    const rGet = await fetch(urlSub, { headers: { Authorization: `Bearer ${token}` } })
    const jGet = await rGet.json()

    // 2. POST pra registrar
    const rPost = await fetch(urlSub, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const jPost = await rPost.json()

    return NextResponse.json({
      waba_id: WABA_ID_SPIN,
      apps_antes: jGet,
      resultado_post: jPost,
      status_post: rPost.status,
      diagnostico: jPost?.success
        ? '✅ App registrado na WABA. Mensagens reais agora chegam no webhook. Manda oi pro +55 48 3263-0182.'
        : `⚠️ POST retornou ${rPost.status}. Erro: ${jPost?.error?.message || JSON.stringify(jPost)}`,
    })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || 'erro desconhecido' }, { status: 500 })
  }
}
