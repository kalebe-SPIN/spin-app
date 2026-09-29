'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Agenda a partir da conversa (Kalebe 2026-09-29): tarefa, evento ou
 * follow-up que a Bianca executa na própria conversa. Tudo pela sessão do
 * usuário (RLS): só agenda em conversa que ele enxerga.
 */

export type ItemAgendaConversa = {
  id: string
  tipo: 'followup' | 'tarefa' | 'evento'
  titulo: string
  quando: string | null
  status: string
  detalhe: string | null
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

export async function listarAgendaConversaAction(conversaId: string): Promise<{ itens: ItemAgendaConversa[] } | { erro: string }> {
  const { erro, supabase } = await conversaAcessivel(conversaId)
  if (erro) return { erro }
  const [f, t, e] = await Promise.all([
    supabase.from('wa_followups').select('id, executar_em, status, modo, mensagem, texto_enviado, motivo')
      .eq('conversa_id', conversaId).order('executar_em', { ascending: false }).limit(20),
    supabase.from('agenda_tarefas').select('id, titulo, data_prazo, status')
      .eq('wa_conversa_id', conversaId).order('data_prazo', { ascending: false }).limit(20),
    supabase.from('agenda_eventos').select('id, titulo, data_hora_inicio, status')
      .eq('wa_conversa_id', conversaId).order('data_hora_inicio', { ascending: false }).limit(20),
  ])
  const itens: ItemAgendaConversa[] = [
    ...(f.data || []).map((x: any) => ({
      id: x.id, tipo: 'followup' as const,
      titulo: x.modo === 'texto_exato' ? `Follow-up: "${x.mensagem}"` : `Follow-up (Bianca escreve): ${x.mensagem}`,
      quando: x.executar_em, status: x.status,
      detalhe: x.texto_enviado ? `Enviado: "${x.texto_enviado}"` : x.motivo,
    })),
    ...(t.data || []).map((x: any) => ({
      id: x.id, tipo: 'tarefa' as const, titulo: x.titulo, quando: x.data_prazo, status: x.status, detalhe: null,
    })),
    ...(e.data || []).map((x: any) => ({
      id: x.id, tipo: 'evento' as const, titulo: x.titulo, quando: x.data_hora_inicio, status: x.status, detalhe: null,
    })),
  ].sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')))
  return { itens }
}

export async function agendarNaConversaAction(input: {
  conversa_id: string
  tipo: 'followup' | 'tarefa' | 'evento'
  quando: string                 // ISO (followup/evento) ou YYYY-MM-DD (tarefa)
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
  tipo_evento?: 'ligacao' | 'reuniao' | 'visita_tecnica'
  local?: string
}): Promise<{ sucesso: true } | { erro: string }> {
  const { erro, supabase, user, conv } = await conversaAcessivel(input.conversa_id)
  if (erro || !user || !conv) return { erro: erro || 'Sem acesso' }
  const contato = conv.contato || {}
  const nomeCliente = contato.nome_exibicao || contato.telefone || 'cliente'
  const projetoId = contato.projeto_id || null
  const rodape = `\n\n— criado a partir da conversa do WhatsApp com ${nomeCliente}`

  if (input.tipo === 'followup') {
    const quando = new Date(input.quando)
    if (isNaN(quando.getTime())) return { erro: 'Data/hora inválida' }
    if (quando.getTime() < Date.now() - 60_000) return { erro: 'Escolha uma data/hora no futuro' }
    const mensagem = String(input.mensagem || '').trim()
    if (!mensagem) return { erro: input.modo === 'texto_exato' ? 'Escreva a mensagem' : 'Diga o objetivo do follow-up pra Bianca' }
    const { error } = await supabase.from('wa_followups').insert({
      conversa_id: conv.id,
      projeto_id: projetoId,
      responsavel_id: user.id,
      executar_em: quando.toISOString(),
      modo: input.modo === 'texto_exato' ? 'texto_exato' : 'bianca_escreve',
      mensagem,
      cancelar_se_responder: input.cancelar_se_responder !== false,
    })
    if (error) return { erro: error.message.includes('wa_followups') ? 'Falta rodar a migration 123 no Supabase.' : error.message }
  }

  if (input.tipo === 'tarefa') {
    const titulo = String(input.titulo || '').trim()
    if (!titulo) return { erro: 'Dê um título pra tarefa' }
    const { error } = await supabase.from('agenda_tarefas').insert({
      titulo,
      descricao: `${String(input.descricao || '').trim()}${rodape}`.trim(),
      data_prazo: input.quando ? input.quando.slice(0, 10) : null,
      prioridade: input.prioridade || 'media',
      usuario_id: user.id,
      projeto_id: projetoId,
      wa_conversa_id: conv.id,
      criado_por_usuario_id: user.id,
    })
    if (error) return { erro: error.message }
  }

  if (input.tipo === 'evento') {
    const titulo = String(input.titulo || '').trim()
    if (!titulo) return { erro: 'Dê um título pro evento' }
    const inicio = new Date(input.quando)
    if (isNaN(inicio.getTime())) return { erro: 'Data/hora inválida' }
    const fim = new Date(inicio.getTime() + (Number(input.duracao_min) || 60) * 60_000)
    const { error } = await supabase.from('agenda_eventos').insert({
      titulo,
      descricao: `${String(input.descricao || '').trim()}${rodape}`.trim(),
      data_hora_inicio: inicio.toISOString(),
      data_hora_fim: fim.toISOString(),
      tipo: input.tipo_evento || 'ligacao',
      local: input.local?.trim() || null,
      usuario_id: user.id,
      projeto_id: projetoId,
      cliente_nome: projetoId ? null : nomeCliente,
      lembrete_min_antes: 30,
      wa_conversa_id: conv.id,
      criado_por_usuario_id: user.id,
    })
    if (error) return { erro: error.message }
  }

  revalidatePath('/agenda')
  return { sucesso: true }
}

export async function cancelarFollowupAction(id: string): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { error } = await supabase
    .from('wa_followups')
    .update({ status: 'cancelado', motivo: 'Cancelado pelo usuário', executado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'agendado')
  if (error) return { erro: error.message }
  return { sucesso: true }
}
