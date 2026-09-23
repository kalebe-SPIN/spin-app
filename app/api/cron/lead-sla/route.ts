import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarTextoPeloCanal } from '@/lib/whatsapp/enviar-canal'
import { upsertContato, findOrCreateConversaAtiva } from '@/lib/whatsapp/conversas'
import {
  PRAZO_CONTATO_MIN,
  AVISO_MIN_ANTES,
  RETOMADA_MIN,
} from '@/lib/whatsapp/broadcast'
import { processarMensagemQualificacao } from '@/lib/whatsapp/agente-qualificacao'

/**
 * Cron SLA do canal WhatsApp Spin.
 *
 * Kalebe 2026-09-14. Ver [[project_fluxo_lead_whatsapp_spin]].
 *
 * Roda a cada 60s (config em vercel.json). Faz 3 coisas:
 *
 *   1. AVISO 2min antes do prazo — pra rep no_volante cuja prazo_expira_em
 *      está a menos de 2min de agora, envia "restam 2 min" (idempotente
 *      via aviso_2min_enviado_em)
 *
 *   2. FAILOVER — pra rep no_volante cuja prazo_expira_em < now() sem
 *      contatou_em: marca 'perdeu_prazo', promove próximo aceite pendente
 *      pra no_volante (novo prazo 8min), avisa o rep + o lead. Se não tem
 *      próximo, marca broadcast como 'expirado'.
 *
 *   3. MODO PROFUNDO 35min — pra broadcast criado há 35+ min ainda em
 *      aguardando_aceites/atribuido sem contatado_em: marca no
 *      contexto_qualificacao status_qualificacao='coletando_profundo' e
 *      chama processarMensagemQualificacao pra agente voltar a perguntar
 *      as info profundas (tipo sistema, imóvel, consumo).
 */

