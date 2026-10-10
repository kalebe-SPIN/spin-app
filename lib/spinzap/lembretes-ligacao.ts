import { createAdminClient } from '@/lib/supabase/admin'
import { enviarTextoPeloCanal } from '@/lib/whatsapp/enviar-canal'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { NOME_SDR, URL_PORTAL } from '@/lib/agentes/nomes'
import { TEXTOS_LAIS } from '@/lib/whatsapp/lais-textos'

/**
 * Lembrete da ligação de orçamento (Kalebe 2026-10-10): "a Laís dispara 5
 * minutos antes da ligação, pro lead e pro consultor". Roda no cron de 1 em 1
 * minuto (/api/cron/lead-sla). Só ligações marcadas pela Laís (tipo
 * 'ligacao' com conversa ligada). Uma vez por evento (notificacao_enviada).
 */
export async function enviarLembretesLigacao(): Promise<{ enviados: number }> {
  const admin = createAdminClient()
  const agora = Date.now()
  const { data: eventos, error } = await admin.from('agenda_eventos')
    .select('id, data_hora_inicio, usuario_id, wa_conversa_id, projeto_id, cliente_nome, lembrete_min_antes, status')
    .eq('tipo', 'ligacao')
    .eq('notificacao_enviada', false)
    .not('wa_conversa_id', 'is', null)
    .in('status', ['agendado', 'confirmado'])
    .gte('data_hora_inicio', new Date(agora - 10 * 60_000).toISOString())
    .lte('data_hora_inicio', new Date(agora + 6 * 60_000).toISOString())
    .limit(20)
  if (error) return { enviados: 0 }

  let enviados = 0
  for (const ev of (eventos || []) as any[]) {
    const minAntes = Number(ev.lembrete_min_antes || 5)
    if (new Date(ev.data_hora_inicio).getTime() - agora > minAntes * 60_000) continue
    // Marca antes de enviar: duas rodadas do cron não lembram duas vezes
    const { data: marcado } = await admin.from('agenda_eventos').update({ notificacao_enviada: true })
      .eq('id', ev.id).eq('notificacao_enviada', false).select('id')
    if (!marcado?.length) continue

    const [{ data: conv }, { data: consultor }] = await Promise.all([
      admin.from('wa_conversas').select('id, janela_24h_expira_em, contato:contato_id(telefone, nome_exibicao)').eq('id', ev.wa_conversa_id).maybeSingle(),
      admin.from('profiles').select('nome_completo').eq('id', ev.usuario_id).maybeSingle(),
    ])
    const contato = (conv as any)?.contato
    const nomeConsultor = String(consultor?.nome_completo || 'nosso consultor').split(' ')[0]
    const nomeCliente = String(contato?.nome_exibicao || ev.cliente_nome || '').trim().split(/\s+/)[0]
    const hora = new Date(ev.data_hora_inicio).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

    // Cliente: só dentro da janela de 24h (fora dela precisaria de modelo aprovado)
    let clienteLembrado = false
    const janelaAberta = (conv as any)?.janela_24h_expira_em && new Date((conv as any).janela_24h_expira_em).getTime() > agora
    if (contato?.telefone && janelaAberta) {
      const r = await enviarTextoPeloCanal({
        conversa_id: ev.wa_conversa_id, telefone: contato.telefone,
        texto: TEXTOS_LAIS.lembreteCliente(nomeCliente, nomeConsultor),
        remetente_agente: 'qualificacao', origem_agente_nome: NOME_SDR,
      })
      clienteLembrado = 'sucesso' in r
    }

    await avisarUsuario({
      destinatario_id: ev.usuario_id,
      agente: 'qualificacao',
      titulo: 'Ligação em 5 minutos',
      urgente: true,
      mensagem: [
        `⏰ Às ${hora}: ligar para *${contato?.nome_exibicao || ev.cliente_nome || 'cliente'}* · ${contato?.telefone || ''}`,
        'O cliente espera o orçamento na própria ligação.',
        clienteLembrado ? 'A Laís já lembrou o cliente.' : 'Não deu pra lembrar o cliente pelo WhatsApp (janela de 24h fechada).',
        `🔗 Conversa: ${URL_PORTAL}/spinzap?c=${ev.wa_conversa_id}`,
        ev.projeto_id ? `🔗 Projeto: ${URL_PORTAL}/projetos/${ev.projeto_id}` : null,
      ].filter(Boolean).join('\n'),
      conversa_id: ev.wa_conversa_id,
      projeto_id: ev.projeto_id || null,
    }).catch((e) => console.error('[lembretes-ligacao] aviso', e))
    enviados++
  }
  return { enviados }
}
