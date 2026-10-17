import { createAdminClient } from '@/lib/supabase/admin'
import { URL_PORTAL } from '@/lib/agentes/nomes'

/**
 * Follow-up de proposta (Kalebe 2026-10-07): "quando eu envio a proposta via
 * WhatsApp… criar uma tarefa pra Bianca lembrar via WhatsApp o usuário que
 * precisa entrar em contato com o cliente pra follow-up, com prazo de 1 dia".
 * Rotina de 5 em 5 min (app/api/cron/followups). Uma tarefa aberta por
 * projeto: enviar de novo não duplica — o lembrete passa a contar do último envio.
 *
 * Kalebe 2026-10-17: "imediatamente após o envio de qualquer proposta a Bianca
 * vai cadastrar um follow-up em 50 minutos para perguntar se o cliente já
 * analisou a proposta e, em caso positivo, já pode dar prosseguimento na
 * contratação; e também vai criar um lembrete para o responsável de em um dia
 * retomar o contato com o link da negociação no seu WhatsApp".
 *  - follow-up ao cliente: agendarFollowupClienteProposta (wa_followups, 50 min)
 *  - lembrete ao responsável: criarFollowupProposta (tarefa, lembra em 24 h
 *    com o link da conversa no Spinzap)
 * Fora do horário comercial (antes das 8h / a partir das 20h) os dois vão pras 8h.
 */

type Admin = ReturnType<typeof createAdminClient>

const MINUTOS_FOLLOWUP_CLIENTE = 50

/** Objetivo que a Bianca usa pra escrever o follow-up (texto ao cliente — aprovar com o Kalebe) */
export const OBJETIVO_FOLLOWUP_PROPOSTA =
  'Perguntar se o cliente já conseguiu analisar a proposta que enviamos há pouco e se ficou alguma dúvida. ' +
  'Se ele disser que está tudo certo, dizer que já podemos dar prosseguimento à contratação e perguntar se pode seguir.'

const diaBRT = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

/** Antes das 8h → 8h do mesmo dia; a partir das 20h → 8h do dia seguinte (horário de Brasília). */
function noHorarioComercial(d: Date): Date {
  const hora = Number(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }))
  if (hora < 8) return new Date(`${diaBRT(d)}T08:00:00-03:00`)
  if (hora >= 20) return new Date(`${diaBRT(new Date(d.getTime() + 86400_000))}T08:00:00-03:00`)
  return d
}

/** Conversa aberta do cliente do projeto no Spinzap (sem criar nada). */
export async function conversaDoProjeto(admin: Admin, projetoId: string): Promise<string | null> {
  const { data: pj } = await admin.from('projetos').select('wa_contato_id').eq('id', projetoId).maybeSingle()
  let contatoId = (pj as any)?.wa_contato_id || null
  if (!contatoId) {
    const { data: c } = await admin.from('wa_contatos').select('id').eq('projeto_id', projetoId).limit(1).maybeSingle()
    contatoId = (c as any)?.id || null
  }
  if (!contatoId) return null
  const { data: conv } = await admin.from('wa_conversas').select('id')
    .eq('contato_id', contatoId).is('encerrada_em', null).limit(1).maybeSingle()
  return (conv as any)?.id || null
}

/**
 * Follow-up da Bianca ao cliente 50 min depois do envio da proposta. Cancela se
 * o cliente responder antes (aí o responsável é avisado e segue a conversa).
 * Novo envio de proposta remarca o que ainda não saiu, sem duplicar.
 */
export async function agendarFollowupClienteProposta(entrada: {
  projetoId: string
  conversaId: string
  responsavelId: string
}): Promise<{ agendado: boolean }> {
  const admin = createAdminClient()
  const agora = new Date()
  const executar_em = noHorarioComercial(new Date(agora.getTime() + MINUTOS_FOLLOWUP_CLIENTE * 60_000)).toISOString()
  const { data: ja } = await admin.from('wa_followups').select('id')
    .eq('conversa_id', entrada.conversaId).eq('status', 'agendado').eq('mensagem', OBJETIVO_FOLLOWUP_PROPOSTA).limit(1)
  if ((ja || []).length) {
    // criado_em conta como "depois do envio" pro "cancelar se responder"
    const { error } = await admin.from('wa_followups')
      .update({ executar_em, criado_em: agora.toISOString(), projeto_id: entrada.projetoId, responsavel_id: entrada.responsavelId })
      .eq('id', (ja as any[])[0].id)
    if (error) console.error('[followup-cliente-proposta]', error.message)
    return { agendado: !error }
  }
  const { error } = await admin.from('wa_followups').insert({
    conversa_id: entrada.conversaId,
    projeto_id: entrada.projetoId,
    responsavel_id: entrada.responsavelId,
    executar_em,
    modo: 'bianca_escreve',
    mensagem: OBJETIVO_FOLLOWUP_PROPOSTA,
    cancelar_se_responder: true,
  })
  if (error) console.error('[followup-cliente-proposta]', error.message)
  return { agendado: !error }
}

