'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ClienteFormData = {
  tipo: 'pf' | 'pj'
  razao_social: string
  nome_fantasia?: string | null
  cpf_cnpj?: string | null
  email?: string | null
  telefone?: string | null
  whatsapp?: string | null
  origem?: string | null
  observacoes?: string | null
  endereco?: {
    cep?: string
    rua?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    uf?: string
  }
}

export async function criarClienteAction(data: ClienteFormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  if (!data.razao_social?.trim()) {
    return { erro: 'Razão social/nome é obrigatório' }
  }

  const { data: novo, error } = await supabase
    .from('clientes')
    .insert({
      tipo: data.tipo,
      razao_social: data.razao_social.trim(),
      nome_fantasia: data.nome_fantasia?.trim() || null,
      cpf_cnpj: data.cpf_cnpj?.trim() || null,
      email: data.email?.trim() || null,
      telefone: data.telefone?.trim() || null,
      whatsapp: data.whatsapp?.trim() || null,
      endereco: data.endereco || null,
      origem: data.origem?.trim() || null,
      observacoes: data.observacoes?.trim() || null,
      proprietario_id: user.id,
    })
    .select('id')
    .single()

  if (error) return { erro: error.message }

  revalidatePath('/crm/clientes')
  revalidatePath('/crm')
  redirect(`/crm/clientes/${novo.id}`)
}

export async function atualizarClienteAction(id: string, data: ClienteFormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  if (!data.razao_social?.trim()) {
    return { erro: 'Razão social/nome é obrigatório' }
  }

  const { error } = await supabase
    .from('clientes')
    .update({
      tipo: data.tipo,
      razao_social: data.razao_social.trim(),
      nome_fantasia: data.nome_fantasia?.trim() || null,
      cpf_cnpj: data.cpf_cnpj?.trim() || null,
      email: data.email?.trim() || null,
      telefone: data.telefone?.trim() || null,
      whatsapp: data.whatsapp?.trim() || null,
      endereco: data.endereco || null,
      origem: data.origem?.trim() || null,
      observacoes: data.observacoes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { erro: error.message }

  revalidatePath('/crm/clientes')
  revalidatePath(`/crm/clientes/${id}`)
  return { sucesso: true }
}

export async function desativarClienteAction(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('clientes')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/crm/clientes')
  return { sucesso: true }
}

export async function reativarClienteAction(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('clientes')
    .update({ ativo: true, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/crm/clientes')
  return { sucesso: true }
}

export async function registrarInteracaoAction(
  clienteId: string,
  input: { tipo: string; descricao: string; duracao_min?: number },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { error } = await supabase.from('interacoes_cliente').insert({
    cliente_id: clienteId,
    tipo: input.tipo,
    descricao: input.descricao.trim(),
    duracao_min: input.duracao_min || null,
    usuario_id: user.id,
  })

  if (error) return { erro: error.message }
  revalidatePath(`/crm/clientes/${clienteId}`)
  return { sucesso: true }
}
