'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function salvarParametrosServicoAction(chave: string, parametros: any) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (perfil?.role !== 'admin') return { erro: 'Somente admin pode editar' }

  const { error } = await supabase
    .from('parametros_precificacao_servicos')
    .update({
      parametros,
      atualizado_por: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('chave', chave)

  if (error) return { erro: error.message }

  revalidatePath('/admin/precificacao/servicos')
  return { sucesso: true }
}
