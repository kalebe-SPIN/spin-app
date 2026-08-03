'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verificarAdmin(): Promise<{ ok: true; userId: string } | { ok: false; erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { ok: false, erro: 'Apenas admin pode gerar convites' }
  return { ok: true, userId: user.id }
}

/** Senha forte e curta o suficiente pra digitar/enviar (ex: spin-a1b2-c3d4). */
function gerarSenha(): string {
  const hex = randomBytes(4).toString('hex') // 8 chars
  return `spin-${hex.slice(0, 4)}-${hex.slice(4, 8)}`
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.spinsolar.com.br'

/**
 * Cria o candidato (login+senha) e o convite de trabalho.
 * Retorna as credenciais UMA VEZ pro admin copiar e enviar.
 */
export async function criarConviteAction(input: {
  nome: string
  email: string
  telefone?: string
  zona?: string
  cargo?: string
}): Promise<
  | { sucesso: true; email: string; senha: string; link: string }
  | { erro: string }
> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const nome = input.nome.trim()
  const email = input.email.trim().toLowerCase()
  if (nome.length < 3) return { erro: 'Informe o nome completo do candidato.' }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return { erro: 'Email inválido.' }

  const admin = createAdminClient()
  const senha = gerarSenha()

  // 1. Cria usuário já confirmado (sem link mágico — vamos entregar login+senha)
  const { data: novo, error: erroUser } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome_completo: nome, role: 'candidato' },
  })
  if (erroUser || !novo?.user) {
    const msg = erroUser?.message?.toLowerCase().includes('already')
      ? 'Já existe um usuário com esse email.'
      : erroUser?.message || 'Erro ao criar acesso.'
    return { erro: msg }
  }

  const userId = novo.user.id

  // 2. Ajusta o profile (trigger criou com role default)
  await admin
    .from('profiles')
    .update({ nome_completo: nome, role: 'candidato', telefone: input.telefone?.trim() || null, ativo: true })
    .eq('id', userId)

  // 3. Cria o convite de trabalho
  const { error: erroConvite } = await admin.from('convites_trabalho').insert({
    user_id: userId,
    nome_candidato: nome,
    email_candidato: email,
    telefone: input.telefone?.trim() || null,
    zona: input.zona?.trim() || null,
    cargo: input.cargo?.trim() || undefined,
    created_by: check.userId,
  })
  if (erroConvite) {
    // rollback do usuário pra não deixar órfão
    await admin.auth.admin.deleteUser(userId)
    return { erro: `Erro ao criar convite: ${erroConvite.message}` }
  }

  revalidatePath('/admin/vagas')
  return { sucesso: true, email, senha, link: `${BASE_URL}/vaga/login` }
}

/** Libera novamente o acesso do candidato (zera as 2 entradas). */
export async function liberarAcessoAction(conviteId: string): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()
  const { error } = await admin
    .from('convites_trabalho')
    .update({ entradas_usadas: 0, bloqueado: false })
    .eq('id', conviteId)
  if (error) return { erro: error.message }

  revalidatePath('/admin/vagas')
  return { sucesso: true }
}

/** Aprova ou reprova um documento enviado pelo candidato. */
export async function revisarDocumentoAction(
  docId: string,
  status: 'aprovado' | 'reprovado',
  observacao?: string
): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()
  const { error } = await admin
    .from('documentos_candidato')
    .update({ status, observacao: observacao?.trim() || null })
    .eq('id', docId)
  if (error) return { erro: error.message }

  revalidatePath('/admin/vagas')
  return { sucesso: true }
}

/** Marca o onboarding do candidato como concluído. */
export async function concluirOnboardingAction(conviteId: string): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()
  const { error } = await admin.from('convites_trabalho').update({ status: 'concluido' }).eq('id', conviteId)
  if (error) return { erro: error.message }

  revalidatePath('/admin/vagas')
  return { sucesso: true }
}

/** Gera uma nova senha pro candidato (caso tenha perdido). */
export async function redefinirSenhaCandidatoAction(
  conviteId: string
): Promise<{ sucesso: true; senha: string } | { erro: string }> {
  const check = await verificarAdmin()
  if (!check.ok) return { erro: check.erro }

  const admin = createAdminClient()
  const { data: convite } = await admin
    .from('convites_trabalho')
    .select('user_id')
    .eq('id', conviteId)
    .maybeSingle()
  if (!convite?.user_id) return { erro: 'Convite não encontrado.' }

  const senha = gerarSenha()
  const { error } = await admin.auth.admin.updateUserById(convite.user_id, { password: senha })
  if (error) return { erro: error.message }

  // Zera as entradas junto — nova senha, novo par de acessos
  await admin.from('convites_trabalho').update({ entradas_usadas: 0, bloqueado: false }).eq('id', conviteId)

  revalidatePath('/admin/vagas')
  return { sucesso: true, senha }
}
