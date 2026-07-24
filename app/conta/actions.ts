'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function atualizarPerfilAction(patch: {
  nome_completo?: string
  telefone?: string | null
  avatar_url?: string | null
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { erro: error.message }

  revalidatePath('/conta')
  revalidatePath('/dashboard')
  return { sucesso: true }
}
