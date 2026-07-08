'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function salvarAnaliseFaturaAction(projetoId: string, analise: any, beneficiarias?: any[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const patch: any = {
    analise_fatura: analise,
    status: 'fatura_analisada',
  }
  if (beneficiarias && beneficiarias.length > 0) {
    patch.beneficiarias = beneficiarias
    // Também salva as UCs beneficiárias como array de strings pra queries mais fáceis
    patch.ucs_beneficiarias = beneficiarias.map(b => b.uc).filter(Boolean)
  } else {
    patch.beneficiarias = []
    patch.ucs_beneficiarias = []
  }
  // Salva UC principal também
  if (analise?.uc) patch.uc_geradora = analise.uc

  const { error } = await supabase
    .from('projetos')
    .update(patch)
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
