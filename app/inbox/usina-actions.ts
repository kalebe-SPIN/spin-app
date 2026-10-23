'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { usinaDoProjeto, salvarUsina, senhaDaUsina, type DadosUsina, type UsinaTela } from '@/lib/usinas/usina'

/**
 * Usina do cliente no perfil do Spinzap (Kalebe 2026-10-22): as usinas dos
 * projetos do contato da conversa. Acesso: quem enxerga a conversa (RLS) —
 * e o projeto tem que ser deste contato.
 */

async function acesso(conversaId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: conv } = await supabase.from('wa_conversas').select('id').eq('id', conversaId).maybeSingle()
  if (!conv) return { erro: 'Você não tem acesso a esta conversa' as const }
  const admin = createAdminClient()
  const { data: c } = await admin.from('wa_conversas')
    .select('contato:contato_id(id, telefone, nome_exibicao, projeto_id, cliente_id)').eq('id', conversaId).maybeSingle()
  const contato = (c as any)?.contato
  if (!contato) return { erro: 'Conversa sem contato' as const }
  const { projetosDoContato } = await import('@/lib/propostas/projetos-contato')
  const projetos = await projetosDoContato(admin, { ...contato, telefone: contato.telefone || '' })
  return { user, admin, projetos }
}

/** Usinas dos projetos do contato que têm kit ou usina cadastrada (FV e BESS). */
export async function usinasDoContatoAction(conversaId: string): Promise<{ usinas: UsinaTela[] } | { erro: string }> {
  const a = await acesso(conversaId)
  if ('erro' in a) return { erro: a.erro as string }
  const ids = a.projetos.filter((p) => !p.categoria || p.categoria === 'fotovoltaico' || p.categoria === 'bess').map((p) => p.id)
  const usinas: UsinaTela[] = []
  for (const id of ids.slice(0, 10)) {
    const u = await usinaDoProjeto(a.admin, id)
    if ('erro' in u) {
      if (/migration/.test(u.erro)) return { erro: u.erro }
      continue
    }
    // Só mostra quando já tem algo (cadastro ou kit vendido)
    if (u.salva || u.equipamentos.length) usinas.push(u)
  }
  return { usinas }
}

export async function salvarUsinaContatoAction(conversaId: string, projetoId: string, dados: Partial<DadosUsina>, senha?: string | null): Promise<{ sucesso: true } | { erro: string }> {
  const a = await acesso(conversaId)
  if ('erro' in a) return { erro: a.erro as string }
  if (!a.projetos.some((p) => p.id === projetoId)) return { erro: 'Projeto não é deste contato' }
  const r = await salvarUsina(a.admin, projetoId, dados, senha, a.user.id)
  if ('sucesso' in r) { revalidatePath('/spinzap'); revalidatePath(`/projetos/${projetoId}`) }
  return r
}

export async function verSenhaUsinaContatoAction(conversaId: string, projetoId: string): Promise<{ senha: string } | { erro: string }> {
  const a = await acesso(conversaId)
  if ('erro' in a) return { erro: a.erro as string }
  if (!a.projetos.some((p) => p.id === projetoId)) return { erro: 'Projeto não é deste contato' }
  return senhaDaUsina(a.admin, projetoId, a.user.id)
}