const CRON_SECRET = process.env.CRON_SECRET || 'spin_bianca_cron_2026'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const agora = new Date()
  const agoraIso = agora.toISOString()
  const janelaAvisoIso = new Date(agora.getTime() + AVISO_MIN_ANTES * 60_000).toISOString()

  const stats = {
    avisos_2min_enviados: 0,
    prazos_expirados: 0,
    failovers: 0,
    broadcasts_expirados: 0,
    modos_profundo_ativados: 0,
    reprocessados_sem_resposta: 0,
    erros: 0,
  }

  try {
    // ─── 1. AVISO 2min antes ────────────────────────────────────────────
    const { data: aVisoPendentes } = await admin
      .from('lead_aceites')
      .select(`
        id, broadcast_id, representante_id, prazo_expira_em,
        representante:representante_id(nome_completo, telefone)
      `)
      .eq('status', 'no_volante')
      .is('aviso_2min_enviado_em', null)
      .lte('prazo_expira_em', janelaAvisoIso)
      .gte('prazo_expira_em', agoraIso)
      .limit(50)

    for (const aceite of aVisoPendentes || []) {
      try {
        const rep: any = (aceite as any).representante
        if (!rep?.telefone) continue
        const tel = normalizarBR(rep.telefone)
        const contato = await upsertContato(admin, { telefone: tel, tipo_default: 'representante' })
        if (!contato) continue
        const conversa = await findOrCreateConversaAtiva(admin, contato.id, { status_inicial: 'em_atendimento' })
        if (!conversa) continue
        await enviarTextoPeloCanal({
          conversa_id: conversa.id,
          telefone: tel,
          texto: `⏰ Você tem *${AVISO_MIN_ANTES} minutos* pra contatar o lead. Se não mandar áudio ou vídeo pelo canal Spin até lá, o lead vai pro próximo da fila.`,
          remetente_agente: 'sistema',
          origem_agente_nome: 'Central Spin',
          prefixar_com_nome: false,
        })
        await admin
          .from('lead_aceites')
          .update({ aviso_2min_enviado_em: agoraIso })
          .eq('id', aceite.id)
        stats.avisos_2min_enviados++
      } catch (e) {
        console.error('[cron lead-sla/aviso]', e)
        stats.erros++
      }
    }

    // ─── 2. FAILOVER — prazo expirado sem contato ───────────────────────
    const { data: expirados } = await admin
      .from('lead_aceites')
      .select(`
        id, broadcast_id, representante_id, posicao, prazo_expira_em,
        representante:representante_id(nome_completo, telefone)
      `)
      .eq('status', 'no_volante')
      .lt('prazo_expira_em', agoraIso)
      .is('contatou_em', null)
      .limit(50)

    for (const aceite of expirados || []) {
      try {
        stats.prazos_expirados++

        // Marca como perdeu_prazo
        await admin
          .from('lead_aceites')
          .update({
            status: 'perdeu_prazo',
            fim_turno_em: agoraIso,
          })
          .eq('id', aceite.id)

        // Avisa quem perdeu
        const repPerdeu: any = (aceite as any).representante
        if (repPerdeu?.telefone) {
          const tel = normalizarBR(repPerdeu.telefone)
          const contato = await upsertContato(admin, { telefone: tel, tipo_default: 'representante' })
          if (contato) {
            const conv = await findOrCreateConversaAtiva(admin, contato.id, { status_inicial: 'em_atendimento' })
            if (conv) {
              await enviarTextoPeloCanal({
                conversa_id: conv.id,
                telefone: tel,
                texto: `⌛ Prazo esgotado. O lead foi pro próximo da fila.`,
                remetente_agente: 'sistema',
                origem_agente_nome: 'Central Spin',
                prefixar_com_nome: false,
              })
            }
          }
        }

        // Busca próximo aceite pendente na mesma fila
        const { data: proximo } = await admin
          .from('lead_aceites')
          .select(`
            id, representante_id, posicao,
            representante:representante_id(nome_completo, telefone)
          `)
          .eq('broadcast_id', aceite.broadcast_id)
          .eq('status', 'pendente')
          .order('posicao', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (proximo) {
          const novoPrazo = new Date(Date.now() + PRAZO_CONTATO_MIN * 60_000).toISOString()
          await admin
            .from('lead_aceites')
            .update({
              status: 'no_volante',
              no_volante_em: agoraIso,
              prazo_expira_em: novoPrazo,
            })
            .eq('id', proximo.id)

          await admin
            .from('lead_broadcasts')
            .update({
              posicao_atual: proximo.posicao,
              atualizado_em: agoraIso,
            })
            .eq('id', aceite.broadcast_id)

          stats.failovers++

          // Avisa o próximo rep
          const repProx: any = (proximo as any).representante
          if (repProx?.telefone) {
            const tel = normalizarBR(repProx.telefone)
            const contato = await upsertContato(admin, { telefone: tel, tipo_default: 'representante' })
            if (contato) {
              const conv = await findOrCreateConversaAtiva(admin, contato.id, { status_inicial: 'em_atendimento' })
              if (conv) {
                await enviarTextoPeloCanal({
                  conversa_id: conv.id,
                  telefone: tel,
                  texto: `✅ Sua vez! O lead está esperando. Você tem *${PRAZO_CONTATO_MIN} minutos* pra mandar áudio/vídeo pelo canal Spin.`,
                  remetente_agente: 'sistema',
                  origem_agente_nome: 'Central Spin',
                  prefixar_com_nome: false,
                })
              }
            }
          }

          // Avisa o lead
          const { data: bc } = await admin
            .from('lead_broadcasts')
            .select('conversa_id, contato:contato_id(telefone)')
            .eq('id', aceite.broadcast_id)
            .maybeSingle()
          const telLead = (bc?.contato as any)?.telefone
          if (bc?.conversa_id && telLead) {
            await enviarTextoPeloCanal({
              conversa_id: bc.conversa_id,
              telefone: telLead,
              texto: `Canal Spin um pouco cheio agora. Já estou passando pra outro representante — só mais alguns minutinhos, tá?`,
              remetente_agente: 'qualificacao',
              origem_agente_nome: 'Assistente Spin',
            })
          }
        } else {
          // Fila zerou — marca broadcast como expirado
          await admin
            .from('lead_broadcasts')
            .update({
              status: 'expirado',
              posicao_atual: 0,
              atualizado_em: agoraIso,
              encerrado_em: agoraIso,
            })
            .eq('id', aceite.broadcast_id)
          stats.broadcasts_expirados++
        }
      } catch (e) {
        console.error('[cron lead-sla/failover]', e)
        stats.erros++
      }
    }

    // ─── 3. MODO PROFUNDO após 35min sem contato ────────────────────────
    const limiteRetomadaIso = new Date(agora.getTime() - RETOMADA_MIN * 60_000).toISOString()
    const { data: broadcastsAntigos } = await admin
      .from('lead_broadcasts')
      .select('id, conversa_id, contexto_qualificacao')
      .in('status', ['aguardando_aceites', 'atribuido'])
      .lt('criado_em', limiteRetomadaIso)
      .limit(20)

    for (const bc of broadcastsAntigos || []) {
      try {
        const ctx = bc.contexto_qualificacao || {}
        // Só ativa modo profundo uma vez
        if (ctx.status_qualificacao === 'coletando_profundo' || ctx.modo_profundo_ativado_em) continue

        await admin
          .from('wa_conversas')
          .update({
            contexto_qualificacao: {
              ...ctx,
              status_qualificacao: 'coletando_profundo',
              modo_profundo_ativado_em: agoraIso,
            },
            status: 'em_qualificacao',   // reativa agente
            agente_ativo: 'qualificacao',
          })
          .eq('id', bc.conversa_id)

        // Dispara agente pra fazer a primeira pergunta profunda. Precisa de
        // await: sem isso a função encerra antes da IA responder.
        await processarMensagemQualificacao(bc.conversa_id).catch((err) =>
          console.error('[cron lead-sla/modo_profundo]', err),
        )
        stats.modos_profundo_ativados++
      } catch (e) {
        console.error('[cron lead-sla/modo_profundo]', e)
        stats.erros++
      }
    }

    // ─── 4. REDE DE SEGURANÇA — lead que ficou sem resposta do agente ───
    // Kalebe 2026-09-23: webhook matava o agente no meio (sem waitUntil) e
    // 9 leads ficaram com a última msg do cliente sem resposta. Se algo
    // falhar de novo, o cron reprocessa. Janela 3min–20h: depois de 24h a
    // Meta bloqueia texto livre. processarMensagemQualificacao já ignora
    // conversa cuja última msg é nossa, então reprocessar é seguro.
    const tresMinAtrasIso = new Date(agora.getTime() - 3 * 60_000).toISOString()
    const vinteHorasAtrasIso = new Date(agora.getTime() - 20 * 3_600_000).toISOString()
    const { data: semResposta } = await admin
      .from('wa_conversas')
      .select('id')
      .in('status', ['nova', 'em_qualificacao'])
      .lt('ultima_mensagem_em', tresMinAtrasIso)
      .gt('ultima_mensagem_em', vinteHorasAtrasIso)
      .limit(5)

    for (const conv of semResposta || []) {
      try {
        const r = await processarMensagemQualificacao(conv.id)
        if ('acao' in r && r.acao !== 'ignorada') stats.reprocessados_sem_resposta++
        if ('erro' in r) {
          console.error('[cron lead-sla/rede_seguranca]', conv.id, r.erro)
          stats.erros++
        }
      } catch (e) {
        console.error('[cron lead-sla/rede_seguranca]', e)
        stats.erros++
      }
    }

    return NextResponse.json({ ok: true, stats })
  } catch (e: any) {
    console.error('[cron lead-sla]', e)
    return NextResponse.json({ ok: false, erro: e?.message, stats }, { status: 200 })
  }
}

function normalizarBR(t: string) {
  let x = String(t || '').replace(/\D/g, '')
  if (x.length === 11 || x.length === 10) x = '55' + x
  return x
}
