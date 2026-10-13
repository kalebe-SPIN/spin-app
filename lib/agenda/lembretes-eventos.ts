import { createAdminClient } from '@/lib/supabase/admin'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { URL_PORTAL } from '@/lib/agentes/nomes'
import { rotuloTipoEvento } from './tipos-evento'

/**
 * Compromissos marcados pela conversa do Spinzap (Kalebe 2026-10-13):
 *   - ANTES: o responsável recebe o lembrete (lembrete_min_antes)
 *   - DEPOIS: mensagem de acompanhamento ("como foi?") pra registrar a execução
 * Roda no cron de 1 em 1 minuto (/api/cron/lead-sla). Uma vez por evento
 * (notificacao_enviada / acompanhamento_enviado_em — mig 152). As ligações
 * que a Laís marca têm lembrete próprio (lib/spinzap/lembretes-ligacao.ts) e
 * recebem só o acompanhamento daqui.
 */

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

export async function lembretesDeEventos(): Promise<{ antes: number; depois: number }> {
  const admin = createAdminClient()
  const agora = Date.now()
  let antes = 0
  let depois = 0

  // ── Antes ──
  const { data: proximos } = await admin.from('agenda_eventos')
    .select('id, titulo, tipo, data_hora_inicio, usuario_id, wa_conversa_id, projeto_id, cliente_nome, local, url_reuniao, lembrete_min_antes')
    .not('wa_conversa_id', 'is', null)
    .eq('criado_por_bianca', false)
    .eq('notificacao_enviada', false)
    .in('status', ['agendado', 'confirmado'])
    .not('lembrete_min_antes', 'is', null)
    .gt('data_hora_inicio', new Date(agora).toISOString())
    .lte('data_hora_inicio', new Date(agora + 125 * 60_000).toISOString())
    .limit(30)
  for (const ev of (proximos || []) as any[]) {
    const falta = new Date(ev.data_hora_inicio).getTime() - agora
    if (falta > Number(ev.lembrete_min_antes) * 60_000) continue
    const { data: marcado } = await admin.from('agenda_eventos').update({ notificacao_enviada: true })
      .eq('id', ev.id).eq('notificacao_enviada', false).select('id')
    if (!marcado?.length) continue
    await avisarUsuario({
      destinatario_id: ev.usuario_id,
      agente: 'bianca',
      titulo: `Compromisso em ${Math.max(1, Math.round(falta / 60_000))} min`,
      urgente: true,
      mensagem: [
        `⏰ Às ${hora(ev.data_hora_inicio)}: *${rotuloTipoEvento(ev.tipo)} — ${ev.titulo}*`,
        ev.cliente_nome ? `👤 ${ev.cliente_nome}` : null,
        ev.local ? `📍 ${ev.local}` : null,
        ev.url_reuniao ? `🎥 Sala: ${ev.url_reuniao}` : null,
        `🔗 Conversa: ${URL_PORTAL}/spinzap?c=${ev.wa_conversa_id}`,
      ].filter(Boolean).join('\n'),
      conversa_id: ev.wa_conversa_id,
      projeto_id: ev.projeto_id || null,
    }).catch((e) => console.error('[lembretes-eventos] antes', e))
    antes++
  }

  // ── Depois: acompanhamento da execução ──
  const { data: passados, error } = await admin.from('agenda_eventos')
    .select('id, titulo, tipo, data_hora_inicio, data_hora_fim, usuario_id, wa_conversa_id, projeto_id, cliente_nome')
    .not('wa_conversa_id', 'is', null)
    .is('acompanhamento_enviado_em', null)
    .in('status', ['agendado', 'confirmado', 'em_andamento'])
    .lte('data_hora_fim', new Date(agora - 10 * 60_000).toISOString())
    .gte('data_hora_fim', new Date(agora - 24 * 3_600_000).toISOString())
    .limit(30)
  if (error) return { antes, depois }   // mig 152 ainda não rodou
  for (const ev of (passados || []) as any[]) {
    const { data: marcado } = await admin.from('agenda_eventos').update({ acompanhamento_enviado_em: new Date().toISOString() })
      .eq('id', ev.id).is('acompanhamento_enviado_em', null).select('id')
    if (!marcado?.length) continue
    await avisarUsuario({
      destinatario_id: ev.usuario_id,
      agente: 'bianca',
      titulo: 'Como foi o compromisso?',
      mensagem: [
        `📋 ${rotuloTipoEvento(ev.tipo)} — *${ev.titulo}*${ev.cliente_nome ? ` com ${ev.cliente_nome}` : ''} (${hora(ev.data_hora_inicio)}).`,
        'Como foi? Marque como realizado na agenda e registre o próximo passo na conversa.',
        `🔗 Agenda: ${URL_PORTAL}/agenda`,
        `🔗 Conversa: ${URL_PORTAL}/spinzap?c=${ev.wa_conversa_id}`,
      ].join('\n'),
      conversa_id: ev.wa_conversa_id,
      projeto_id: ev.projeto_id || null,
    }).catch((e) => console.error('[lembretes-eventos] depois', e))
    depois++
  }
  return { antes, depois }
}
