import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from './config'
import { enviarTextoPeloCanal } from './enviar-canal'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { NOME_SDR } from '@/lib/agentes/nomes'
import { dadosContatoConversa, transcricaoDaConversa, cortar } from './resumo-conversa'

/**
 * Plantão da Laís (Kalebe 2026-10-01). Conversa "em atendimento" (humano no
 * volante) em que a última mensagem é do cliente e ninguém respondeu há
 * PLANTAO_ESPERA_MIN, no horário comercial:
 *   1. a Laís acolhe o cliente ("recebi, o Fulano já te responde") — sem
 *      negociar, prometer prazo nem falar de preço;
 *   2. avisa o responsável (sino + WhatsApp) com resumo e link da conversa.
 * Se a última msg do cliente só encerra o assunto ("ok", "obrigado"), não faz
 * nada. Uma vez por mensagem do cliente (contexto_qualificacao.plantao_msg_id).
 * Roda no cron /api/cron/lead-sla (a cada minuto).
 */

export const PLANTAO_ESPERA_MIN = 10
const POR_RODADA = 5

/** Horário comercial em Brasília: seg–sex 8h–18h, sáb 8h–12h. */
export function emHorarioComercial(d = new Date()): boolean {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(d)
  const dia = partes.find((p) => p.type === 'weekday')?.value
  const hora = Number(partes.find((p) => p.type === 'hour')?.value) % 24
  if (dia === 'Sun') return false
  if (dia === 'Sat') return hora >= 8 && hora < 12
  return hora >= 8 && hora < 18
}

const SO_ENCERRA = /^(ok+|okay|obrigad[oa]s?|valeu|vlw|blz|beleza|show|perfeito|certo|combinado|tchau|até mais|até logo|👍|🙏|❤️?|😊|👏)[\s!.,]*$/i

async function avaliar(linhas: string[], ultimaDoCliente: string): Promise<{ precisa_resposta: boolean; resumo: string | null }> {
  const fallback = { precisa_resposta: !SO_ENCERRA.test(ultimaDoCliente.trim()), resumo: null }
  const { anthropic_api_key } = await getWaConfig()
  if (!anthropic_api_key || !linhas.length) return fallback
  try {
    const anthropic = new Anthropic({ apiKey: anthropic_api_key })
    const r: any = await Promise.race([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system:
          'Você analisa uma conversa de WhatsApp da Spin Solar (energia solar e serviços elétricos) em que o cliente ' +
          'está esperando resposta de um atendente humano. Responda SÓ um JSON: {"precisa_resposta": boolean, "resumo": string}. ' +
          'precisa_resposta=false quando a última mensagem do cliente só encerra ou agradece e não pede retorno ' +
          '("ok", "obrigado", "combinado", emoji, despedida). resumo: no máximo 2 frases curtas em português do Brasil — ' +
          'o que o cliente quer e o que está pendente. Só fatos da conversa, sem inventar.',
        messages: [{ role: 'user', content: linhas.join('\n').slice(-6000) }],
      }),
      new Promise((_, falha) => setTimeout(() => falha(new Error('tempo esgotado')), 12_000)),
    ])
    const txt = (r?.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join('')
    const ini = txt.indexOf('{'); const fim = txt.lastIndexOf('}')
    const j = JSON.parse(txt.slice(ini, fim + 1))
    return { precisa_resposta: j.precisa_resposta !== false, resumo: String(j.resumo || '').trim() || null }
  } catch (e) {
    console.error('[plantao] avaliar', e)
    return fallback
  }
}

export async function rodarPlantaoLais(): Promise<{ acolhidos: number; so_aviso: number }> {
  const res = { acolhidos: 0, so_aviso: 0 }
  if (!emHorarioComercial()) return res

  const admin = createAdminClient()
  const agora = Date.now()
  const { data: convs } = await admin
    .from('wa_conversas')
    .select('id, responsavel_id, ultima_mensagem_em, contexto_qualificacao, responsavel:responsavel_id(nome_completo), contato:contato_id(telefone, tipo)')
    .eq('status', 'em_atendimento')
    .not('responsavel_id', 'is', null)
    .is('encerrada_em', null)
    .lt('ultima_mensagem_em', new Date(agora - PLANTAO_ESPERA_MIN * 60_000).toISOString())
    .gt('ultima_mensagem_em', new Date(agora - 20 * 3_600_000).toISOString())   // janela de 24h ainda aberta
    .order('ultima_mensagem_em', { ascending: true })
    .limit(30)

  let tratados = 0
  for (const c of (convs || []) as any[]) {
    if (tratados >= POR_RODADA) break
    const ct = c.contato
    if (!ct?.telefone || ct.tipo === 'colaborador' || ct.tipo === 'representante') continue

    const { data: ultima } = await admin
      .from('wa_mensagens')
      .select('id, direcao, texto, tipo, criada_em')
      .eq('conversa_id', c.id)
      .order('criada_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!ultima || ultima.direcao !== 'inbound') continue
    const ctx = c.contexto_qualificacao || {}
    if (ctx.plantao_msg_id === ultima.id) continue

    // Marca antes de agir: duas rodadas do cron não tratam a mesma mensagem
    await admin
      .from('wa_conversas')
      .update({ contexto_qualificacao: { ...ctx, plantao_msg_id: ultima.id, plantao_em: new Date().toISOString() } })
      .eq('id', c.id)
    tratados++

    const d = await dadosContatoConversa(admin, c.id)
    if (!d || d.ehEquipe) continue
    const { linhas } = await transcricaoDaConversa(admin, c.id, { limite: 25 })
    const textoUltima = ultima.texto ? String(ultima.texto) : `[${ultima.tipo === 'audio' ? 'áudio' : ultima.tipo || 'mídia'}]`
    const av = await avaliar(linhas, textoUltima)
    if (!av.precisa_resposta) continue

    const responsavel = String(c.responsavel?.nome_completo || '').split(' ')[0] || 'nosso time'
    const nomeCliente = d.nome && !/^sem nome/i.test(d.nome) ? d.nome.split(' ')[0] : ''
    const r = await enviarTextoPeloCanal({
      conversa_id: c.id,
      telefone: d.telefone,
      texto: `Oi${nomeCliente ? `, ${nomeCliente}` : ''}! Recebi sua mensagem 😊 O ${responsavel} já vai te responder por aqui.`,
      remetente_agente: 'qualificacao',
      origem_agente_nome: NOME_SDR,
    })
    const acolheu = 'sucesso' in r
    if (acolheu) res.acolhidos++
    else res.so_aviso++

    const minutos = Math.round((agora - new Date(ultima.criada_em).getTime()) / 60_000)
    await avisarUsuario({
      destinatario_id: c.responsavel_id,
      agente: 'qualificacao',
      titulo: 'Cliente esperando resposta',
      mensagem: [
        `⏰ *${d.nome}* · ${d.telefoneFmt} está esperando há ${minutos} min.`,
        av.resumo ? `📝 ${av.resumo}` : null,
        `💬 “${cortar(textoUltima, 220)}”`,
        acolheu ? `A ${NOME_SDR} já avisou o cliente que você vai responder.` : null,
        `🔗 Conversa: ${d.linkConversa}`,
      ].filter(Boolean).join('\n'),
      urgente: true,
      conversa_id: c.id,
      projeto_id: d.projetoId,
    }).catch((e) => console.error('[plantao] aviso', e))
  }
  return res
}
