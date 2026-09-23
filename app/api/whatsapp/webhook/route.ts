import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispararGatilho } from '@/lib/bianca/gatilhos'
import {
  upsertContato,
  findOrCreateConversaAtiva,
  gravarMensagem,
  atualizarStatusPorMetaId,
  normalizarTelefone,
} from '@/lib/whatsapp/conversas'
import { processarMensagemQualificacao } from '@/lib/whatsapp/agente-qualificacao'
import { baixarESalvarMidiaWa } from '@/lib/whatsapp/midia'
import { aceitarLead } from '@/lib/whatsapp/broadcast'
import { getWaConfig } from '@/lib/whatsapp/config'

/**
 * Webhook do WhatsApp Meta Cloud API.
 *
 * GET: verificação inicial (Meta manda um challenge, precisa retornar hub.challenge)
 * POST: eventos — status de mensagens enviadas + mensagens recebidas
 *
 * Env vars:
 *   - WHATSAPP_VERIFY_TOKEN: string custom que você define. Usa no
 *     Meta Business Manager ao configurar o webhook.
 *
 * Kalebe 2026-09-12 (Sprint 1 do canal WhatsApp integrado):
 *   Além de manter a lógica antiga de bianca_comunicacoes (compat),
 *   agora TODA mensagem entra em wa_contatos/wa_conversas/wa_mensagens.
 *   Isso vira a fonte de verdade do inbox unificado.
 */

// Tarefas pós-resposta (agente IA, aceite de lead) rodam via waitUntil e
// precisam de tempo além do 200 devolvido pra Meta.
export const runtime = 'nodejs'
export const maxDuration = 60

