'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function salvarAnaliseFaturaAction(projetoId: string, analise: any) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const { error } = await supabase
    .from('projetos')
    .update({
      analise_fatura: analise,
      status: 'fatura_analisada',
    })
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
