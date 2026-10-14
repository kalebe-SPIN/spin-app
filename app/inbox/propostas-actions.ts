'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { CATEGORIAS_PROPOSTA, categoriaDoTipo, urlDoFluxo, type CategoriaProposta } from '@/lib/propostas/categorias'
import { projetosDoContato, garantirProjetoDaCategoria, type ProjetoDoContato } from '@/lib/propostas/projetos-contato'

/**
 * Propostas do contato no Spinzap (Kalebe 2026-10-13): "Montar proposta" segue
 * a etiqueta do cliente (estação de recarga abre a proposta de recarga, não a
 * solar); cada categoria (fotovoltaico, recarga, BESS, O&M) é um projeto
 * próprio do contato.
 */

async function acesso(conversa_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: ok } = await supabase.from('wa_conversas').select('id').eq('id', conversa_id).maybeSingle()
  if (!ok) return { erro: 'Você não tem acesso a esta conversa' as const }
  const admin = createAdminClient()
  const [{ data: c }, { data: perfil }] = await Promise.all([
    admin.from('wa_conversas').select('id, produto, contato:contato_id(id, telefone, nome_exibicao, projeto_id, cliente_id)').eq('id', conversa_id).maybeSingle(),
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])
  const contato = (c as any)?.contato
  if (!contato) return { erro: 'Conversa sem contato' as const }
  return { user, admin, produto: ((c as any)?.produto as string | null) || null, contato, papel: (perfil?.role as string) || null }
}

export async function propostasDoContatoAction(conversa_id: string): Promise<{
  etiqueta: { produto: string | null; categoria: CategoriaProposta | null }
  projetos: ProjetoDoContato[]
} | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const cat = categoriaDoTipo(a.produto)
  return {
    etiqueta: { produto: a.produto, categoria: cat && cat !== 'secao' ? cat : null },
    projetos: await projetosDoContato(a.admin, a.contato),
  }
}

/**
 * Abre (ou cria) o projeto da categoria e devolve a tela onde a proposta é
 * montada. Fotovoltaico também volta o projeto, mas o Spinzap monta no
 * gerador rápido; o link é pra proposta completa.
 */
export async function abrirPropostaCategoriaAction(conversa_id: string, categoria: CategoriaProposta, tipo?: string | null): Promise<
  { projeto_id: string; url: string; criado: boolean } | { erro: string }
> {
  if (!CATEGORIAS_PROPOSTA.some((c) => c.chave === categoria)) return { erro: 'Categoria inválida' }
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  // Tipo: o pedido; senão a etiqueta (se for da mesma categoria); senão o padrão da categoria
  const tipoPedido = tipo || (categoriaDoTipo(a.produto) === categoria ? a.produto : null)
  const r = await garantirProjetoDaCategoria(a.admin, {
    contato: a.contato, categoria, tipo: tipoPedido, usuario_id: a.user.id, papel: a.papel,
  })
  if ('erro' in r) return r
  revalidatePath('/spinzap')
  return { projeto_id: r.projeto_id, url: urlDoFluxo(r.projeto_id, r.tipo), criado: r.criado }
}