export async function criarFollowupProposta(entrada: {
  projeto: { id: string; codigo?: string | null; cliente_razao_social?: string | null; cliente_telefone?: string | null; consultor_id?: string | null }
  usuarioId: string
  conversaId?: string | null
  como?: string
}): Promise<{ criada: boolean }> {
  const admin = createAdminClient()
  const p = entrada.projeto
  const dono = p.consultor_id || entrada.usuarioId
  const conversaId = entrada.conversaId || await conversaDoProjeto(admin, p.id).catch(() => null)
  const cliente = p.cliente_razao_social || 'cliente'
  // Bianca lembra o responsável 1 dia depois do envio (migration 143)
  const lembrar = noHorarioComercial(new Date(Date.now() + 86400_000))
  const prazo = diaBRT(lembrar)
  const descricao = [
    `A proposta foi enviada ${entrada.como || 'ao cliente'}. Retome o contato pra saber o que achou, tirar dúvidas e seguir pra contratação.`,
    p.cliente_telefone ? `Telefone: ${p.cliente_telefone}` : null,
    p.codigo ? `Projeto: ${p.codigo}` : null,
    conversaId ? `Negociação no Spinzap: ${URL_PORTAL}/spinzap?c=${conversaId}` : `Projeto no portal: ${URL_PORTAL}/projetos/${p.id}`,
  ].filter(Boolean).join('\n')

  const tresDias = new Date(Date.now() - 3 * 86400_000).toISOString()
  const { data: aberta } = await admin.from('agenda_tarefas').select('id')
    .eq('projeto_id', p.id).eq('usuario_id', dono).in('status', ['pendente', 'em_andamento'])
    .ilike('titulo', '%Follow-up%').gte('created_at', tresDias).limit(1)
  if ((aberta || []).length) {
    // Proposta enviada de novo (ou faltava o link da conversa): o lembrete conta deste envio
    const id = (aberta as any[])[0].id
    const { error } = await admin.from('agenda_tarefas').update({
      descricao, data_prazo: prazo, lembrar_em: lembrar.toISOString(), lembrete_enviado_em: null,
      ...(conversaId ? { wa_conversa_id: conversaId } : {}),
    }).eq('id', id)
    if (error) await admin.from('agenda_tarefas').update({ descricao, data_prazo: prazo }).eq('id', id)
    return { criada: false }
  }

  const base: Record<string, any> = {
    usuario_id: dono,
    titulo: `📞 Follow-up ${cliente} — proposta enviada`,
    descricao,
    data_prazo: prazo,
    prioridade: 'alta',
    projeto_id: p.id,
    criada_por_bianca: true,
    ...(conversaId ? { wa_conversa_id: conversaId } : {}),
  }
  let { error } = await admin.from('agenda_tarefas').insert({ ...base, lembrar_em: lembrar.toISOString() })
  if (error && /lembrar_em|wa_conversa_id/.test(error.message)) {
    const { wa_conversa_id: _w, ...semColunasNovas } = base
    ;({ error } = await admin.from('agenda_tarefas').insert(/wa_conversa_id/.test(error.message) ? semColunasNovas : base))
  }
  if (error) console.error('[followup-proposta]', error.message)
  return { criada: !error }
}

/** Lembretes vencidos das tarefas → sino + WhatsApp do dono (Bianca). */
export async function enviarLembretesDeTarefas(): Promise<{ enviados: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('agenda_tarefas')
    .select('id, usuario_id, titulo, descricao, projeto_id, wa_conversa_id')
    .in('status', ['pendente', 'em_andamento'])
    .lte('lembrar_em', new Date().toISOString())
    .is('lembrete_enviado_em', null)
    .limit(50)
  if (error) return { enviados: 0 }   // migration 143 ainda não rodou

  const { avisarUsuario } = await import('@/lib/agentes/diretorio')
  let enviados = 0
  for (const t of (data || []) as any[]) {
    // marca antes (duas rodadas não mandam em dobro)
    const { data: pego } = await admin.from('agenda_tarefas')
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq('id', t.id).is('lembrete_enviado_em', null).select('id')
    if (!pego?.length) continue
    const r = await avisarUsuario({
      destinatario_id: t.usuario_id,
      agente: 'bianca',
      titulo: 'Lembrete de tarefa',
      mensagem: `⏰ ${t.titulo}\n\n${t.descricao || ''}`.trim(),
      projeto_id: t.projeto_id || null,
      conversa_id: t.wa_conversa_id || null,
    }).catch(() => ({ sucesso: false }))
    if (r.sucesso) enviados++
  }
  return { enviados }
}
