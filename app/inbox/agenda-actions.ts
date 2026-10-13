'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { URL_PORTAL } from '@/lib/agentes/nomes'
import { TIPOS_EVENTO, rotuloTipoEvento, type TipoEvento } from '@/lib/agenda/tipos-evento'

/**
 * Agenda a partir da conversa (Kalebe 2026-09-29): tarefa, evento ou
 * follow-up que a Bianca executa na própria conversa.
 * Kalebe 2026-10-13: escolhe o RESPONSÁVEL (qualquer usuário ativo) — o item
 * vai pra agenda dele e ele recebe o aviso (WhatsApp + sino). Evento ganhou
 * "Call" (sala de vídeo gerada) e "Reunião externa" (endereço obrigatório),
 * lembrete antes e mensagem de acompanhamento depois
 * (lib/agenda/lembretes-eventos.ts, no cron de 1 em 1 minuto).
 * Acesso: só agenda em conversa que o usuário enxerga (RLS); a gravação vai
 * pelo service role porque a agenda é de outra pessoa.
 */

export type ItemAgendaConversa = {
  id: string
  tipo: 'followup' | 'tarefa' | 'evento'
  titulo: string
  quando: string | null
  status: string
  detalhe: string | null
  responsavel: string | null
}

async function conversaAcessivel(conversaId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as string, supabase, user: null, conv: null }
  const { data: conv } = await supabase
    .from('wa_conversas')
    .select('id, contato:contato_id(nome_exibicao, telefone, projeto_id)')
    .eq('id', conversaId)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' as string, supabase, user, conv: null }
  return { erro: null, supabase, user, conv: conv as any }
}

