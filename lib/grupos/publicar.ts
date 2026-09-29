import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Grupos internos por setor (Kalebe 2026-09-29) — a Bianca administra e
 * repassa por eles campanhas, mensagens internas e avisos.
 *
 * publicarNoGrupo: posta como agente (service role) e, se for aviso ou
 * campanha, avisa cada membro (sino do portal + WhatsApp individual quando
 * a janela de 24h permitir — mesma regra de avisarUsuario).
 */

export type ChaveGrupo = 'comercial' | 'projetos_homologacao' | 'instalacao_campo' | 'administrativo_financeiro'
export type TipoPost = 'mensagem' | 'aviso' | 'campanha'

/** Membros que recebem aviso: só ativos e não bloqueados (+ admins ativos). */
export async function membrosDoGrupo(grupoId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: membros }, { data: ativos }] = await Promise.all([
    admin.from('grupos_membros').select('*').eq('grupo_id', grupoId),
    admin.from('profiles').select('id, role').eq('ativo', true),
  ])
  const idsAtivos = new Set((ativos || []).map((p: any) => p.id))
  return Array.from(new Set([
    ...(membros || [])
      .filter((m: any) => !m.bloqueado_em && idsAtivos.has(m.usuario_id))  // descadastrado não recebe
      .map((m: any) => m.usuario_id),
    ...(ativos || []).filter((p: any) => p.role === 'admin').map((p: any) => p.id),   // admin participa de todos
  ]))
}

export async function publicarNoGrupo(entrada: {
  grupo: ChaveGrupo | string            // chave ou id
  texto: string
  tipo?: TipoPost
  autor_agente?: 'bianca' | 'davi' | 'qualificacao'
  autor_usuario_id?: string | null
  link?: string | null
  projeto_id?: string | null
  conversa_id?: string | null
  notificar?: boolean                   // default: sim pra aviso/campanha
}): Promise<{ sucesso: true; mensagem_id: string; notificados: number } | { erro: string }> {
  const admin = createAdminClient()
  const texto = String(entrada.texto || '').trim()
  if (!texto) return { erro: 'Mensagem vazia' }
  const tipo = entrada.tipo || 'aviso'

  const ehId = /^[0-9a-f-]{36}$/i.test(entrada.grupo)
  const { data: grupo } = await admin
    .from('grupos_internos')
    .select('id, nome, emoji')
    .eq(ehId ? 'id' : 'chave', entrada.grupo)
    .maybeSingle()
  if (!grupo) return { erro: `Grupo "${entrada.grupo}" não encontrado (migration 125 rodou?)` }

  const { data: msg, error } = await admin
    .from('grupos_mensagens')
    .insert({
      grupo_id: grupo.id,
      autor_agente: entrada.autor_agente || 'bianca',
      autor_usuario_id: entrada.autor_usuario_id || null,
      tipo,
      texto,
      link: entrada.link || null,
    })
    .select('id')
    .single()
  if (error || !msg) return { erro: error?.message || 'Falha ao publicar' }

  let notificados = 0
  const notificar = entrada.notificar ?? tipo !== 'mensagem'
  if (notificar) {
    const { avisarUsuario } = await import('@/lib/agentes/diretorio')   // import tardio: evita ciclo
    const destinatarios = (await membrosDoGrupo(grupo.id)).filter((id) => id !== entrada.autor_usuario_id)
    for (const id of destinatarios) {
      const r = await avisarUsuario({
        destinatario_id: id,
        agente: entrada.autor_agente || 'bianca',
        titulo: `${grupo.emoji} ${grupo.nome}${tipo === 'campanha' ? ' · campanha' : ''}`,
        mensagem: texto,
        urgente: false,
        projeto_id: entrada.projeto_id || null,
        conversa_id: entrada.conversa_id || null,
      }).catch(() => null)
      if (r?.sucesso) notificados += 1
    }
  }
  return { sucesso: true, mensagem_id: msg.id, notificados }
}
