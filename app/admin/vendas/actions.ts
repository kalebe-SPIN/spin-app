'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Vendas manuais — CRUD do admin.
 * Kalebe 2026-09-11: 'quero que o admin possa cadastrar e descadastrar
 * vendas e isso ser consolidado automaticamente no painel'.
 * Ver migration 107.
 */

async function verificarAdmin(): Promise<{ user: any } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' }
  return { user }
}

export type EntradaVendaManual = {
  cliente_nome: string
  cliente_documento?: string
  categoria: 'fv' | 'servico'
  tipo_detalhado?: string
  valor_venda: number
  custo_estimado?: number
  data_venda: string   // ISO date (yyyy-mm-dd)
  vendedor_id?: string
  observacao?: string
}

export async function cadastrarVendaManualAction(
  entrada: EntradaVendaManual,
): Promise<{ id: string } | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  // Validações mínimas
  if (!entrada.cliente_nome?.trim()) return { erro: 'Informe o nome do cliente.' }
  if (!(entrada.valor_venda > 0)) return { erro: 'Informe um valor de venda maior que zero.' }
  if (entrada.categoria !== 'fv' && entrada.categoria !== 'servico') {
    return { erro: 'Categoria inválida.' }
  }
  const custo = Number(entrada.custo_estimado || 0)
  if (custo < 0) return { erro: 'Custo estimado não pode ser negativo.' }
  if (custo > entrada.valor_venda) return { erro: 'Custo maior que o valor da venda.' }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('vendas_manuais')
    .insert({
      cliente_nome: entrada.cliente_nome.trim(),
      cliente_documento: entrada.cliente_documento?.trim() || null,
      categoria: entrada.categoria,
      tipo_detalhado: entrada.tipo_detalhado || null,
      valor_venda: entrada.valor_venda,
      custo_estimado: custo,
      data_venda: entrada.data_venda,
      vendedor_id: entrada.vendedor_id || null,
      observacao: entrada.observacao?.trim() || null,
      criada_por: check.user.id,
    })
    .select('id')
    .single()

  if (error) return { erro: error.message }

  revalidatePath('/admin/vendas')
  revalidatePath('/dashboard')
  return { id: data.id }
}

export async function descadastrarVendaManualAction(
  id: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase
    .from('vendas_manuais')
    .update({
      deletada_em: new Date().toISOString(),
      deletada_por: check.user.id,
    })
    .eq('id', id)
    .is('deletada_em', null)

  if (error) return { erro: error.message }

  revalidatePath('/admin/vendas')
  revalidatePath('/dashboard')
  return { sucesso: true }
}

export async function restaurarVendaManualAction(
  id: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase
    .from('vendas_manuais')
    .update({ deletada_em: null, deletada_por: null })
    .eq('id', id)

  if (error) return { erro: error.message }

  revalidatePath('/admin/vendas')
  revalidatePath('/dashboard')
  return { sucesso: true }
}
