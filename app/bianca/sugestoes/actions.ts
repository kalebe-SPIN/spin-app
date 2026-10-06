'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function descartarSugestaoAction(comunicacaoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { error } = await supabase
    .from('bianca_comunicacoes')
    .update({ status: 'descartada' })
    .eq('id', comunicacaoId)
    .eq('usuario_id', user.id)

  if (error) return { erro: error.message }

  revalidatePath('/bianca/sugestoes')
  revalidatePath('/agenda')
  return { sucesso: true }
}

/** Kalebe 2026-10-06: descartar todas as sugestões pendentes de uma vez. */
export async function descartarTodasSugestoesAction() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { error } = await supabase
    .from('bianca_comunicacoes')
    .update({ status: 'descartada' })
    .eq('usuario_id', user.id)
    .eq('status', 'sugerida')

  if (error) return { erro: error.message }
  revalidatePath('/bianca/sugestoes')
  return { sucesso: true }
}

export async function marcarSugestaoEnviadaAction(comunicacaoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { error } = await supabase
    .from('bianca_comunicacoes')
    .update({
      status: 'enviada_manualmente',
      enviada_em: new Date().toISOString(),
    })
    .eq('id', comunicacaoId)
    .eq('usuario_id', user.id)

  if (error) return { erro: error.message }

  revalidatePath('/bianca/sugestoes')
  return { sucesso: true }
}
