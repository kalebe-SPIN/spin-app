'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ItemKit } from '@/lib/kit-auto/montar-kit'

export async function salvarListaCaAction(projetoId: string, itens: ItemKit[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const { error } = await supabase
    .from('projetos')
    .update({
      lista_ca_confirmada: itens,
      status: 'lista_ca_confirmada',
    })
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}
