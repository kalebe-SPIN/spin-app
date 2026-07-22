'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function atualizarGatilhoAction(
  id: string,
  patch: {
    ativo?: boolean
    modo?: 'automatico' | 'sugerido' | 'desligado'
    template_base?: string
    contexto_ia?: string
    refinar_com_ia?: boolean
  },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (perfil?.role !== 'admin') return { erro: 'Somente admin' }

  const { error } = await supabase
    .from('bianca_gatilhos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { erro: error.message }

  revalidatePath('/admin/bianca/gatilhos')
  return { sucesso: true }
}