// ═══════════════════ VERIFICAÇÃO (GET) ═══════════════════
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const cfg = await getWaConfig()
  const verifyToken = cfg.verify_token
  if (!verifyToken) {
    return NextResponse.json({ error: 'Verify token não configurado. Cadastre em /admin/whatsapp/config.' }, { status: 500 })
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

          // Sprint 1: reflete no novo modelo wa_mensagens
          const patchWa: any = {}
          if (evento === 'sent') patchWa.status_entrega = 'enviada'
          if (evento === 'delivered') { patchWa.status_entrega = 'entregue'; patchWa.entregue_em = timestamp }
          if (evento === 'read') { patchWa.status_entrega = 'lida'; patchWa.lida_em = timestamp }
          if (evento === 'failed') { patchWa.status_entrega = 'falhou'; patchWa.erro = status.errors?.[0]?.title || 'Falhou (webhook)' }
          if (Object.keys(patchWa).length > 0) {
            await atualizarStatusPorMetaId(supabaseAdmin, metaId, patchWa)
          }
        }

        // ─── MENSAGEM recebida do cliente (resposta) ───
        // Extrai metadados de contato (nome do wpp) — vem em value.contacts
        const contatosMeta = value?.contacts || []
        const nomeExibicaoPorTelefone: Record<string, string> = {}
        for (const c of contatosMeta) {
          const wa = normalizarTelefone(c.wa_id)
          if (wa) nomeExibicaoPorTelefone[wa] = c.profile?.name || null
        }

        for (const msg of value?.messages || []) {
          const from = msg.from // telefone sem +
          const texto = msg.text?.body || msg.button?.text || '[mídia não-texto]'

          // Sprint 1: modelo canônico de conversa
          const tipoMsg: any = msg.type || 'text'
          const contato = await upsertContato(supabaseAdmin, {
            telefone: from,
            nome_exibicao: nomeExibicaoPorTelefone[normalizarTelefone(from)] || null,
            tipo_default: 'lead',
          })
          let conversaId: string | null = null
          if (contato) {
            const conversa = await findOrCreateConversaAtiva(supabaseAdmin, contato.id, {
              status_inicial: 'nova',
            })
            conversaId = conversa?.id || null
            if (conversaId) {
              const midiaObj = (msg as any)[tipoMsg] || {}
              // Kalebe 2026-09-21: URL da Meta é temporária (5min). Baixa e
              // salva no Storage pra o inbox conseguir mostrar preview/download
              // depois. Se falhar, grava só o meta_id (perde a mídia mas não
              // a mensagem).
              let midiaSalva: { midia_url: string; midia_mime: string; nome_arquivo: string } | null = null
              if (midiaObj?.id) {
                midiaSalva = await baixarESalvarMidiaWa({
                  midia_meta_id: midiaObj.id,
                  mime_hint: midiaObj.mime_type || null,
                  nome_original: midiaObj.filename || null,
                })
              }
              await gravarMensagem(supabaseAdmin, {
                conversa_id: conversaId,
                direcao: 'inbound',
                tipo: tipoMsg === 'text' ? 'text' : tipoMsg,
                // Pra documento sem legenda, guarda o nome do arquivo como texto
                // pra o inbox mostrar algo útil ao invés de "[mídia não-texto]"
                texto: msg.text?.body || msg.button?.text
                  || (tipoMsg === 'document' ? (midiaObj.filename || null) : null),
                meta_message_id: msg.id || null,
                midia_url: midiaSalva?.midia_url || null,
                midia_meta_id: midiaObj.id || null,
                midia_mime: midiaSalva?.midia_mime || midiaObj.mime_type || null,
                midia_duracao_seg: tipoMsg === 'audio' ? Number(midiaObj.voice_duration || 0) || null : null,
                status_entrega: 'lida',
              })
            }
          }

          // Sprint 3: se o contato é REPRESENTANTE, checar se ele mandou
          // "aceitar" pra broadcast aberto. Broadcast tem ordem-FIFO por aceite.
          if (contato && contato.criado === false) {
            // Contato já existia — pode ser rep
            const textoBruto = String(msg.text?.body || msg.button?.text || '').trim().toLowerCase()
            const acionoou = textoBruto === 'aceitar' || textoBruto === 'aceito'
              || textoBruto === '1' || textoBruto.startsWith('aceit')
            if (acionoou) {
              // Busca perfil pelo telefone (representantes têm profiles.telefone cadastrado)
              const telNorm = normalizarTelefone(from)
              const telSemDDI = telNorm.startsWith('55') ? telNorm.slice(2) : telNorm
              const { data: perfilRep } = await supabaseAdmin
                .from('profiles')
                .select('id, role, ativo')
                .or(`telefone.eq.${telNorm},telefone.eq.${telSemDDI}`)
                .in('role', ['representante', 'admin', 'consultor'])
                .maybeSingle()
              if (perfilRep?.ativo) {
                // Pega broadcast mais recente aguardando/atribuído — MVP: 1 broadcast ativo por vez
                // Realidade: poderia ter múltiplos concorrentes — Kalebe pode expandir depois.
                const { data: bc } = await supabaseAdmin
                  .from('lead_broadcasts')
                  .select('id')
                  .in('status', ['aguardando_aceites', 'atribuido'])
                  .order('criado_em', { ascending: false })
                  .limit(1)
                  .maybeSingle()
                if (bc) {
                  waitUntil(
                    aceitarLead({ broadcast_id: bc.id, representante_id: perfilRep.id })
                      .catch((err) => console.error('[webhook aceitarLead]', err)),
                  )
                  continue  // não passa pra qualificação — é aceite de rep
                }
              }
            }
          }

          // Sprint 2: agente de qualificação. Se conversa em 'nova' ou
          // 'em_qualificacao' e sem responsável humano, ativa a IA.
          // waitUntil: responde 200 pra Meta na hora, mas mantém a função viva
          // até a IA terminar. Sem isso a Vercel congelava a execução e o
          // agente morria no meio (leads ficavam sem resposta — 2026-09-23).
          if (conversaId) {
            waitUntil(
              processarMensagemQualificacao(conversaId)
                .then((r) => {
                  if ('erro' in r) console.error('[webhook agente-qualificacao] erro:', r.erro)
                })
                .catch((err) => console.error('[webhook agente-qualificacao]', err)),
            )
          }

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
