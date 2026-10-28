'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarTelefoneContato, salvarContatosNoProjeto, type PapelContato } from '@/lib/whatsapp/contatos-projeto'
import { garantirContatoNoSpinzap } from '@/lib/whatsapp/contato-spinzap'

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
  // Kalebe 2026-10-28: o contato também aparece no Spinzap (o insert acima já
  // passou pelo RLS do projeto, então o acesso está conferido)
  if (telefone) {
    await garantirContatoNoSpinzap(createAdminClient(), { projeto_id: input.projeto_id, nome: input.nome, telefone }).catch(() => null)
  }
  revalidatePath(`/projetos/${input.projeto_id}`)
  revalidatePath('/spinzap')
  return { sucesso: true }
}

/** Botão "Spinzap" de um contato do projeto: garante o contato e abre a conversa. */
export async function abrirContatoNoSpinzapAction(contatoId: string): Promise<{ conversa_id: string } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: c } = await supabase.from('projeto_contatos').select('projeto_id, nome, telefone').eq('id', contatoId).maybeSingle()
  if (!c) return { erro: 'Contato não encontrado' }
  if (!c.telefone) return { erro: 'Esse contato está sem telefone.' }
  const r = await garantirContatoNoSpinzap(createAdminClient(), { projeto_id: c.projeto_id, nome: c.nome, telefone: c.telefone })
  if ('conversa_id' in r) revalidatePath('/spinzap')
  return r
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
