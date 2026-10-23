'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { usinaDoProjeto, salvarUsina, senhaDaUsina, type DadosUsina, type UsinaTela } from '@/lib/usinas/usina'

/**
 * Usina do cliente pela tela do projeto (Kalebe 2026-10-22). Acesso: quem
 * enxerga o projeto (RLS); a leitura/gravação vai pelo servidor.
 */

async function acesso(projetoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: pj } = await supabase.from('projetos').select('id').eq('id', projetoId).maybeSingle()
  if (!pj) return { erro: 'Você não tem acesso a este projeto' as const }
  return { user, admin: createAdminClient() }
}

export async function dadosUsinaProjetoAction(projetoId: string): Promise<UsinaTela | { erro: string }> {
  const a = await acesso(projetoId)
  if ('erro' in a) return { erro: a.erro as string }
  return usinaDoProjeto(a.admin, projetoId)
}

export async function salvarUsinaProjetoAction(projetoId: string, dados: Partial<DadosUsina>, senha?: string | null): Promise<{ sucesso: true } | { erro: string }> {
  const a = await acesso(projetoId)
  if ('erro' in a) return { erro: a.erro as string }
  const r = await salvarUsina(a.admin, projetoId, dados, senha, a.user.id)
  if ('sucesso' in r) revalidatePath(`/projetos/${projetoId}`)
  return r
}

export async function verSenhaUsinaProjetoAction(projetoId: string): Promise<{ senha: string } | { erro: string }> {
  const a = await acesso(projetoId)
  if ('erro' in a) return { erro: a.erro as string }
  return senhaDaUsina(a.admin, projetoId, a.user.id)
}
