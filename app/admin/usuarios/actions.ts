'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TODOS_SETORES, setoresPadraoDoRole } from '@/lib/grupos/setores'

export type Role = 'admin' | 'representante' | 'instalador' | 'colaborador' | 'profissional_campo'

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
 * Gera senha temporária forte, legível (sem confundíveis como 0/O, 1/l/I).
 * Formato: 3 blocos de 3 chars separados por hífen — ex: "aB3-9k7-Qw4"
 * Fácil de ditar/copiar/colar no WhatsApp, difícil de brute-forçar.
 */
function gerarSenhaTemporaria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' // sem 0/O/1/l/I
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, b => alfabeto[b % alfabeto.length])
  return `${chars.slice(0, 3).join('')}-${chars.slice(3, 6).join('')}-${chars.slice(6, 9).join('')}`
}

/**
 * Convida novo usuário criando conta COM SENHA TEMPORÁRIA já definida.
 * Sem link mágico → sem problema de preview do WhatsApp gastar token.
 *
 * Fluxo:
 * 1. Gera senha temp forte
 * 2. Cria auth.user com email_confirm=true + senha já setada
 * 3. Marca user_metadata.must_change_password=true (login redireciona pra /trocar-senha)
 * 4. Trigger handle_new_user já criou profile — atualiza role/nome/telefone
 * 5. Retorna email + senha temp pro admin copiar e mandar via WhatsApp
 */
export async function convidarUsuarioAction(input: {
  email: string
  nome_completo: string
  role: Role
  telefone?: string
  setores?: string[]               // chaves dos grupos internos (Kalebe 2026-09-29)
}): Promise<
  { sucesso: true; user_id: string; email: string; senha_temp: string } | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const email = input.email.trim().toLowerCase()
  const nome = input.nome_completo.trim()
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return { erro: 'Email inválido' }
  if (nome.length < 3) return { erro: 'Nome completo é obrigatório (mín 3 caracteres)' }

  const admin = createAdminClient()
  const senhaTemp = gerarSenhaTemporaria()

  // 1. Cria usuário com senha já setada + email já confirmado (não precisa clicar em nada)
  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email,
    password: senhaTemp,
    email_confirm: true,
    user_metadata: {
      nome_completo: nome,
      role: input.role,
      must_change_password: true, // primeiro login redireciona pra trocar senha
    },
  })

  if (erroCriar || !criado?.user) {
    // Se email já existe, mensagem específica
    if (erroCriar?.message?.includes('already') || erroCriar?.message?.includes('registered')) {
      return { erro: `Email ${email} já está cadastrado. Use "Novo link" no card do usuário existente pra gerar reset.` }
    }
    return { erro: `Erro ao criar usuário: ${erroCriar?.message || 'sem detalhes'}` }
  }

  // 2. Atualiza role + nome + telefone no profile (trigger handle_new_user criou o registro)
  const { error: erroUpdate } = await admin
    .from('profiles')
    .update({
      nome_completo: nome,
      role: input.role,
      telefone: input.telefone?.trim() || null,
      ativo: true,
    })
    .eq('id', criado.user.id)

  if (erroUpdate) {
    return { erro: `Usuário criado mas erro ao atualizar perfil: ${erroUpdate.message}` }
  }

  // 3. Entra nos grupos dos setores escolhidos (Kalebe 2026-09-29)
  const setores = input.role === 'admin' ? TODOS_SETORES : (input.setores ?? setoresPadraoDoRole(input.role))
  const erroSetores = await sincronizarSetores(criado.user.id, setores, true)
  if (erroSetores) {
    return { erro: `Usuário criado, mas não entrou nos grupos: ${erroSetores}. Ajuste os setores no card dele.` }
  }

  revalidatePath('/admin/usuarios')
  return { sucesso: true, user_id: criado.user.id, email, senha_temp: senhaTemp }
}

/**
 * Deixa o usuário exatamente nos grupos dos setores informados.
 * Usuário desativado fica com as linhas BLOQUEADAS (histórico preservado).
 * Retorna mensagem de erro ou null.
 */
