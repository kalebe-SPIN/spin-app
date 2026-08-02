'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type CadastroParceiroInput = {
  nome_completo: string
  email: string
  telefone: string
  cidade: string
  uf: string
  experiencia_solar?: string
}

/**
 * Signup público de parceiro (role='representante') — cria com ativo=false.
 * Admin aprova depois via /admin/usuarios (botão "Reativar").
 * Envia email pro parceiro definir senha + notifica Kalebe.
 */
export async function cadastrarParceiroAction(input: CadastroParceiroInput): Promise<
  { sucesso: true } | { erro: string }
> {
  const nome = input.nome_completo.trim()
  const email = input.email.trim().toLowerCase()
  const tel = input.telefone.replace(/\D/g, '')
  const cidade = input.cidade.trim()
  const uf = input.uf.trim().toUpperCase()

  if (nome.length < 3) return { erro: 'Nome completo obrigatório' }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return { erro: 'Email inválido' }
  if (tel.length < 10) return { erro: 'Telefone inválido' }
  if (!cidade) return { erro: 'Cidade obrigatória' }
  if (uf.length !== 2) return { erro: 'UF inválido (use sigla de 2 letras, ex: SC)' }

  const admin = createAdminClient()

  // Verifica se já existe
  const { data: existente } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const jaExiste = existente?.users?.some(u => u.email?.toLowerCase() === email)
  if (jaExiste) {
    return { erro: 'Este email já está cadastrado. Se esqueceu a senha, use "Esqueci minha senha" na tela de login.' }
  }

  // Convida por email (sem esperar admin aprovar — parceiro já entra no fluxo de definir senha)
  const { data: convite, error: erroConvite } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome_completo: nome, role: 'representante', origem: 'signup_publico' },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.spinsolar.com.br'}/definir-senha`,
  })
  if (erroConvite || !convite?.user) {
    return { erro: `Erro ao enviar convite: ${erroConvite?.message || 'sem detalhes'}` }
  }

  // Atualiza profile: role=representante, ATIVO=FALSE (aguarda aprovação admin)
  await admin
    .from('profiles')
    .update({
      nome_completo: nome,
      role: 'representante',
      telefone: tel,
      ativo: false,
    })
    .eq('id', convite.user.id)

  // Cria pré-cadastro em representantes (metadata pública) — inativo na vitrine
  await admin
    .from('representantes')
    .insert({
      id: convite.user.id,
      nome_publico: nome,
      telefone_whatsapp: tel.length === 11 ? `+55${tel}` : tel,
      email_publico: email,
      cidades_atendidas: [cidade],
      estado: uf,
      especialidade: input.experiencia_solar?.trim() || null,
      visivel_na_vitrine: false, // só vira true após admin aprovar
    })
    // Ignora erro se ID já existir (edge case)
    .then(() => null, () => null)

  return { sucesso: true }
}
