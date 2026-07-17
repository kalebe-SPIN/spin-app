import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Envia WhatsApp via Meta Cloud API.
 *
 * Body:
 *   { comunicacao_id: string }
 *
 * Fluxo:
 *   1. Busca a comunicacao_id em bianca_comunicacoes (pega telefone + mensagem)
 *   2. Chama POST graph.facebook.com/v20.0/{phone_number_id}/messages
 *   3. Atualiza a linha com meta_message_id + status='enviada_bianca'
 *
 * Env vars necessárias:
 *   - WHATSAPP_ACCESS_TOKEN (System User token permanente)
 *   - WHATSAPP_PHONE_NUMBER_ID (do número emissor no Meta)
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    return NextResponse.json({
      error: 'WhatsApp Meta API não configurada. Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID no Vercel.',
      error_code: 'integration_missing',
    }, { status: 400 })
  }

  try {
    const { comunicacao_id } = await req.json()
    if (!comunicacao_id) {
      return NextResponse.json({ error: 'comunicacao_id obrigatório' }, { status: 400 })
    }

    const supabaseAdmin = createAdminClient()
    const { data: com } = await supabaseAdmin
      .from('bianca_comunicacoes')
      .select('id, canal, destinatario_telefone, mensagem, usuario_id')
      .eq('id', comunicacao_id)
      .single()

    if (!com) return NextResponse.json({ error: 'Comunicação não encontrada' }, { status: 404 })
    if (com.usuario_id !== user.id) {
      return NextResponse.json({ error: 'Não é sua comunicação' }, { status: 403 })
    }
    if (com.canal !== 'whatsapp') {
      return NextResponse.json({ error: 'Só canal whatsapp' }, { status: 400 })
    }
    if (!com.destinatario_telefone) {
      return NextResponse.json({ error: 'Telefone ausente' }, { status: 400 })
    }

    // Normaliza telefone: só dígitos, força prefixo 55 se BR
    let tel = com.destinatario_telefone.replace(/\D/g, '')
    if (tel.length === 11) tel = '55' + tel

    // Envia via Cloud API
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: tel,
        type: 'text',
        text: { body: com.mensagem, preview_url: false },
      }),
    })

    const data = await resp.json()

    if (!resp.ok) {
      const erroMsg = data?.error?.message || 'Erro Meta API'
      const erroCode = data?.error?.code
      const erroTipo = data?.error?.type

      // Erro 131047: fora da janela de 24h — precisa template
      const foraJanela = erroCode === 131047 || erroMsg.includes('24 hours')

      await supabaseAdmin
        .from('bianca_comunicacoes')
        .update({
          status: 'falhou',
          erro_envio: `[${erroCode || 'sem código'}] ${erroMsg}`,
        })
        .eq('id', comunicacao_id)

      return NextResponse.json({
        error: foraJanela
          ? 'Cliente não respondeu nas últimas 24h — precisa mensagem template pré-aprovada pela Meta.'
          : erroMsg,
        error_code: foraJanela ? 'fora_janela_24h' : (erroTipo || 'meta_erro'),
        detalhes: data.error,
      }, { status: resp.status })
    }

    const metaMessageId = data?.messages?.[0]?.id

    await supabaseAdmin
      .from('bianca_comunicacoes')
      .update({
        status: 'enviada_bianca',
        enviada_em: new Date().toISOString(),
        meta_message_id: metaMessageId,
      })
      .eq('id', comunicacao_id)

    return NextResponse.json({
      sucesso: true,
      meta_message_id: metaMessageId,
      telefone: tel,
    })
  } catch (e: any) {
    console.error('[whatsapp/enviar]', e)
    return NextResponse.json({ error: e?.message || 'Erro desconhecido' }, { status: 500 })
  }
}
