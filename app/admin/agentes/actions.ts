'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * CRUD dos agentes IA do canal WhatsApp Spin (só admin).
 * Ver migration 109 + [[project_fluxo_lead_whatsapp_spin]].
 */
async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const, user: null }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const, user: null }
  return { erro: null, user }
}

export type EntradaAgente = {
  chave: string
  nome: string
  foto_url?: string | null
  descricao_interna?: string | null
  system_prompt: string
  modelo?: string
  max_tokens?: number
  temperatura?: number | null
  condicao_ativacao: 'primeira_msg_lead' | 'apos_qualificacao' | 'pos_venda' | 'manual' | 'handoff'
  ordem_prioridade?: number
  acao_ao_concluir: 'broadcast_leads' | 'passar_pra_humano' | 'passar_pra_agente' | 'encerrar' | 'nenhuma'
  passar_para_agente_chave?: string | null
  ativo?: boolean
}

export async function criarAgenteAction(
  entrada: EntradaAgente,
): Promise<{ id: string } | { erro: string }> {
  const check = await verificarAdmin()
  if (check.erro) return { erro: check.erro }
  const supabase = createClient()

  if (!entrada.chave?.trim() || !/^[a-z0-9_]+$/.test(entrada.chave)) {
    return { erro: 'Chave deve ser lowercase, números e underscore (ex: qualificacao_pv).' }
  }
  if (!entrada.nome?.trim()) return { erro: 'Nome obrigatório.' }
  if (!entrada.system_prompt?.trim()) return { erro: 'System prompt obrigatório.' }

  const { data, error } = await supabase
    .from('wa_agentes')
    .insert({
      chave: entrada.chave.trim(),
      nome: entrada.nome.trim(),
      foto_url: entrada.foto_url || null,
      descricao_interna: entrada.descricao_interna || null,
      system_prompt: entrada.system_prompt,
      modelo: entrada.modelo || 'claude-haiku-4-5-20251001',
      max_tokens: entrada.max_tokens || 800,
      temperatura: entrada.temperatura ?? null,
      condicao_ativacao: entrada.condicao_ativacao,
      ordem_prioridade: entrada.ordem_prioridade ?? 100,
      acao_ao_concluir: entrada.acao_ao_concluir,
      passar_para_agente_chave: entrada.passar_para_agente_chave || null,
      ativo: entrada.ativo ?? true,
    })
    .select('id')
    .single()

  if (error) return { erro: error.message }
  revalidatePath('/admin/agentes')
  revalidatePath('/admin/whatsapp')
  return { id: data.id }
}

export async function atualizarAgenteAction(
  id: string,
  entrada: Partial<EntradaAgente>,
): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarAdmin()
  if (check.erro) return { erro: check.erro }
  const supabase = createClient()

  const patch: any = {}
  if (entrada.nome !== undefined) patch.nome = entrada.nome
  if (entrada.foto_url !== undefined) patch.foto_url = entrada.foto_url || null
  if (entrada.descricao_interna !== undefined) patch.descricao_interna = entrada.descricao_interna || null
  if (entrada.system_prompt !== undefined) patch.system_prompt = entrada.system_prompt
  if (entrada.modelo !== undefined) patch.modelo = entrada.modelo
  if (entrada.max_tokens !== undefined) patch.max_tokens = entrada.max_tokens
  if (entrada.temperatura !== undefined) patch.temperatura = entrada.temperatura
  if (entrada.condicao_ativacao !== undefined) patch.condicao_ativacao = entrada.condicao_ativacao
  if (entrada.ordem_prioridade !== undefined) patch.ordem_prioridade = entrada.ordem_prioridade
  if (entrada.acao_ao_concluir !== undefined) patch.acao_ao_concluir = entrada.acao_ao_concluir
  if (entrada.passar_para_agente_chave !== undefined) patch.passar_para_agente_chave = entrada.passar_para_agente_chave || null
  if (entrada.ativo !== undefined) patch.ativo = entrada.ativo
  patch.atualizado_em = new Date().toISOString()

  const { error } = await supabase.from('wa_agentes').update(patch).eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/agentes')
  revalidatePath('/admin/whatsapp')
  return { sucesso: true }
}

export async function excluirAgenteAction(id: string): Promise<
  { sucesso: true } | { erro: string }
> {
  const check = await verificarAdmin()
  if (check.erro) return { erro: check.erro }
  const supabase = createClient()
  const { error } = await supabase.from('wa_agentes').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/agentes')
  revalidatePath('/admin/whatsapp')
  return { sucesso: true }
}
