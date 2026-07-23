import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispararGatilho } from '@/lib/bianca/gatilhos'

/**
 * Webhook do WhatsApp Meta Cloud API.
 *
 * GET: verificação inicial (Meta manda um challenge, precisa retornar hub.challenge)
 * POST: eventos — status de mensagens enviadas + mensagens recebidas
 *
 * Env vars:
 *   - WHATSAPP_VERIFY_TOKEN: string custom que você define. Usa no
 *     Meta Business Manager ao configurar o webhook.
 */

// ═══════════════════ VERIFICAÇÃO (GET) ═══════════════════
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!verifyToken) {
    return NextResponse.json({ error: 'Verify token não configurado' }, { status: 500 })
  }

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge || '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// ═══════════════════ EVENTOS (POST) ═══════════════════
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabaseAdmin = createAdminClient()

    // Estrutura Meta:
    // { entry: [{ changes: [{ value: { statuses: [...], messages: [...] } }] }] }
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value

        // ─── STATUS de mensagem enviada por nós ───
        for (const status of value?.statuses || []) {
          const metaId = status.id
          const evento = status.status // sent | delivered | read | failed
          const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000).toISOString() : new Date().toISOString()

          if (!metaId) continue

          const patch: any = {}
          if (evento === 'delivered' && !patch.entregue_em) patch.entregue_em = timestamp
          if (evento === 'read') {
            patch.lida_em = timestamp
            patch.status = 'lida'
          }
          if (evento === 'failed') {
            patch.status = 'falhou'
            patch.erro_envio = status.errors?.[0]?.title || 'Falhou (webhook)'
          }

          if (Object.keys(patch).length > 0) {
            await supabaseAdmin
              .from('bianca_comunicacoes')
              .update(patch)
              .eq('meta_message_id', metaId)
          }
        }

        // ─── MENSAGEM recebida do cliente (resposta) ───
        for (const msg of value?.messages || []) {
          const from = msg.from // telefone sem +
          const texto = msg.text?.body || msg.button?.text || '[mídia não-texto]'

          // Marca comunicações recentes com esse número como respondidas
          const { data: recentes } = await supabaseAdmin
            .from('bianca_comunicacoes')
            .select('id, projeto_id, usuario_id, destinatario_nome')
            .eq('destinatario_telefone', from)
            .in('status', ['enviada_bianca', 'enviada_manualmente', 'lida'])
            .is('respondida_em', null)
            .order('criado_em', { ascending: false })
            .limit(3)

          for (const c of recentes || []) {
            await supabaseAdmin
              .from('bianca_comunicacoes')
              .update({
                status: 'respondida',
                respondida_em: new Date().toISOString(),
                resposta_texto: texto.substring(0, 500),
              })
              .eq('id', c.id)
          }

          // Dispara gatilho pra Bianca sugerir resposta ao consultor
          // (so pra 1 comunicacao — a mais recente — evita duplicar)
          const primeira = recentes?.[0]
          if (primeira && primeira.usuario_id) {
            await dispararGatilho('cliente_respondeu_whatsapp', {
              projeto_id: primeira.projeto_id,
              usuario_id: primeira.usuario_id,
              entidade_tipo: 'comunicacao_wa',
              entidade_id: primeira.id,
              variaveis: {
                cliente_nome: primeira.destinatario_nome || 'Cliente',
                cliente_telefone: from,
                resposta_cliente: texto.substring(0, 300),
                resposta_sugerida: '(Bianca vai gerar sugestão baseada no contexto)',
              },
              instrucao_ia_extra: `O cliente respondeu: "${texto.substring(0, 300)}". Analise essa resposta e escreva uma sugestao de resposta cordial e util pro consultor enviar. Se e duvida tecnica, seja preciso. Se e objecao de preco, defenda valor. Se e confirmacao positiva, agradeca e proponha proximo passo.`,
            }).catch(err => console.error('[webhook gatilho cliente_respondeu]', err))
          }
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[whatsapp/webhook]', e)
    // Sempre retorna 200 pra Meta não retry
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 200 })
  }
}
