import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Helpers do modelo de conversas WhatsApp (Sprint 1).
 *
 * Kalebe 2026-09-12: canal comum de recepção de leads + comunicação interna.
 * Ver migration 108_wa_conversas.sql.
 *
 * Convenção telefone: E.164 sem '+' (55DDDNUMERO), como o Meta manda.
 */

type SupabaseAdmin = ReturnType<typeof createAdminClient>

export function normalizarTelefone(raw: string | null | undefined): string {
  if (!raw) return ''
  // Só dígitos. Meta já manda assim, mas garante.
  return String(raw).replace(/\D/g, '')
}

/**
 * Garante que existe wa_contatos pra esse telefone. Retorna { id, criado }.
 * Se já existe, atualiza nome_exibicao caso venha um novo.
 */
export async function upsertContato(
  supabase: SupabaseAdmin,
  entrada: {
    telefone: string
    nome_exibicao?: string | null
    tipo_default?: 'lead' | 'cliente' | 'representante' | 'colaborador' | 'desconhecido'
  },
): Promise<{ id: string; criado: boolean } | null> {
  const telefone = normalizarTelefone(entrada.telefone)
  if (!telefone) return null

  const { data: existente } = await supabase
    .from('wa_contatos')
    .select('id, nome_exibicao')
    .eq('telefone', telefone)
    .maybeSingle()

  if (existente) {
    if (entrada.nome_exibicao && entrada.nome_exibicao !== existente.nome_exibicao) {
      await supabase
        .from('wa_contatos')
        .update({ nome_exibicao: entrada.nome_exibicao, atualizado_em: new Date().toISOString() })
        .eq('id', existente.id)
    }
    return { id: existente.id, criado: false }
  }

  const { data: criado, error } = await supabase
    .from('wa_contatos')
    .insert({
      telefone,
      nome_exibicao: entrada.nome_exibicao || null,
      tipo: entrada.tipo_default || 'desconhecido',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[wa/upsertContato]', error)
    return null
  }
  return { id: criado.id, criado: true }
}

/**
 * Retorna a conversa ativa do contato ou cria uma nova.
 * "Ativa" = encerrada_em IS NULL.
 */
type StatusConversa =
  | 'nova'
  | 'em_qualificacao'
  | 'aguardando_representante'
  | 'em_atendimento'
  | 'em_atendimento_ia'
  | 'encerrada'

export async function findOrCreateConversaAtiva(
  supabase: SupabaseAdmin,
  contato_id: string,
  entrada?: {
    status_inicial?: StatusConversa
    agente_ativo?: string | null
    origem_campanha?: string | null
  },
): Promise<{ id: string; criada: boolean } | null> {
  const { data: existente } = await supabase
    .from('wa_conversas')
    .select('id')
    .eq('contato_id', contato_id)
    .is('encerrada_em', null)
    .maybeSingle()

  if (existente) return { id: existente.id, criada: false }

  const { data: criada, error } = await supabase
    .from('wa_conversas')
    .insert({
      contato_id,
      status: entrada?.status_inicial || 'nova',
      agente_ativo: entrada?.agente_ativo || null,
      origem_campanha: entrada?.origem_campanha || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[wa/findOrCreateConversaAtiva]', error)
    return null
  }
  return { id: criada.id, criada: true }
}

type TipoMsg =
  | 'text' | 'audio' | 'image' | 'video' | 'document' | 'template' | 'system' | 'interactive'

/**
 * Grava uma mensagem em wa_mensagens. Idempotente por meta_message_id.
 * Retorna id da mensagem (nova ou existente) ou null em erro.
 */
export async function gravarMensagem(
  supabase: SupabaseAdmin,
  entrada: {
    conversa_id: string
    direcao: 'inbound' | 'outbound'
    tipo?: TipoMsg
    texto?: string | null
    meta_message_id?: string | null
    midia_url?: string | null
    midia_meta_id?: string | null
    midia_mime?: string | null
    midia_duracao_seg?: number | null
    remetente_id?: string | null      // profile.id do humano que enviou
    remetente_agente?: string | null  // 'bianca' | 'qualificacao'
    origem_agente_nome?: string | null
    status_entrega?: 'pendente' | 'enviada' | 'entregue' | 'lida' | 'falhou'
    bianca_comunicacao_id?: string | null
    criada_em?: string
  },
): Promise<string | null> {
  // Dedup por meta_message_id
  if (entrada.meta_message_id) {
    const { data: existente } = await supabase
      .from('wa_mensagens')
      .select('id')
      .eq('meta_message_id', entrada.meta_message_id)
      .maybeSingle()
    if (existente) return existente.id
  }

  const { data, error } = await supabase
    .from('wa_mensagens')
    .insert({
      conversa_id: entrada.conversa_id,
      direcao: entrada.direcao,
      tipo: entrada.tipo || 'text',
      texto: entrada.texto ?? null,
      meta_message_id: entrada.meta_message_id ?? null,
      midia_url: entrada.midia_url ?? null,
      midia_meta_id: entrada.midia_meta_id ?? null,
      midia_mime: entrada.midia_mime ?? null,
      midia_duracao_seg: entrada.midia_duracao_seg ?? null,
      remetente_id: entrada.remetente_id ?? null,
      remetente_agente: entrada.remetente_agente ?? null,
      origem_agente_nome: entrada.origem_agente_nome ?? null,
      status_entrega: entrada.status_entrega || (entrada.direcao === 'inbound' ? 'lida' : 'pendente'),
      bianca_comunicacao_id: entrada.bianca_comunicacao_id ?? null,
      criada_em: entrada.criada_em || new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[wa/gravarMensagem]', error)
    return null
  }
  return data.id
}

/**
 * Atualiza status de uma mensagem outbound por meta_message_id.
 * Idempotente — só evolui pra frente (não regride de 'lida' pra 'entregue').
 */
export async function atualizarStatusPorMetaId(
  supabase: SupabaseAdmin,
  meta_message_id: string,
  entrada: {
    status_entrega?: 'enviada' | 'entregue' | 'lida' | 'falhou'
    entregue_em?: string
    lida_em?: string
    erro?: string | null
  },
): Promise<void> {
  const patch: any = {}
  if (entrada.status_entrega) patch.status_entrega = entrada.status_entrega
  if (entrada.entregue_em) patch.entregue_em = entrada.entregue_em
  if (entrada.lida_em) patch.lida_em = entrada.lida_em
  if (entrada.erro !== undefined) patch.erro = entrada.erro
  if (Object.keys(patch).length === 0) return

  await supabase
    .from('wa_mensagens')
    .update(patch)
    .eq('meta_message_id', meta_message_id)
}
