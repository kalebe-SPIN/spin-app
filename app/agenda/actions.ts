'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Actions da agenda — mudar status de tarefas/eventos, registrar
 * comunicações (Bianca ou consultor), auditoria automática.
 */

// ═══════════════════ STATUS TAREFA ═══════════════════
export async function mudarStatusTarefaAction(
  tarefaId: string,
  novoStatus: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada',
  observacao?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: atual } = await supabase
    .from('agenda_tarefas')
    .select('id, usuario_id, status, titulo')
    .eq('id', tarefaId)
    .single()

  if (!atual) return { erro: 'Tarefa não encontrada' }
  if (atual.usuario_id !== user.id) return { erro: 'Tarefa não é sua' }
  if (atual.status === novoStatus) return { sucesso: true, semAlteracao: true }

  const patch: any = { status: novoStatus }
  if (novoStatus === 'concluida') patch.concluida_em = new Date().toISOString()
  else patch.concluida_em = null

  const { error } = await supabase
    .from('agenda_tarefas')
    .update(patch)
    .eq('id', tarefaId)

  if (error) return { erro: error.message }

  // Registra no histórico
  await supabase.from('agenda_historico').insert({
    usuario_id: user.id,
    tarefa_id: tarefaId,
    acao: novoStatus === 'concluida' ? 'concluida' : novoStatus === 'cancelada' ? 'cancelada' : 'status_alterado',
    status_anterior: atual.status,
    status_novo: novoStatus,
    observacao,
    origem: 'usuario',
  })

  revalidatePath('/agenda')
  return { sucesso: true }
}

// ═══════════════════ STATUS EVENTO ═══════════════════
export async function mudarStatusEventoAction(
  eventoId: string,
  novoStatus: 'agendado' | 'confirmado' | 'em_andamento' | 'realizado' | 'cancelado' | 'adiado',
  observacao?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: atual } = await supabase
    .from('agenda_eventos')
    .select('id, usuario_id, status, titulo')
    .eq('id', eventoId)
    .single()

  if (!atual) return { erro: 'Evento não encontrado' }
  if (atual.usuario_id !== user.id) return { erro: 'Evento não é seu' }
  if (atual.status === novoStatus) return { sucesso: true, semAlteracao: true }

  const { error } = await supabase
    .from('agenda_eventos')
    .update({ status: novoStatus })
    .eq('id', eventoId)

  if (error) return { erro: error.message }

  await supabase.from('agenda_historico').insert({
    usuario_id: user.id,
    evento_id: eventoId,
    acao: 'status_alterado',
    status_anterior: atual.status,
    status_novo: novoStatus,
    observacao,
    origem: 'usuario',
  })

  revalidatePath('/agenda')
  return { sucesso: true }
}

// ═══════════════════ COMENTÁRIO NO HISTÓRICO ═══════════════════
export async function adicionarComentarioAction(input: {
  tarefaId?: string
  eventoId?: string
  observacao: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  if (!input.observacao.trim()) return { erro: 'Comentário vazio' }
  if (!input.tarefaId && !input.eventoId) return { erro: 'Falta tarefa/evento' }

  const { error } = await supabase.from('agenda_historico').insert({
    usuario_id: user.id,
    tarefa_id: input.tarefaId,
    evento_id: input.eventoId,
    acao: 'comentario',
    observacao: input.observacao,
    origem: 'usuario',
  })
  if (error) return { erro: error.message }
  revalidatePath('/agenda')
  return { sucesso: true }
}

// ═══════════════════ COMUNICAÇÃO WHATSAPP ═══════════════════
/**
 * Registra uma comunicação (sugerida ou enviada) da Bianca ou do consultor.
 * Se canal=whatsapp, gera link wa.me pra abrir no WhatsApp Web/App.
 */
export async function registrarComunicacaoAction(input: {
  canal: 'whatsapp' | 'email' | 'sms' | 'ligacao_lembrete'
  destinatario_nome?: string
  destinatario_telefone?: string
  destinatario_email?: string
  assunto?: string
  mensagem: string
  tarefaId?: string | null
  eventoId?: string | null
  projetoId?: string | null
  marcar_como_enviada?: boolean
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  // Normaliza telefone → só dígitos, com 55 na frente se BR
  let tel = input.destinatario_telefone?.replace(/\D/g, '')
  if (tel && !tel.startsWith('55') && tel.length === 11) tel = '55' + tel

  let link_wa: string | null = null
  if (input.canal === 'whatsapp' && tel) {
    link_wa = `https://wa.me/${tel}?text=${encodeURIComponent(input.mensagem)}`
  }

  const { data, error } = await supabase.from('bianca_comunicacoes').insert({
    usuario_id: user.id,
    tarefa_id: input.tarefaId,
    evento_id: input.eventoId,
    projeto_id: input.projetoId,
    destinatario_nome: input.destinatario_nome,
    destinatario_telefone: tel,
    destinatario_email: input.destinatario_email,
    canal: input.canal,
    assunto: input.assunto,
    mensagem: input.mensagem,
    link_wa,
    status: input.marcar_como_enviada ? 'enviada_manualmente' : 'sugerida',
    enviada_em: input.marcar_como_enviada ? new Date().toISOString() : null,
  }).select('id, link_wa').single()

  if (error) return { erro: error.message }
  revalidatePath('/agenda')
  return { sucesso: true, id: data.id, link_wa: data.link_wa }
}

// ═══════════════════ MARCAR COMUNICAÇÃO COMO ENVIADA ═══════════════════
export async function marcarComunicacaoEnviadaAction(comunicacaoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { error } = await supabase
    .from('bianca_comunicacoes')
    .update({
      status: 'enviada_manualmente',
      enviada_em: new Date().toISOString(),
    })
    .eq('id', comunicacaoId)
    .eq('usuario_id', user.id)

  if (error) return { erro: error.message }
  revalidatePath('/agenda')
  return { sucesso: true }
}
