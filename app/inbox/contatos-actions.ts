'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizarTelefoneContato,
  salvarContatosNoProjeto,
  type PapelContato,
} from '@/lib/whatsapp/contatos-projeto'

/**
 * Contatos do projeto a partir da conversa (Kalebe 2026-09-29): o cliente
 * manda o contato do decisor e ele fica no mesmo projeto.
 * Acesso: o usuário precisa enxergar a conversa (RLS); a escrita vai com
 * service role porque o projeto pode ser o esqueleto da Laís, sem consultor.
 */

async function projetoDaConversa(conversaId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as string }
  const { data: conv } = await supabase
    .from('wa_conversas').select('id, contato_id').eq('id', conversaId).maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' as string }
  const admin = createAdminClient()
  const { data: contato } = await admin
    .from('wa_contatos').select('projeto_id').eq('id', conv.contato_id).maybeSingle()
  let codigo: string | null = null
  if (contato?.projeto_id) {
    const { data: p } = await admin.from('projetos').select('codigo').eq('id', contato.projeto_id).maybeSingle()
    codigo = p?.codigo || null
  }
  return { user, admin, projeto_id: (contato?.projeto_id as string | null) || null, codigo }
}

export async function contatosDoProjetoDaConversaAction(conversaId: string): Promise<
  { projeto_id: string | null; codigo: string | null; telefones: string[] } | { erro: string }
> {
  const r = await projetoDaConversa(conversaId)
  if ('erro' in r) return { erro: r.erro as string }
  if (!r.projeto_id) return { projeto_id: null, codigo: null, telefones: [] }
  const { data } = await r.admin.from('projeto_contatos').select('telefone').eq('projeto_id', r.projeto_id)
  return {
    projeto_id: r.projeto_id,
    codigo: r.codigo,
    telefones: (data || []).map((c: any) => c.telefone).filter(Boolean),
  }
}

export async function salvarContatoDaConversaAction(input: {
  conversa_id: string
  nome: string
  telefone: string
  papel: PapelContato
  origem: 'whatsapp_cartao' | 'whatsapp_texto'
  wa_mensagem_id?: string | null
}): Promise<{ sucesso: true; codigo: string | null } | { erro: string }> {
  const r = await projetoDaConversa(input.conversa_id)
  if ('erro' in r) return { erro: r.erro as string }
  if (!r.projeto_id) {
    return { erro: 'Esta conversa ainda não tem projeto — use "Transformar em projeto" primeiro (os cartões de contato já entram junto).' }
  }
  const telefone = normalizarTelefoneContato(input.telefone)
  if (!telefone) return { erro: 'Telefone inválido — precisa de DDD' }
  if (!input.nome.trim()) return { erro: 'Informe o nome' }
  let n = 0
  try {
    n = await salvarContatosNoProjeto(r.admin, {
      projeto_id: r.projeto_id,
      contatos: [{ nome: input.nome.trim(), telefone, papel: input.papel }],
      origem: input.origem,
      wa_mensagem_id: input.wa_mensagem_id || null,
      criado_por: r.user.id,
    })
  } catch (e: any) {
    return { erro: e?.message || 'Falha ao salvar o contato' }
  }
  if (n === 0) return { erro: 'Esse telefone já está nos contatos do projeto' }
  revalidatePath(`/projetos/${r.projeto_id}`)
  return { sucesso: true, codigo: r.codigo }
}
