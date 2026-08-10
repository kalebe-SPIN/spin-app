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

/**
 * Preferências específicas da /agenda: threshold de horas pro widget "dia cheio"
 * e (só pra vendedor_servicos/profissional_campo) a zona que forma o par.
 * Admin edita a zona de outros usuários em /admin/usuarios; aqui é auto-edição.
 */
export async function salvarPreferenciasAgendaAction(patch: {
  limite_horas_agenda: number
  zona?: string | null
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  if (patch.limite_horas_agenda < 2 || patch.limite_horas_agenda > 12) {
    return { erro: 'Limite deve ficar entre 2 e 12 horas' }
  }

  const update: Record<string, unknown> = {
    limite_horas_agenda: patch.limite_horas_agenda,
    updated_at: new Date().toISOString(),
  }
  if (patch.zona !== undefined) update.zona = patch.zona

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
  if (error) return { erro: error.message }

  revalidatePath('/conta')
  revalidatePath('/agenda')
  return { sucesso: true }
}
