'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function salvarUrlPropostaVeAction(projetoId: string, urlPdf: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const { data: proj } = await supabase
    .from('projetos')
    .select('ve_recarga_selecionada')
    .eq('id', projetoId)
    .single()

  const atual = proj?.ve_recarga_selecionada || {}
  const novaSelecao = { ...atual, url_pdf_proposta_ve: urlPdf }

  const { error } = await supabase
    .from('projetos')
    .update({ ve_recarga_selecionada: novaSelecao })
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  revalidatePath(`/projetos/${projetoId}/ve/proposta`)
  return { sucesso: true }
}
