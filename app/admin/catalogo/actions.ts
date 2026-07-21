'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Toggle produtos.ativo — controla se o produto aparece nos kits/simulador.
 * Um produto inativo continua no catalogo (histórico) mas nao eh sugerido em novas propostas.
 */
export async function togglarAtivoProdutoAction(produtoId: string, novoStatus: boolean) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (perfil?.role !== 'admin') return { erro: 'So admin pode editar catalogo' }

  const { error } = await supabase
    .from('produtos')
    .update({ ativo: novoStatus, updated_at: new Date().toISOString() })
    .eq('id', produtoId)

  if (error) return { erro: error.message }

  revalidatePath('/admin/catalogo')
  return { sucesso: true, ativo: novoStatus }
}
