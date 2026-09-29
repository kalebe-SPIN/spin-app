'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicarNoGrupo } from '@/lib/grupos/publicar'

/**
 * Grupos internos por setor (Kalebe 2026-09-29). Leitura e envio pela
 * sessão do usuário (RLS: membro ou admin). Aviso "pela Bianca" (notifica
 * todos) só pra admin, com service role em lib/grupos/publicar.
 */

async function sessao() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ehAdmin: false }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, ehAdmin: perfil?.role === 'admin' }
}

export type GrupoResumo = {
  id: string; chave: string; nome: string; emoji: string; descricao: string | null
  nao_lidas: number; ultima: { texto: string; criado_em: string } | null
}

export async function listarGruposAction(): Promise<{ grupos: GrupoResumo[]; eh_admin: boolean } | { erro: string }> {
  const { supabase, user, ehAdmin } = await sessao()
  if (!user) return { erro: 'Não autenticado' }
  const [{ data: grupos, error }, { data: leituras }] = await Promise.all([
    supabase.from('grupos_internos').select('id, chave, nome, emoji, descricao, ordem').eq('ativo', true).order('ordem'),
    supabase.from('grupos_leituras').select('grupo_id, lido_ate').eq('usuario_id', user.id),
  ])
  if (error) return { erro: error.message.includes('grupos_internos') ? 'Falta rodar a migration 125 no Supabase.' : error.message }
  const lidoAte = new Map((leituras || []).map((l: any) => [l.grupo_id, l.lido_ate]))
  const resumo: GrupoResumo[] = []
  for (const g of grupos || []) {
    const desde = lidoAte.get(g.id) || '1970-01-01T00:00:00Z'
    const [{ count }, { data: ult }] = await Promise.all([
      supabase.from('grupos_mensagens').select('id', { count: 'exact', head: true }).eq('grupo_id', g.id).gt('criado_em', desde),
      supabase.from('grupos_mensagens').select('texto, criado_em').eq('grupo_id', g.id).order('criado_em', { ascending: false }).limit(1),
    ])
    resumo.push({ id: g.id, chave: g.chave, nome: g.nome, emoji: g.emoji, descricao: g.descricao, nao_lidas: count || 0, ultima: ult?.[0] || null })
  }
  return { grupos: resumo, eh_admin: ehAdmin }
}

export async function mensagensDoGrupoAction(grupoId: string): Promise<{ mensagens: any[] } | { erro: string }> {
  const { supabase, user } = await sessao()
  if (!user) return { erro: 'Não autenticado' }
  const { data, error } = await supabase
    .from('grupos_mensagens')
    .select('id, autor_usuario_id, autor_agente, tipo, texto, link, criado_em')
    .eq('grupo_id', grupoId)
    .order('criado_em', { ascending: false })
    .limit(150)
  if (error) return { erro: error.message }
  // Nomes dos autores via service role (RLS de profiles só mostra o próprio);
  // as mensagens em si já passaram pelo RLS do grupo acima
  const autorIds = Array.from(new Set((data || []).map((m: any) => m.autor_usuario_id).filter(Boolean)))
  const nomes = new Map<string, string>()
  if (autorIds.length) {
    const { data: perfis } = await createAdminClient().from('profiles').select('id, nome_completo').in('id', autorIds)
    for (const p of perfis || []) nomes.set(p.id, p.nome_completo)
  }
  // Abriu o grupo = leu tudo até agora
  await supabase.from('grupos_leituras').upsert({ grupo_id: grupoId, usuario_id: user.id, lido_ate: new Date().toISOString() })
  return {
    mensagens: (data || []).reverse().map((m: any) => ({
      ...m,
      autor: m.autor_usuario_id && nomes.get(m.autor_usuario_id) ? { nome_completo: nomes.get(m.autor_usuario_id) } : null,
    })),
  }
}

export async function enviarMensagemGrupoAction(input: {
  grupo_id: string
  texto: string
  como_aviso_bianca?: boolean       // admin: Bianca publica como aviso e notifica todos
}): Promise<{ sucesso: true; notificados?: number } | { erro: string }> {
  const { supabase, user, ehAdmin } = await sessao()
  if (!user) return { erro: 'Não autenticado' }
  const texto = input.texto.trim()
  if (!texto) return { erro: 'Mensagem vazia' }

  if (input.como_aviso_bianca) {
    if (!ehAdmin) return { erro: 'Só o admin publica aviso pela Bianca' }
    const r = await publicarNoGrupo({ grupo: input.grupo_id, texto, tipo: 'aviso', autor_agente: 'bianca', autor_usuario_id: user.id })
    if ('erro' in r) return { erro: r.erro }
    revalidatePath('/grupos')
    return { sucesso: true, notificados: r.notificados }
  }

  const { error } = await supabase.from('grupos_mensagens').insert({
    grupo_id: input.grupo_id, autor_usuario_id: user.id, tipo: 'mensagem', texto,
  })
  if (error) return { erro: error.message }
  await supabase.from('grupos_leituras').upsert({ grupo_id: input.grupo_id, usuario_id: user.id, lido_ate: new Date().toISOString() })
  return { sucesso: true }
}

export async function membrosAction(grupoId: string): Promise<
  { membros: Array<{ id: string; nome: string; papel: string }>; todos: Array<{ id: string; nome: string; papel: string }> } | { erro: string }
> {
  const { supabase, user, ehAdmin } = await sessao()
  if (!user) return { erro: 'Não autenticado' }
  // RLS: só devolve o grupo se o usuário participa (ou é admin)
  const { data: g } = await supabase.from('grupos_internos').select('id').eq('id', grupoId).maybeSingle()
  if (!g) return { erro: 'Você não participa desse grupo' }
  // profiles tem RLS restrito — nomes via service role, já validado acima
  const admin = createAdminClient()
  const [{ data: m }, { data: perfis }] = await Promise.all([
    admin.from('grupos_membros').select('*').eq('grupo_id', grupoId),
    admin.from('profiles').select('id, nome_completo, role').eq('ativo', true),
  ])
  // Bloqueado (descadastrado) não aparece; perfis inativos já ficam fora da lista
  const ids = new Set((m || []).filter((x: any) => !x.bloqueado_em).map((x: any) => x.usuario_id))
  const todos = (perfis || [])
    .filter((p: any) => p.role !== 'candidato')
    .map((p: any) => ({ id: p.id, nome: p.nome_completo || 'Sem nome', papel: p.role }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const membros = todos.filter((p) => ids.has(p.id) || p.papel === 'admin')
  return { membros, todos: ehAdmin ? todos : membros }
}

export async function alterarMembroAction(grupoId: string, usuarioId: string, incluir: boolean): Promise<{ sucesso: true } | { erro: string }> {
  const { supabase, ehAdmin } = await sessao()
  if (!ehAdmin) return { erro: 'Só o admin gerencia os membros' }
  if (incluir) {
    const { data: p } = await createAdminClient().from('profiles').select('ativo').eq('id', usuarioId).maybeSingle()
    if (!p?.ativo) return { erro: 'Usuário desativado não pode entrar em grupo — reative em Admin → Usuários' }
  }
  const { error } = incluir
    ? await supabase.from('grupos_membros').upsert({ grupo_id: grupoId, usuario_id: usuarioId, bloqueado_em: null })
    : await supabase.from('grupos_membros').delete().eq('grupo_id', grupoId).eq('usuario_id', usuarioId)
  if (error) return { erro: error.message }
  return { sucesso: true }
}
