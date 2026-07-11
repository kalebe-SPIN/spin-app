'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type NovoProjetoInput = {
  // Ou usa cliente existente...
  cliente_id?: string
  // ...ou cria novo:
  novo_cliente?: {
    razao_social: string
    cpf_cnpj?: string | null
    email?: string | null
    telefone?: string | null
    whatsapp?: string | null
    tipo?: 'pf' | 'pj'
  }
  observacoes?: string | null
}

export async function criarProjetoAction(input: NovoProjetoInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  let clienteId = input.cliente_id
  let dadosCliente: {
    razao_social: string
    cpf_cnpj: string | null
    email: string | null
    telefone: string | null
  } | null = null

  // Caminho 1: cliente novo — cria antes
  if (!clienteId && input.novo_cliente) {
    if (!input.novo_cliente.razao_social?.trim()) {
      return { erro: 'Nome/razão social é obrigatório' }
    }

    const { data: cliCriado, error: erroCli } = await supabase
      .from('clientes')
      .insert({
        tipo: input.novo_cliente.tipo || 'pf',
        razao_social: input.novo_cliente.razao_social.trim(),
        cpf_cnpj: input.novo_cliente.cpf_cnpj || null,
        email: input.novo_cliente.email || null,
        telefone: input.novo_cliente.telefone || null,
        whatsapp: input.novo_cliente.whatsapp || input.novo_cliente.telefone || null,
        proprietario_id: user.id,
      })
      .select('id, razao_social, cpf_cnpj, email, telefone')
      .single()

    if (erroCli || !cliCriado) {
      return { erro: 'Erro ao criar cliente: ' + (erroCli?.message || '') }
    }
    clienteId = cliCriado.id
    dadosCliente = {
      razao_social: cliCriado.razao_social,
      cpf_cnpj: cliCriado.cpf_cnpj,
      email: cliCriado.email,
      telefone: cliCriado.telefone,
    }
  }
  // Caminho 2: cliente existente — busca os dados
  else if (clienteId) {
    const { data: cliBusca } = await supabase
      .from('clientes')
      .select('razao_social, cpf_cnpj, email, telefone')
      .eq('id', clienteId)
      .single()
    if (!cliBusca) return { erro: 'Cliente não encontrado' }
    dadosCliente = cliBusca as any
  } else {
    return { erro: 'É preciso escolher ou cadastrar um cliente' }
  }

  const { data: novoProjeto, error } = await supabase
    .from('projetos')
    .insert({
      consultor_id: user.id,
      cliente_id: clienteId,
      // Denormalização — mantém pra compat com código existente
      cliente_razao_social: dadosCliente!.razao_social,
      cliente_cpf_cnpj: dadosCliente!.cpf_cnpj,
      cliente_email: dadosCliente!.email,
      cliente_telefone: dadosCliente!.telefone,
      observacoes_consultor: input.observacoes || null,
      status: 'rascunho',
    })
    .select('id')
    .single()

  if (error || !novoProjeto) {
    return { erro: 'Erro ao criar projeto: ' + (error?.message || '') }
  }

  revalidatePath('/projetos')
  revalidatePath('/crm/clientes')
  if (clienteId) revalidatePath(`/crm/clientes/${clienteId}`)
  redirect(`/projetos/${novoProjeto.id}`)
}
