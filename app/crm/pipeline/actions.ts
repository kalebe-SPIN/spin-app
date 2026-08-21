'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Exclusão dura de projeto pelo admin.
 * O ON DELETE CASCADE das FKs limpa dependentes (kits, orçamentos, agenda,
 * homologações, propostas etc). Consultor não pode excluir — só admin.
 */
export async function excluirProjetoAction(projetoId: string): Promise<{ ok: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Só admin pode excluir projeto.' }

  const { data: projeto } = await supabase
    .from('projetos').select('id, codigo').eq('id', projetoId).maybeSingle()
  if (!projeto) return { erro: 'Projeto não encontrado.' }

  const { error } = await supabase.from('projetos').delete().eq('id', projetoId)
  if (error) return { erro: `Falha ao excluir: ${error.message}` }

  revalidatePath('/crm/pipeline')
  revalidatePath('/crm')
  return { ok: true }
}
