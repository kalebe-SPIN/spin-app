'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { StatusExecucao } from '@/lib/execucoes'

export async function mudarStatusExecucaoAction(
  execucaoId: string,
  novoStatus: StatusExecucao,
  observacoes?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { data: execAtual } = await supabase
    .from('execucoes_servicos')
    .select('id, status, projeto_id')
    .eq('id', execucaoId)
    .maybeSingle()

  if (!execAtual) return { erro: 'Execucao nao encontrada' }

  const statusAnterior = execAtual.status
  const patch: any = { status: novoStatus, updated_at: new Date().toISOString() }

  // Preenche timestamps automaticos conforme transicao
  if (novoStatus === 'em_execucao' && statusAnterior !== 'em_execucao') {
    patch.data_inicio_real = new Date().toISOString()
  }
  if (novoStatus === 'concluido') {
    patch.data_conclusao = new Date().toISOString()
  }
  if (novoStatus === 'entregue') {
    patch.data_entrega = new Date().toISOString()
    patch.cliente_aceitou = true
  }

  const { error: updErr } = await supabase
    .from('execucoes_servicos')
    .update(patch)
    .eq('id', execucaoId)

  if (updErr) return { erro: updErr.message }

  // Log historico
  await supabase.from('execucoes_status_historico').insert({
    execucao_id: execucaoId,
    status_anterior: statusAnterior,
    status_novo: novoStatus,
    observacoes: observacoes || null,
    usuario_id: user.id,
  })

  revalidatePath('/execucoes')
  revalidatePath(`/execucoes/${execucaoId}`)
  revalidatePath(`/projetos/${execAtual.projeto_id}`)
  return { sucesso: true }
}

export async function atualizarExecucaoAction(
  execucaoId: string,
  patch: {
    data_agendada?: string | null
    hora_agendada?: string | null
    duracao_estimada_dias?: number | null
    endereco_execucao?: string | null
    responsavel_tecnico?: string | null
    materiais_separados?: boolean
    observacoes?: string
  },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { error } = await supabase
    .from('execucoes_servicos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', execucaoId)

  if (error) return { erro: error.message }

  revalidatePath('/execucoes')
  revalidatePath(`/execucoes/${execucaoId}`)
  return { sucesso: true }
}
