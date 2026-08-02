'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Role = 'admin' | 'representante' | 'instalador' | 'colaborador' | 'vendedor_servicos'

async function verificarAdmin(): Promise<{ ok: true } | { ok: false; erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'admin') return { ok: false, erro: 'Apenas admin pode gerenciar usuários' }
  return { ok: true }
}

/**
 * Convida novo usuário por email. Supabase envia link mágico — usuário clica,
 * define senha, entra. Já cria row em profiles via trigger handle_new_user.
 * Depois do convite, atualiza role escolhido pelo admin.
 */
export async function convidarUsuarioAction(input: {
  email: string
  nome_completo: string
  role: Role
  telefone?: string
}): Promise<{ sucesso: true; user_id: string } | { erro: string }> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const email = input.email.trim().toLowerCase()
  const nome = input.nome_completo.trim()
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return { erro: 'Email inválido' }
  if (nome.length < 3) return { erro: 'Nome completo é obrigatório (mín 3 caracteres)' }

  const admin = createAdminClient()

  // 1. Convida — Supabase gera link mágico e envia por email
  const { data: convite, error: erroConvite } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome_completo: nome, role: input.role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.spinsolar.com.br'}/definir-senha`,
  })

  if (erroConvite || !convite?.user) {
    return { erro: `Erro ao enviar convite: ${erroConvite?.message || 'sem detalhes'}` }
  }

  // 2. Trigger handle_new_user já criou row em profiles com role='colaborador' default.
  //    Atualiza pro role escolhido + telefone.
  const { error: erroUpdate } = await admin
    .from('profiles')
    .update({
      nome_completo: nome,
      role: input.role,
      telefone: input.telefone?.trim() || null,
      ativo: true,
    })
    .eq('id', convite.user.id)

  if (erroUpdate) {
    return { erro: `Convite enviado mas erro ao atualizar perfil: ${erroUpdate.message}` }
  }

  revalidatePath('/admin/usuarios')
  return { sucesso: true, user_id: convite.user.id }
}

/** Reenviar link de convite/definição de senha (se usuário perdeu o email). */
export async function reenviarConviteAction(userId: string): Promise<
  { sucesso: true; link: string } | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()
  const { data: userData } = await admin.auth.admin.getUserById(userId)
  if (!userData?.user?.email) return { erro: 'Usuário sem email cadastrado' }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: userData.user.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.spinsolar.com.br'}/definir-senha`,
    },
  })
  if (error || !data?.properties?.action_link) {
    return { erro: `Erro ao gerar link: ${error?.message || 'sem detalhes'}` }
  }
  return { sucesso: true, link: data.properties.action_link }
}

/** Muda role do usuário. Não permite rebaixar o último admin. */
export async function mudarRoleAction(userId: string, novoRole: Role): Promise<
  { sucesso: true } | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()

  // Guarda contra rebaixar último admin
  if (novoRole !== 'admin') {
    const { data: alvo } = await admin.from('profiles').select('role').eq('id', userId).single()
    if (alvo?.role === 'admin') {
      const { count } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('ativo', true)
      if ((count || 0) <= 1) return { erro: 'Não é possível rebaixar o único admin ativo do sistema' }
    }
  }

  const { error } = await admin.from('profiles').update({ role: novoRole }).eq('id', userId)
  if (error) return { erro: error.message }

  revalidatePath('/admin/usuarios')
  return { sucesso: true }
}

/** Ativa/desativa usuário. profiles.ativo=false bloqueia acesso via middleware. */
export async function toggleAtivoAction(userId: string, ativo: boolean): Promise<
  { sucesso: true } | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()

  // Não permite desativar o último admin ativo
  if (!ativo) {
    const { data: alvo } = await admin.from('profiles').select('role').eq('id', userId).single()
    if (alvo?.role === 'admin') {
      const { count } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('ativo', true)
      if ((count || 0) <= 1) return { erro: 'Não é possível desativar o único admin ativo' }
    }
  }

  const { error } = await admin.from('profiles').update({ ativo }).eq('id', userId)
  if (error) return { erro: error.message }

  revalidatePath('/admin/usuarios')
  return { sucesso: true }
}

/** Aprova signup público de parceiro (marca ativo=true). */
export async function aprovarParceiroAction(userId: string): Promise<
  { sucesso: true } | { erro: string }
> {
  return toggleAtivoAction(userId, true)
}