async function sincronizarSetores(userId: string, chaves: string[], ativo: boolean): Promise<string | null> {
  const admin = createAdminClient()
  const { data: grupos, error } = await admin.from('grupos_internos').select('id, chave')
  if (error) return error.message.includes('grupos_internos') ? 'falta rodar a migration 125' : error.message
  const querIds = (grupos || []).filter((g: any) => chaves.includes(g.chave)).map((g: any) => g.id)

  let remover = admin.from('grupos_membros').delete().eq('usuario_id', userId)
  if (querIds.length) remover = remover.not('grupo_id', 'in', `(${querIds.join(',')})`)
  const { error: e1 } = await remover
  if (e1) return e1.message
  if (!querIds.length) return null

  const { error: e2 } = await admin.from('grupos_membros').upsert(
    querIds.map((id: string) => ({
      grupo_id: id,
      usuario_id: userId,
      bloqueado_em: ativo ? null : new Date().toISOString(),
    })),
    { onConflict: 'grupo_id,usuario_id' },
  )
  if (e2) return e2.message.includes('bloqueado_em') ? 'falta rodar a migration 126' : e2.message
  return null
}

/** Admin define os setores (grupos internos) de um usuário já cadastrado. */
export async function definirSetoresAction(userId: string, setores: string[]): Promise<
  { sucesso: true } | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }
  const admin = createAdminClient()
  const { data: alvo } = await admin.from('profiles').select('role, ativo').eq('id', userId).maybeSingle()
  if (!alvo) return { erro: 'Usuário não encontrado' }
  // Admin participa de todos os grupos, sempre
  const chaves = alvo.role === 'admin' ? TODOS_SETORES : setores
  const erro = await sincronizarSetores(userId, chaves, !!alvo.ativo)
  if (erro) return { erro }
  revalidatePath('/admin/usuarios')
  revalidatePath('/grupos')
  return { sucesso: true }
}

/**
 * Kalebe 2026-10-01: setor que aparece nas mensagens do WhatsApp ("Luciane ·
 * Financeiro"). null = automático (setor único) / só o primeiro nome.
 */
export async function definirSetorMensagensAction(userId: string, chave: string | null): Promise<
  { sucesso: true } | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }
  const { error } = await createAdminClient()
    .from('profiles')
    .update({ setor_mensagens: chave || null })
    .eq('id', userId)
  if (error) {
    return { erro: /setor_mensagens/.test(error.message) ? 'Falta rodar a migration 134 no Supabase.' : error.message }
  }
  revalidatePath('/admin/usuarios')
  return { sucesso: true }
}

/**
 * Reseta senha do usuário — gera NOVA senha temporária + força troca no próximo login.
 * Usado quando:
 *   - Usuário esqueceu senha (sem depender de link mágico que expira)
 *   - Reenvio de convite pra quem nunca acessou (sobrescreve a senha original)
 * Devolve email + senha_temp pro admin enviar via WhatsApp.
 */
export async function reenviarConviteAction(userId: string): Promise<
  { sucesso: true; email: string; senha_temp: string } | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()
  const { data: userData } = await admin.auth.admin.getUserById(userId)
  if (!userData?.user?.email) return { erro: 'Usuário sem email cadastrado' }

  const senhaTemp = gerarSenhaTemporaria()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: senhaTemp,
    user_metadata: {
      ...userData.user.user_metadata,
      must_change_password: true,
    },
  })
  if (error) return { erro: `Erro ao resetar senha: ${error.message}` }

  return { sucesso: true, email: userData.user.email, senha_temp: senhaTemp }
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

  // O gatilho da migration 126 bloqueia (ou desbloqueia) nos grupos na mesma
  // transação. Contato individual no WhatsApp/inbox não é tocado.
  const { error } = await admin.from('profiles').update({ ativo }).eq('id', userId)
  if (error) return { erro: error.message }

  revalidatePath('/admin/usuarios')
  revalidatePath('/grupos')
  return { sucesso: true }
}

/** Aprova signup público de parceiro (marca ativo=true). */
export async function aprovarParceiroAction(userId: string): Promise<
  { sucesso: true } | { erro: string }
> {
  return toggleAtivoAction(userId, true)
}
