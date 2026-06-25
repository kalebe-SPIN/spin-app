'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Server Action — atualiza dados do projeto e revalida cache.
 *
 * Diferença vs UPDATE direto do client:
 *  - Roda no servidor (sem dependência do browser)
 *  - revalidatePath garante invalidação do cache
 *  - redirect server-side força nova render do Server Component
 */
export async function atualizarProjetoAction(
  projetoId: string,
  payload: {
    cliente_razao_social: string
    cliente_cpf_cnpj: string | null
    cliente_email: string | null
    cliente_telefone: string
    cliente_endereco: any
    uc_geradora: string
    ucs_beneficiarias: string[]
    tipo_projeto: string
    motivacao_cliente: string
    observacoes_consultor: string | null
  }
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('projetos')
    .update(payload)
    .eq('id', projetoId)

  if (error) {
    return { sucesso: false, erro: error.message }
  }

  // Invalida cache da página do projeto e da listagem
  revalidatePath(`/projetos/${projetoId}`)
  revalidatePath('/projetos')

  // Server-side redirect — força nova render
  redirect(`/projetos/${projetoId}`)
}
