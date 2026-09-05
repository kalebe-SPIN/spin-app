'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ModoVisualizacao } from './index'

const COOKIE_NAME = 'modo_visualizacao'

/**
 * Define o modo de visualização diretamente (sem rotação).
 * Só admin pode alternar. Modo inválido é ignorado.
 */
export async function definirModoAction(novo: ModoVisualizacao) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') return

  // Valida entrada — evita cookie com valor inesperado
  const modosValidos: ModoVisualizacao[] = ['admin', 'consultor', 'representante', 'profissional_campo']
  if (!modosValidos.includes(novo)) return

  cookies().set(COOKIE_NAME, novo, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    sameSite: 'lax',
  })

  // Se saiu do admin, volta pra rota segura pro modo escolhido
  if (novo === 'consultor') redirect('/projetos')
  if (novo === 'representante') redirect('/')
  if (novo === 'profissional_campo') redirect('/agenda')

  revalidatePath('/', 'layout')
}

/**
 * @deprecated use definirModoAction(modo) para seleção direta.
 * Mantida temporariamente pra não quebrar callers antigos — remove em migração seguinte.
 */
export async function alternarModoAction() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') return

  const atual = cookies().get(COOKIE_NAME)?.value
  const proximo: Record<string, ModoVisualizacao> = {
    admin: 'consultor',
    consultor: 'representante',
    representante: 'profissional_campo',
    profissional_campo: 'admin',
  }
  const chaveAtual =
    atual === 'consultor' || atual === 'representante' || atual === 'profissional_campo'
      ? atual : 'admin'
  const novo: ModoVisualizacao = proximo[chaveAtual]

  cookies().set(COOKIE_NAME, novo, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })

  if (novo === 'consultor') redirect('/projetos')
  if (novo === 'representante') redirect('/')
  if (novo === 'profissional_campo') redirect('/agenda')

  revalidatePath('/', 'layout')
}
