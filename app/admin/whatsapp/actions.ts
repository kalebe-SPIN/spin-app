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
    usuarios_com_telefone: number
    usuarios_sem_telefone: number
  }
  broadcasts: any[]
  agentes: any[]
  conversas_recentes: any[]
  usuarios: Array<{
    id: string
    nome_completo: string | null
    role: string
    telefone: string | null
    ativo: boolean
  }>
}

export async function buscarPainelWaAction(): Promise<PainelWa | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }
  const supabase = createClient()

  // 5 queries em paralelo
  const [broadcastsResp, agentesResp, conversasResp, aceitesResp, usuariosResp] = await Promise.all([
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

    // Kalebe 2026-09-14: cadastro de telefones dos usuários pra broadcast.
    // Só quem participa do canal comercial (admin + representante + consultor
    // + sdr + vendedor_servicos). Ordenado por nome.
    supabase
      .from('profiles')
      .select('id, nome_completo, role, telefone, ativo')
      .in('role', ['admin', 'representante', 'consultor', 'sdr', 'vendedor_servicos'])
      .eq('ativo', true)
      .order('nome_completo', { ascending: true }),
  ])

  const broadcasts = broadcastsResp.data || []
  const agentes = agentesResp.data || []
  const conversas_recentes = conversasResp.data || []
  const aceites = aceitesResp.data || []
  const usuarios = (usuariosResp.data || []) as any[]

  // Anexa aceites ao broadcast correspondente + ordena por posição
  const broadcastsComFila = broadcasts.map((bc: any) => ({
    ...bc,
    fila: aceites
      .filter((a: any) => a.broadcast_id === bc.id)
      .sort((a: any, b: any) => a.posicao - b.posicao),
  }))

  // Contadores
  const usuariosComTelefone = usuarios.filter((u) =>
    u.telefone && String(u.telefone).replace(/\D/g, '').length >= 10,
  ).length
  const contadores = {
    conversas_ativas: conversas_recentes.filter((c: any) => !['encerrada'].includes(c.status)).length,
    broadcasts_abertos: broadcasts.filter((b: any) => ['aguardando_aceites', 'atribuido'].includes(b.status)).length,
    leads_na_fila: aceites.filter((a: any) => ['pendente', 'no_volante'].includes(a.status)).length,
    agentes_ativos: agentes.filter((a: any) => a.ativo).length,
    agentes_total: agentes.length,
    usuarios_com_telefone: usuariosComTelefone,
    usuarios_sem_telefone: usuarios.length - usuariosComTelefone,
  }

  return {
    contadores,
    broadcasts: broadcastsComFila,
    agentes,
    conversas_recentes,
    usuarios,
  }
}

/**
 * Kalebe 2026-09-14: atualiza telefone do usuário direto do painel WhatsApp.
 * Aceita formato livre (com/sem 55, com/sem parenteses). Normaliza pra
 * armazenar só dígitos com prefixo 55.
 * Retorna telefone normalizado ou erro.
 */
export async function atualizarTelefoneUsuarioAction(
  user_id: string,
  telefone_bruto: string,
): Promise<{ telefone: string } | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro as string }
  const supabase = createClient()

  const digitos = String(telefone_bruto || '').replace(/\D/g, '')
  if (digitos.length === 0) {
    // Permite limpar
    const { error } = await supabase.from('profiles').update({ telefone: null }).eq('id', user_id)
    if (error) return { erro: error.message }
    return { telefone: '' }
  }
  if (digitos.length < 10) {
    return { erro: 'Telefone precisa ter ao menos DDD + número.' }
  }
  let tel = digitos
  if (tel.length === 10 || tel.length === 11) tel = '55' + tel
  if (tel.length < 12 || tel.length > 13) {
    return { erro: 'Telefone inválido — use formato 55DDD9NNNNNNNN.' }
  }

  const { error } = await supabase.from('profiles').update({ telefone: tel }).eq('id', user_id)
  if (error) return { erro: error.message }
  return { telefone: tel }
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
