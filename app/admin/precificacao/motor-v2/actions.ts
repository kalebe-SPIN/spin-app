'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function guardaAdmin(): Promise<{ supabase: ReturnType<typeof createClient>; erro: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { supabase, erro: 'Só admin' }
  return { supabase, erro: null }
}

/**
 * Alterna a flag `precificacao_v2` (0 = v1 legado, 1 = v2 novo motor).
 * Escreve em `parametros_precificacao` com valor_numero. Efetivo em tempo real:
 * a próxima chamada de /orcamento já roda o motor selecionado.
 */
export async function toggleMotorV2Action(ativar: boolean): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: ativar ? 1 : 0 })
    .eq('chave', 'precificacao_v2')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}

/**
 * Alterna comissao_modo entre variável real (0) e referência fixa 7% (1).
 */
export async function toggleComissaoModoAction(fixa7: boolean): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: fixa7 ? 1 : 0 })
    .eq('chave', 'comissao_modo')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}

export async function atualizarRbt12Action(valor: number): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  if (!isFinite(valor) || valor < 0) return { erro: 'RBT12 inválido' }
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: valor })
    .eq('chave', 'rbt12_atual')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}

export async function atualizarAnexoAction(anexo: 'III' | 'V'): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  const num = anexo === 'V' ? 5 : 3
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: num })
    .eq('chave', 'simples_anexo_atual')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}
