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
 * NOTA: subscribe é no nível da WABA (Business Account), NÃO do
 * phone_number_id. Primeiro descobrimos a WABA a partir do
 * phone_number_id, depois fazemos o POST.
 *
 * Só admin acessa. GET pra fácil execução do browser.
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

  try {
    // 1. Descobre a WABA_ID a partir do phone_number_id
    const rInfo = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=whatsapp_business_account{id,name}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const jInfo = await rInfo.json()
    if (!rInfo.ok) {
      return NextResponse.json({
        etapa: 'descobrir_waba',
        erro: jInfo?.error?.message || 'Falha ao descobrir WABA',
        detalhes: jInfo,
      }, { status: 500 })
    }
    const wabaId = jInfo?.whatsapp_business_account?.id
    const wabaName = jInfo?.whatsapp_business_account?.name
    if (!wabaId) {
      return NextResponse.json({
        etapa: 'descobrir_waba',
        erro: 'WABA_ID não retornado pela Meta',
        detalhes: jInfo,
      }, { status: 500 })
    }

    // 2. Verifica apps já assinados nessa WABA
    const urlSub = `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`
    const rGet = await fetch(urlSub, { headers: { Authorization: `Bearer ${token}` } })
    const jGet = await rGet.json()

    // 3. POST pra registrar o app
    const rPost = await fetch(urlSub, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const jPost = await rPost.json()

    return NextResponse.json({
      waba: { id: wabaId, nome: wabaName },
      phone_number_id: phoneNumberId,
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
