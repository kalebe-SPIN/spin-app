'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { dispararGatilho } from '@/lib/bianca/gatilhos'

/**
 * Actions da agenda — status, edição, criação/exclusão, comunicações.
 *
 * As verificações de permissão (dono / par vinculado / admin) ficam com o RLS
 * (mig 064). Se o Supabase retornar erro, propagamos como { erro }. Assim
 * evitamos duplicar a regra em SQL e TS.
 */

export type TipoEvento =
  | 'reuniao' | 'visita_tecnica' | 'instalacao' | 'cliente' | 'ligacao' | 'outro'

// ═══════════════════ CRIAR EVENTO ═══════════════════
export async function criarEventoAction(input: {
  titulo: string
  tipo: TipoEvento
  data_hora_inicio: string
  data_hora_fim?: string | null
  local?: string | null
  dono_usuario_id: string  // pode ser diferente do user.id (par agendando pelo outro)
  projeto_id?: string | null
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: novo, error } = await supabase
    .from('agenda_eventos')
    .insert({
      titulo: input.titulo,
      tipo: input.tipo,
      data_hora_inicio: input.data_hora_inicio,
      data_hora_fim: input.data_hora_fim ?? null,
      local: input.local ?? null,
      usuario_id: input.dono_usuario_id,
      criado_por_usuario_id: user.id,
      projeto_id: input.projeto_id ?? null,
      status: 'agendado',
    })
    .select('id, titulo, data_hora_inicio, usuario_id, criado_por_usuario_id')
    .single()

  if (error) return { erro: error.message }

  // Se o criador é diferente do dono, notifica o dono via Bianca
  if (novo.criado_por_usuario_id && novo.usuario_id !== novo.criado_por_usuario_id) {
    await notificarPar('agenda_agendamento_por_par', {
      dono_id: novo.usuario_id,
      criador_id: novo.criado_por_usuario_id,
      titulo_evento: novo.titulo,
      data_hora_iso: novo.data_hora_inicio,
    })
  }

  revalidatePath('/agenda')
  return { sucesso: true, id: novo.id }
}

// ═══════════════════ EDITAR EVENTO ═══════════════════
export async function editarEventoAction(eventoId: string, patch: {
  titulo?: string
  tipo?: TipoEvento
  data_hora_inicio?: string
  data_hora_fim?: string | null
  local?: string | null
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { error } = await supabase
    .from('agenda_eventos')
    .update(patch)
    .eq('id', eventoId)

  if (error) return { erro: error.message }
  revalidatePath('/agenda')
  return { sucesso: true }
}

// ═══════════════════ EXCLUIR EVENTO ═══════════════════
export async function excluirEventoAction(eventoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { error } = await supabase.from('agenda_eventos').delete().eq('id', eventoId)
  if (error) return { erro: error.message }
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
    .select('id, usuario_id, status, titulo, data_hora_inicio')
    .eq('id', eventoId)
    .single()

  if (!atual) return { erro: 'Evento não encontrado' }
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

  // Gatilho: profissional de campo marcou como realizado → avisa vendedor pareado
  if (novoStatus === 'realizado') {
    const { data: dono } = await supabase
      .from('profiles')
      .select('id, role, zona, nome_completo')
      .eq('id', atual.usuario_id)
      .single()
    if (dono?.role === 'profissional_campo' && dono.zona) {
      const { data: vendedores } = await supabase
        .from('profiles')
        .select('id, nome_completo, telefone')
        .eq('zona', dono.zona)
        .eq('role', 'vendedor_servicos')
      for (const v of vendedores || []) {
        await dispararGatilho('agenda_servico_executado', {
          usuario_id: v.id,
          entidade_tipo: 'projeto',
          entidade_id: null,
          variaveis: {
            criador_nome: dono.nome_completo || 'Profissional de campo',
            titulo_evento: atual.titulo,
            data_hora: formatarDataHora(atual.data_hora_inicio),
            cliente_bloco: '',
          },
        })
      }
    }
  }

  revalidatePath('/agenda')
  return { sucesso: true }
}

// ═══════════════════ CRIAR TAREFA ═══════════════════
export async function criarTarefaAction(input: {
  titulo: string
  descricao?: string | null
  data_prazo?: string | null
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente'
  dono_usuario_id: string
  projeto_id?: string | null
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: nova, error } = await supabase
    .from('agenda_tarefas')
    .insert({
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      data_prazo: input.data_prazo ?? null,
      prioridade: input.prioridade || 'media',
      usuario_id: input.dono_usuario_id,
      criado_por_usuario_id: user.id,
      projeto_id: input.projeto_id ?? null,
      status: 'pendente',
    })
    .select('id, titulo, usuario_id, criado_por_usuario_id, data_prazo')
    .single()

  if (error) return { erro: error.message }

  if (nova.criado_por_usuario_id && nova.usuario_id !== nova.criado_por_usuario_id) {
    await notificarPar('agenda_agendamento_por_par', {
      dono_id: nova.usuario_id,
      criador_id: nova.criado_por_usuario_id,
      titulo_evento: nova.titulo,
      data_hora_iso: nova.data_prazo || new Date().toISOString(),
    })
  }

  revalidatePath('/agenda')
  return { sucesso: true, id: nova.id }
}

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
  if (atual.status === novoStatus) return { sucesso: true, semAlteracao: true }

  const patch: any = { status: novoStatus }
  if (novoStatus === 'concluida') patch.concluida_em = new Date().toISOString()
  else patch.concluida_em = null

  const { error } = await supabase.from('agenda_tarefas').update(patch).eq('id', tarefaId)
  if (error) return { erro: error.message }

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

// ═══════════════════ COMENTÁRIO ═══════════════════
export async function adicionarComentarioAction(input: {
  tarefaId?: string; eventoId?: string; observacao: string
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

export async function marcarComunicacaoEnviadaAction(comunicacaoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { error } = await supabase.from('bianca_comunicacoes')
    .update({ status: 'enviada_manualmente', enviada_em: new Date().toISOString() })
    .eq('id', comunicacaoId).eq('usuario_id', user.id)

  if (error) return { erro: error.message }
  revalidatePath('/agenda')
  return { sucesso: true }
}

// ═══════════════════ Helpers internos ═══════════════════
async function notificarPar(chave: 'agenda_agendamento_por_par' | 'agenda_servico_executado', args: {
  dono_id: string; criador_id: string; titulo_evento: string; data_hora_iso: string
}) {
  const supabase = createClient()
  const { data: criador } = await supabase.from('profiles')
    .select('nome_completo').eq('id', args.criador_id).single()

  await dispararGatilho(chave, {
    usuario_id: args.dono_id,
    entidade_tipo: 'projeto',
    entidade_id: null,
    variaveis: {
      criador_nome: criador?.nome_completo || 'seu par',
      titulo_evento: args.titulo_evento,
      data_hora: formatarDataHora(args.data_hora_iso),
      cliente_bloco: '',
    },
  })
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
