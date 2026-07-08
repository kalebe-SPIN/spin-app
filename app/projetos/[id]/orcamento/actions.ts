'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function salvarOrcamentoAction(projetoId: string, proposta: any, urlPdf?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const patch: any = {
    orcamento_final: proposta,
    status: 'orcamento_gerado',
  }
  if (urlPdf) patch.url_pdf_proposta = urlPdf

  const { error } = await supabase
    .from('projetos')
    .update(patch)
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

export async function marcarPropostaEnviadaAction(projetoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const { error } = await supabase
    .from('projetos')
    .update({ status: 'proposta_enviada' })
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
