'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' as const }
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const }
  return { supabase }
}

export async function atualizarFaixaAction(
  id: string,
  patch: { faixa_min?: number; faixa_max?: number | null; valor?: number; descricao?: string; ativo?: boolean },
) {
  const guard = await assertAdmin()
  if ('erro' in guard) return guard
  const { error } = await guard.supabase
    .from('faixas_precificacao_servicos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/faixas')
  return { sucesso: true }
}

export async function criarFaixaAction(data: {
  chave_servico: string
  unidade: string
  faixa_min: number
  faixa_max: number | null
  valor: number
  descricao?: string
  ordem: number
}) {
  const guard = await assertAdmin()
  if ('erro' in guard) return guard
  const { error } = await guard.supabase
    .from('faixas_precificacao_servicos')
    .insert({ ...data, ativo: true })
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/faixas')
  return { sucesso: true }
}

export async function removerFaixaAction(id: string) {
  const guard = await assertAdmin()
  if ('erro' in guard) return guard
  const { error } = await guard.supabase
    .from('faixas_precificacao_servicos')
    .delete()
    .eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/faixas')
  return { sucesso: true }
}
