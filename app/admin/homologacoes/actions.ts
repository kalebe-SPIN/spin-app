'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const ETAPAS_HOMOLOGACAO = [
  { ordem: 1, chave: 'diagrama_unifilar',    nome_exibicao: 'Diagrama Unifilar' },
  { ordem: 2, chave: 'layout_instalacao',    nome_exibicao: 'Layout de Instalação' },
  { ordem: 3, chave: 'memorial_descritivo',  nome_exibicao: 'Memorial Descritivo' },
  { ordem: 4, chave: 'lista_kit',            nome_exibicao: 'Lista de Compras — Kit' },
  { ordem: 5, chave: 'lista_ca',             nome_exibicao: 'Lista de Compras — Materiais CA' },
  { ordem: 6, chave: 'aprovacao_celesc',     nome_exibicao: 'Aprovação CELESC' },
]

export async function iniciarHomologacaoAction(projetoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const { data: existente } = await supabase
    .from('homologacoes')
    .select('id')
    .eq('projeto_id', projetoId)
    .maybeSingle()

  if (existente) {
    redirect(`/admin/homologacoes/${existente.id}`)
  }

  const { data: nova, error } = await supabase
    .from('homologacoes')
    .insert({
      projeto_id: projetoId,
      status_geral: 'iniciado',
      etapa_atual: 1,
    })
    .select('id')
    .single()

  if (error || !nova) return { sucesso: false, erro: error?.message || 'Erro ao criar' }

  // Cria as 6 etapas
  await supabase.from('homologacao_etapas').insert(
    ETAPAS_HOMOLOGACAO.map(e => ({
      homologacao_id: nova.id,
      ordem: e.ordem,
      chave: e.chave,
      nome_exibicao: e.nome_exibicao,
      status: 'pendente',
    }))
  )

  revalidatePath('/admin/homologacoes')
  redirect(`/admin/homologacoes/${nova.id}`)
}

export async function atualizarEtapaAction(etapaId: string, patch: {
  status?: string
  observacoes?: string | null
  responsavel_id?: string | null
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const update: any = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'em_andamento') update.iniciado_em = new Date().toISOString()
  if (patch.status === 'concluido') update.concluido_em = new Date().toISOString()

  const { error, data } = await supabase
    .from('homologacao_etapas')
    .update(update)
    .eq('id', etapaId)
    .select('homologacao_id')
    .single()

  if (error) return { sucesso: false, erro: error.message }

  // Recalcula etapa_atual da homologação (primeira em_andamento OU pendente)
  if (data?.homologacao_id) {
    const { data: etapas } = await supabase
      .from('homologacao_etapas')
      .select('ordem, status')
      .eq('homologacao_id', data.homologacao_id)
      .order('ordem')

    if (etapas) {
      const proximaAtiva = etapas.find(e => e.status !== 'concluido')
      const etapaAtualNum = proximaAtiva?.ordem || 6
      const todasConcluidas = etapas.every(e => e.status === 'concluido')

      await supabase
        .from('homologacoes')
        .update({
          etapa_atual: etapaAtualNum,
          status_geral: todasConcluidas ? 'aprovada' : 'em_andamento',
        })
        .eq('id', data.homologacao_id)
    }

    revalidatePath(`/admin/homologacoes/${data.homologacao_id}`)
  }
  return { sucesso: true }
}
