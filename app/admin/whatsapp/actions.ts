'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Painel operacional WhatsApp (Kalebe 2026-09-14).
 * Só admin.
 */
async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const }
  return { user }
}

export type PainelWa = {
  contadores: {
    conversas_ativas: number
    broadcasts_abertos: number
    leads_na_fila: number
    agentes_ativos: number
    agentes_total: number
  }
  broadcasts: any[]
  agentes: any[]
  conversas_recentes: any[]
}

export async function buscarPainelWaAction(): Promise<PainelWa | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }
  const supabase = createClient()

  // 4 queries em paralelo
  const [broadcastsResp, agentesResp, conversasResp, aceitesResp] = await Promise.all([
    supabase
      .from('lead_broadcasts')
      .select(`
        id, status, resumo, posicao_atual, qtd_representantes_notificados,
        contexto_qualificacao, criado_em, atualizado_em, encerrado_em,
        contato:contato_id(id, telefone, nome_exibicao),
        projeto_id
      `)
      .in('status', ['aguardando_aceites', 'atribuido', 'contatado', 'expirado'])
      .order('criado_em', { ascending: false })
      .limit(50),

    supabase
      .from('wa_agentes')
      .select('id, chave, nome, foto_url, descricao_interna, condicao_ativacao, acao_ao_concluir, ativo, criado_em')
      .order('ordem_prioridade', { ascending: true }),

    supabase
      .from('wa_conversas')
      .select(`
        id, status, agente_ativo, responsavel_id, criada_em, ultima_mensagem_em,
        contato:contato_id(telefone, nome_exibicao, tipo),
        responsavel:responsavel_id(nome_completo)
      `)
      .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
      .limit(30),

    supabase
      .from('lead_aceites')
      .select(`
        id, broadcast_id, posicao, status, aceito_em,
        no_volante_em, prazo_expira_em, contatou_em, fim_turno_em,
        representante:representante_id(id, nome_completo)
      `)
      .order('aceito_em', { ascending: false })
      .limit(200),
  ])

  const broadcasts = broadcastsResp.data || []
  const agentes = agentesResp.data || []
  const conversas_recentes = conversasResp.data || []
  const aceites = aceitesResp.data || []

  // Anexa aceites ao broadcast correspondente + ordena por posição
  const broadcastsComFila = broadcasts.map((bc: any) => ({
    ...bc,
    fila: aceites
      .filter((a: any) => a.broadcast_id === bc.id)
      .sort((a: any, b: any) => a.posicao - b.posicao),
  }))

  // Contadores
  const contadores = {
    conversas_ativas: conversas_recentes.filter((c: any) => !['encerrada'].includes(c.status)).length,
    broadcasts_abertos: broadcasts.filter((b: any) => ['aguardando_aceites', 'atribuido'].includes(b.status)).length,
    leads_na_fila: aceites.filter((a: any) => ['pendente', 'no_volante'].includes(a.status)).length,
    agentes_ativos: agentes.filter((a: any) => a.ativo).length,
    agentes_total: agentes.length,
  }

  return {
    contadores,
    broadcasts: broadcastsComFila,
    agentes,
    conversas_recentes,
  }
}

/**
 * Cancela um broadcast (só admin).
 * Usa quando lead resolveu por fora, foi teste, etc.
 */
export async function cancelarBroadcastAction(broadcast_id: string): Promise<
  { sucesso: true } | { erro: string }
> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }
  const supabase = createClient()

  const { error } = await supabase
    .from('lead_broadcasts')
    .update({
      status: 'cancelado',
      encerrado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', broadcast_id)

  if (error) return { erro: error.message }
  return { sucesso: true }
}
