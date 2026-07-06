'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ModoVisualizacao } from './index'

const COOKIE_NAME = 'modo_visualizacao'

export async function alternarModoAction() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') return // só admin pode alternar

  const atual = cookies().get(COOKIE_NAME)?.value
  const novo: ModoVisualizacao = atual === 'consultor' ? 'admin' : 'consultor'

  cookies().set(COOKIE_NAME, novo, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    sameSite: 'lax',
  })

  // Se estava em admin e virou consultor, volta pra /projetos (evita ficar em /admin sem ter acesso)
  if (novo === 'consultor') {
    redirect('/projetos')
  }

  revalidatePath('/', 'layout')
}
