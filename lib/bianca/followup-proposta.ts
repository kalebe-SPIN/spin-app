import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Follow-up de proposta (Kalebe 2026-10-07): "quando eu envio a proposta via
 * WhatsApp… criar uma tarefa pra Bianca lembrar via WhatsApp o usuário que
 * precisa entrar em contato com o cliente pra follow-up, com prazo de 1 dia".
 * Tarefa pra amanhã; às 9h a Bianca lembra (sino + WhatsApp) — rotina de
 * 5 em 5 min (app/api/cron/followups). Uma tarefa aberta por projeto: enviar
 * de novo não duplica.
 */

const amanhaBRT = () => new Date(Date.now() + 86400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

export async function criarFollowupProposta(entrada: {
  projeto: { id: string; codigo?: string | null; cliente_razao_social?: string | null; cliente_telefone?: string | null; consultor_id?: string | null }
  usuarioId: string
  conversaId?: string | null
  como?: string
}): Promise<{ criada: boolean }> {
  const admin = createAdminClient()
  const p = entrada.projeto
  const dono = p.consultor_id || entrada.usuarioId
  const tresDias = new Date(Date.now() - 3 * 86400_000).toISOString()
  const { data: aberta } = await admin.from('agenda_tarefas').select('id')
    .eq('projeto_id', p.id).eq('usuario_id', dono).in('status', ['pendente', 'em_andamento'])
    .ilike('titulo', '%Follow-up%').gte('created_at', tresDias).limit(1)
  if ((aberta || []).length) return { criada: false }

  const cliente = p.cliente_razao_social || 'cliente'
  const prazo = amanhaBRT()
  const base: Record<string, any> = {
    usuario_id: dono,
    titulo: `📞 Follow-up ${cliente} — proposta enviada`,
    descricao: [
      `A proposta foi enviada ${entrada.como || 'ao cliente'}. Entre em contato pra saber o que achou e tirar dúvidas.`,
      p.cliente_telefone ? `Telefone: ${p.cliente_telefone}` : null,
      p.codigo ? `Projeto: ${p.codigo}` : null,
      entrada.conversaId ? `Conversa: /spinzap?c=${entrada.conversaId}` : null,
    ].filter(Boolean).join('\n'),
    data_prazo: prazo,
    prioridade: 'alta',
    projeto_id: p.id,
    criada_por_bianca: true,
    ...(entrada.conversaId ? { wa_conversa_id: entrada.conversaId } : {}),
  }
  // Bianca lembra no dia do prazo, às 9h (migration 143)
  let { error } = await admin.from('agenda_tarefas').insert({ ...base, lembrar_em: `${prazo}T09:00:00-03:00` })
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
