'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarTelefoneContato, salvarContatosNoProjeto, type PapelContato } from '@/lib/whatsapp/contatos-projeto'

/** Contatos do projeto (decisor, financeiro…) — Kalebe 2026-09-29. RLS: quem vê o projeto. */

export async function adicionarContatoProjetoAction(input: {
  projeto_id: string
  nome: string
  telefone: string
  papel: PapelContato
  email?: string
}): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (!input.nome.trim()) return { erro: 'Informe o nome' }
  const telefone = input.telefone.trim() ? normalizarTelefoneContato(input.telefone) : null
  if (input.telefone.trim() && !telefone) return { erro: 'Telefone inválido — use DDD + número' }
  try {
    const n = await salvarContatosNoProjeto(supabase, {
      projeto_id: input.projeto_id,
      contatos: [{ nome: input.nome, telefone, email: input.email?.trim() || null, papel: input.papel }],
      origem: 'manual',
      criado_por: user.id,
    })
    if (n === 0) return { erro: 'Esse telefone já está nos contatos do projeto' }
  } catch (e: any) {
    return { erro: e?.message || 'Falha ao salvar' }
  }
  revalidatePath(`/projetos/${input.projeto_id}`)
  return { sucesso: true }
}

export async function atualizarPapelContatoAction(id: string, projetoId: string, papel: PapelContato) {
  const supabase = createClient()
  const { error } = await supabase.from('projeto_contatos').update({ papel }).eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true as const }
}

export async function removerContatoProjetoAction(id: string, projetoId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('projeto_contatos').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true as const }
}