/** Quem pode ser responsável (equipe ativa, A→Z) + quem está logado (padrão). */
export async function listarResponsaveisAction(): Promise<
  { usuarios: Array<{ id: string; nome: string }>; eu: string } | { erro: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data, error } = await createAdminClient().from('profiles')
    .select('id, nome_completo, role').eq('ativo', true).neq('role', 'candidato')
  if (error) return { erro: error.message }
  const usuarios = ((data || []) as any[])
    .map((p) => ({ id: p.id as string, nome: (p.nome_completo as string) || 'Sem nome' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { usuarios, eu: user.id }
}

export async function listarAgendaConversaAction(conversaId: string): Promise<{ itens: ItemAgendaConversa[] } | { erro: string }> {
  const { erro } = await conversaAcessivel(conversaId)
  if (erro) return { erro }
  // Itens podem ser de outras pessoas (responsável escolhido) — lê pelo service role
  const admin = createAdminClient()
  const [f, t, e] = await Promise.all([
    admin.from('wa_followups').select('id, executar_em, status, modo, mensagem, texto_enviado, motivo, responsavel:responsavel_id(nome_completo)')
      .eq('conversa_id', conversaId).order('executar_em', { ascending: false }).limit(20),
    admin.from('agenda_tarefas').select('id, titulo, data_prazo, status, usuario:usuario_id(nome_completo)')
      .eq('wa_conversa_id', conversaId).order('data_prazo', { ascending: false }).limit(20),
    admin.from('agenda_eventos').select('id, titulo, data_hora_inicio, status, tipo, usuario:usuario_id(nome_completo)')
      .eq('wa_conversa_id', conversaId).order('data_hora_inicio', { ascending: false }).limit(20),
  ])
  const nome = (x: any) => String(x?.nome_completo || '').split(' ')[0] || null
  const itens: ItemAgendaConversa[] = [
    ...(f.data || []).map((x: any) => ({
      id: x.id, tipo: 'followup' as const,
      titulo: x.modo === 'texto_exato' ? `Follow-up: "${x.mensagem}"` : `Follow-up (Bianca escreve): ${x.mensagem}`,
      quando: x.executar_em, status: x.status,
      detalhe: x.texto_enviado ? `Enviado: "${x.texto_enviado}"` : x.motivo,
      responsavel: nome(x.responsavel),
    })),
    ...(t.data || []).map((x: any) => ({
      id: x.id, tipo: 'tarefa' as const, titulo: x.titulo, quando: x.data_prazo, status: x.status, detalhe: null, responsavel: nome(x.usuario),
    })),
    ...(e.data || []).map((x: any) => ({
      id: x.id, tipo: 'evento' as const, titulo: `${rotuloTipoEvento(x.tipo)}: ${x.titulo}`, quando: x.data_hora_inicio, status: x.status, detalhe: null, responsavel: nome(x.usuario),
    })),
  ].sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')))
  return { itens }
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

export async function agendarNaConversaAction(input: {
  conversa_id: string
  tipo: 'followup' | 'tarefa' | 'evento'
  quando: string                 // ISO (followup/evento) ou YYYY-MM-DD (tarefa)
  /** Quem executa (padrão: quem está criando) */
  responsavel_id?: string | null
  titulo?: string
  descricao?: string
  // followup
  modo?: 'texto_exato' | 'bianca_escreve'
  mensagem?: string
  cancelar_se_responder?: boolean
  // tarefa
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente'
  // evento
  duracao_min?: number
  tipo_evento?: TipoEvento
  local?: string
  lembrete_min?: number
}): Promise<{ sucesso: true; responsavel: string; link_sala?: string | null } | { erro: string }> {
  const { erro, user, conv } = await conversaAcessivel(input.conversa_id)
  if (erro || !user || !conv) return { erro: erro || 'Sem acesso' }
  const admin = createAdminClient()
  const contato = conv.contato || {}
  const nomeCliente = contato.nome_exibicao || contato.telefone || 'cliente'
  const projetoId = contato.projeto_id || null
  const rodape = `\n\n— criado a partir da conversa do WhatsApp com ${nomeCliente}`

  // Responsável: usuário ativo da equipe
  const respId = input.responsavel_id || user.id
  const { data: resp } = await admin.from('profiles').select('id, nome_completo, ativo, role').eq('id', respId).maybeSingle()
  if (!resp || resp.ativo === false || resp.role === 'candidato') return { erro: 'Responsável inválido ou desativado' }
  const { data: eu } = await admin.from('profiles').select('nome_completo').eq('id', user.id).maybeSingle()
  const quemCriou = String(eu?.nome_completo || 'Alguém da equipe').split(' ')[0]
  const linkConversa = `${URL_PORTAL}/spinzap?c=${conv.id}`
  let aviso: { titulo: string; linhas: Array<string | null> } | null = null
  let linkSala: string | null = null

  if (input.tipo === 'followup') {
    const quando = new Date(input.quando)
    if (isNaN(quando.getTime())) return { erro: 'Data/hora inválida' }
    if (quando.getTime() < Date.now() - 60_000) return { erro: 'Escolha uma data/hora no futuro' }
    const mensagem = String(input.mensagem || '').trim()
    if (!mensagem) return { erro: input.modo === 'texto_exato' ? 'Escreva a mensagem' : 'Diga o objetivo do follow-up pra Bianca' }
    const { error } = await admin.from('wa_followups').insert({
      conversa_id: conv.id,
      projeto_id: projetoId,
      responsavel_id: respId,
      executar_em: quando.toISOString(),
      modo: input.modo === 'texto_exato' ? 'texto_exato' : 'bianca_escreve',
      mensagem,
      cancelar_se_responder: input.cancelar_se_responder !== false,
    })
    if (error) return { erro: error.message.includes('wa_followups') ? 'Falta rodar a migration 123 no Supabase.' : error.message }
    aviso = {
      titulo: 'Follow-up agendado no seu nome',
      linhas: [
        `💬 ${quemCriou} agendou um follow-up com *${nomeCliente}* em ${dataHora(quando.toISOString())}.`,
        `${input.modo === 'texto_exato' ? 'Mensagem' : 'Objetivo'}: ${mensagem}`,
        'A Bianca envia na hora marcada; se não der (janela de 24h), ela te avisa pra você chamar.',
      ],
    }
  }

  if (input.tipo === 'tarefa') {
    const titulo = String(input.titulo || '').trim()
    if (!titulo) return { erro: 'Dê um título pra tarefa' }
    const prazo = input.quando ? input.quando.slice(0, 10) : null
    // Lembrete no dia do prazo às 9h (se ainda estiver no futuro)
    const lembrar = prazo ? new Date(`${prazo}T09:00:00-03:00`) : null
    const { error } = await admin.from('agenda_tarefas').insert({
      titulo,
      descricao: `${String(input.descricao || '').trim()}${rodape}`.trim(),
      data_prazo: prazo,
      prioridade: input.prioridade || 'media',
      usuario_id: respId,
      projeto_id: projetoId,
      wa_conversa_id: conv.id,
      criado_por_usuario_id: user.id,
      ...(lembrar && lembrar.getTime() > Date.now() ? { lembrar_em: lembrar.toISOString() } : {}),
    })
    if (error) return { erro: error.message }
    aviso = {
      titulo: 'Nova tarefa pra você',
      linhas: [
        `✅ ${quemCriou} criou uma tarefa pra você: *${titulo}*`,
        prazo ? `📅 Prazo: ${new Date(`${prazo}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : null,
        `👤 Cliente: ${nomeCliente}`,
        input.descricao?.trim() ? `📝 ${input.descricao.trim()}` : null,
      ],
    }
  }

  if (input.tipo === 'evento') {
    const titulo = String(input.titulo || '').trim()
    if (!titulo) return { erro: 'Dê um título pro evento' }
    const inicio = new Date(input.quando)
    if (isNaN(inicio.getTime())) return { erro: 'Data/hora inválida' }
    const tipo: TipoEvento = TIPOS_EVENTO.some((t) => t.valor === input.tipo_evento) ? input.tipo_evento! : 'ligacao'
    const local = input.local?.trim() || null
    if (tipo === 'reuniao_externa' && !local) return { erro: 'Reunião externa: informe o endereço' }
    // Call: sala de vídeo (mesmo padrão das chamadas do Spinzap)
    if (tipo === 'call') linkSala = `https://meet.jit.si/spin-call-${Math.random().toString(36).slice(2, 10)}`
    const lembrete = [5, 15, 30, 60, 120].includes(Number(input.lembrete_min)) ? Number(input.lembrete_min) : 30
    const fim = new Date(inicio.getTime() + (Number(input.duracao_min) || 60) * 60_000)
    const { error } = await admin.from('agenda_eventos').insert({
      titulo,
      descricao: `${String(input.descricao || '').trim()}${rodape}`.trim(),
      data_hora_inicio: inicio.toISOString(),
      data_hora_fim: fim.toISOString(),
      tipo,
      local,
      url_reuniao: linkSala,
      usuario_id: respId,
      projeto_id: projetoId,
      cliente_nome: nomeCliente,
      lembrete_min_antes: lembrete,
      wa_conversa_id: conv.id,
      criado_por_usuario_id: user.id,
    })
    if (error) return { erro: error.message }
    aviso = {
      titulo: 'Novo compromisso na sua agenda',
      linhas: [
        `📅 ${quemCriou} marcou na sua agenda: *${rotuloTipoEvento(tipo)} — ${titulo}*`,
        `🕐 ${dataHora(inicio.toISOString())} (${Number(input.duracao_min) || 60} min)`,
        `👤 Cliente: ${nomeCliente}`,
        local ? `📍 ${local}` : null,
        linkSala ? `🎥 Sala da call: ${linkSala}` : null,
        `⏰ Eu te lembro ${lembrete} min antes.`,
      ],
    }
  }

  // Responsável recebe o compromisso (WhatsApp + sino). Quem criou pra si mesmo não precisa.
  if (aviso && respId !== user.id) {
    const { avisarUsuario } = await import('@/lib/agentes/diretorio')
    await avisarUsuario({
      destinatario_id: respId,
      agente: 'bianca',
      remetente_usuario_id: user.id,
      titulo: aviso.titulo,
      mensagem: [...aviso.linhas, `🔗 Conversa: ${linkConversa}`].filter(Boolean).join('\n'),
      conversa_id: conv.id,
      projeto_id: projetoId,
    }).catch((e) => console.error('[agenda-conversa] aviso', e))
  }

  revalidatePath('/agenda')
  return { sucesso: true, responsavel: String(resp.nome_completo || '').split(' ')[0], link_sala: linkSala }
}

export async function cancelarFollowupAction(id: string): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  // Follow-up pode estar no nome de outra pessoa: confere o acesso à conversa e cancela pelo service role
  const admin = createAdminClient()
  const { data: f } = await admin.from('wa_followups').select('conversa_id').eq('id', id).maybeSingle()
  if (!f) return { erro: 'Follow-up não encontrado' }
  const { erro } = await conversaAcessivel(f.conversa_id)
  if (erro) return { erro }
  const { error } = await admin
    .from('wa_followups')
    .update({ status: 'cancelado', motivo: 'Cancelado pelo usuário', executado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'agendado')
  if (error) return { erro: error.message }
  return { sucesso: true }
}
