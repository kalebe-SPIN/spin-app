'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function mudarEtapaProjetoAction(
  projetoId: string,
  novoStatus: string,
  observacoes?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { data: projeto } = await supabase
    .from('projetos')
    .select('id, status, cliente_id, consultor_id, cliente_razao_social')
    .eq('id', projetoId)
    .single()

  if (!projeto) return { erro: 'Projeto não encontrado' }

  const statusAnterior = projeto.status

  // Update projeto
  const { error: erroUpd } = await supabase
    .from('projetos')
    .update({
      status: novoStatus,
      status_atualizado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projetoId)

  if (erroUpd) return { erro: erroUpd.message }

  // Log no histórico
  await supabase.from('projeto_status_historico').insert({
    projeto_id: projetoId,
    status_anterior: statusAnterior,
    status_novo: novoStatus,
    usuario_id: user.id,
    observacoes: observacoes || null,
  })

  // AUTOMAÇÕES por transição
  await disparoAutomacoes(supabase, {
    projeto,
    statusAnterior,
    novoStatus,
    userId: user.id,
  })

  revalidatePath(`/projetos/${projetoId}`)
  revalidatePath('/projetos')
  revalidatePath('/crm/pipeline')
  if (projeto.cliente_id) revalidatePath(`/crm/clientes/${projeto.cliente_id}`)

  return { sucesso: true, statusAnterior, novoStatus }
}

async function disparoAutomacoes(
  supabase: any,
  ctx: { projeto: any; statusAnterior: string; novoStatus: string; userId: string },
) {
  const { projeto, novoStatus, userId } = ctx
  const cliente = projeto.cliente_razao_social || 'cliente'

  // Follow-up quando envia proposta
  if (novoStatus === 'proposta_enviada' || novoStatus === 'negociando') {
    const daqui3Dias = new Date()
    daqui3Dias.setDate(daqui3Dias.getDate() + 3)
    await supabase.from('agenda_tarefas').insert({
      usuario_id: projeto.consultor_id || userId,
      titulo: `Follow-up ${cliente}`,
      descricao: `Ligar/mandar mensagem pro ${cliente} sobre a proposta enviada.`,
      data_prazo: daqui3Dias.toISOString().slice(0, 10),
      prioridade: 'alta',
      projeto_id: projeto.id,
      criada_por_bianca: true,
    })
  }

  // Vendido → cria tarefas de contrato + boas-vindas
  if (novoStatus === 'vendido' || novoStatus === 'aceito') {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    await supabase.from('agenda_tarefas').insert([
      {
        usuario_id: projeto.consultor_id || userId,
        titulo: `Contrato ${cliente}`,
        descricao: 'Emitir contrato de compra e venda + procuração. Coletar assinaturas.',
        data_prazo: amanha.toISOString().slice(0, 10),
        prioridade: 'urgente',
        projeto_id: projeto.id,
      },
      {
        usuario_id: projeto.consultor_id || userId,
        titulo: `Iniciar homologação ${cliente}`,
        descricao: 'Diagrama unifilar + layout + memorial descritivo. Enviar pra CELESC.',
        data_prazo: amanha.toISOString().slice(0, 10),
        prioridade: 'alta',
        projeto_id: projeto.id,
      },
    ])
  }
}
