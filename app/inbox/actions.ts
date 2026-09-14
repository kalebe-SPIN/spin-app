'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  gravarMensagem,
  findOrCreateConversaAtiva,
  upsertContato,
} from '@/lib/whatsapp/conversas'
import { marcarContatoConfirmado } from '@/lib/whatsapp/broadcast'
import { revalidatePath } from 'next/cache'

/**
 * Inbox WhatsApp — Sprint 1 do canal integrado.
 * Kalebe 2026-09-12: canal comum de recepção e comunicação Spin.
 */

type CheckUsuario =
  | { erro: string; user: null; perfil: null }
  | { erro: null; user: { id: string }; perfil: { id: string; role: string; nome_completo: string | null } | null }

async function verificarUsuario(): Promise<CheckUsuario> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado', user: null, perfil: null }
  const { data: perfil } = await supabase
    .from('profiles').select('id, role, nome_completo').eq('id', user.id).maybeSingle()
  return { erro: null, user: { id: user.id }, perfil: (perfil as any) || null }
}

export async function listarConversasAction(): Promise<
  | { conversas: any[] }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const supabase = createClient()

  // RLS já filtra pra consultor/representante — admin vê tudo.
  const { data, error } = await supabase
    .from('wa_conversas')
    .select(`
      id, status, responsavel_id, agente_ativo, origem_campanha,
      ultima_mensagem_em, janela_24h_expira_em, sla_prazo_em,
      criada_em, encerrada_em,
      contato:contato_id(id, telefone, nome_exibicao, tipo, cliente_id, projeto_id),
      responsavel:responsavel_id(nome_completo)
    `)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) return { erro: error.message }
  return { conversas: data || [] }
}

export async function listarMensagensAction(conversa_id: string): Promise<
  | { mensagens: any[] }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const supabase = createClient()

  const { data, error } = await supabase
    .from('wa_mensagens')
    .select(`
      id, direcao, tipo, texto, meta_message_id,
      midia_url, midia_meta_id, midia_mime, midia_duracao_seg,
      remetente_id, remetente_agente, origem_agente_nome,
      status_entrega, erro,
      criada_em, entregue_em, lida_em,
      remetente:remetente_id(nome_completo)
    `)
    .eq('conversa_id', conversa_id)
    .order('criada_em', { ascending: true })
    .limit(500)

  if (error) return { erro: error.message }
  return { mensagens: data || [] }
}

export async function assumirConversaAction(conversa_id: string): Promise<
  | { sucesso: true }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, status, responsavel_id')
    .eq('id', conversa_id)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  if (conv.responsavel_id && conv.responsavel_id !== check.user.id) {
    return { erro: 'Conversa já tem outro responsável.' }
  }

  const { error } = await admin
    .from('wa_conversas')
    .update({
      responsavel_id: check.user.id,
      status: 'em_atendimento',
      agente_ativo: null,
    })
    .eq('id', conversa_id)

  if (error) return { erro: error.message }
  revalidatePath('/inbox')
  return { sucesso: true }
}

export async function encerrarConversaAction(conversa_id: string): Promise<
  | { sucesso: true }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const admin = createAdminClient()

  const { error } = await admin
    .from('wa_conversas')
    .update({
      status: 'encerrada',
      encerrada_em: new Date().toISOString(),
      encerrada_por: check.user.id,
    })
    .eq('id', conversa_id)

  if (error) return { erro: error.message }
  revalidatePath('/inbox')
  return { sucesso: true }
}

/**
 * Envia mensagem de texto pelo canal WhatsApp Spin.
 * - Grava wa_mensagens (direcao=outbound, remetente_id, origem_agente_nome)
 * - Chama Meta Cloud API com prefixo do nome do agente ("*Kalebe:* ...")
 *   pra permitir multi-persona no mesmo canal.
 */
export async function enviarTextoAction(entrada: {
  conversa_id: string
  texto: string
  prefixar_com_nome?: boolean  // default true
}): Promise<{ sucesso: true; meta_message_id: string | null } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const texto = String(entrada.texto || '').trim()
  if (!texto) return { erro: 'Mensagem vazia' }

  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) return { erro: 'Meta Cloud API não configurada.' }

  const admin = createAdminClient()

  // Recupera telefone do contato via conversa
  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, contato:contato_id(telefone)')
    .eq('id', entrada.conversa_id)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  const tel = (conv.contato as any)?.telefone
  if (!tel) return { erro: 'Contato sem telefone' }

  // Multi-persona: prefixa com nome do agente (default) pra o cliente saber
  // quem tá falando dentro do canal Spin.
  const nomeAgente = check.perfil?.nome_completo || 'Spin'
  const prefixar = entrada.prefixar_com_nome !== false
  const corpo = prefixar ? `*${nomeAgente}:*\n${texto}` : texto

  // Envia via Cloud API
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: tel,
      type: 'text',
      text: { body: corpo, preview_url: false },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const erroMsg = data?.error?.message || 'Erro Meta API'
    const erroCode = data?.error?.code
    const foraJanela = erroCode === 131047 || String(erroMsg).includes('24 hours')
    return {
      erro: foraJanela
        ? 'Cliente não respondeu nas últimas 24h — precisa mensagem template pré-aprovada pela Meta.'
        : erroMsg,
    }
  }

  const metaMessageId: string | null = data?.messages?.[0]?.id || null

  // Grava no modelo canônico. Não precisa upsert de contato (já existe).
  await gravarMensagem(admin, {
    conversa_id: entrada.conversa_id,
    direcao: 'outbound',
    tipo: 'text',
    texto,  // guarda SEM prefixo pra ver limpo no inbox
    meta_message_id: metaMessageId,
    remetente_id: check.user.id,
    origem_agente_nome: nomeAgente,
    status_entrega: 'enviada',
  })

  // Se conversa estava 'nova' ou 'em_qualificacao', humano assumiu
  await admin
    .from('wa_conversas')
    .update({ status: 'em_atendimento', responsavel_id: check.user.id, agente_ativo: null })
    .eq('id', entrada.conversa_id)
    .in('status', ['nova', 'em_qualificacao', 'aguardando_representante'])

  // Detecta broadcast atribuído a esse humano → marca contatou
  // (msg dele pelo canal Spin conta como cumprimento de SLA)
  try {
    const { data: bcAtribuido } = await admin
      .from('lead_broadcasts')
      .select('id')
      .eq('conversa_id', entrada.conversa_id)
      .in('status', ['atribuido'])
      .maybeSingle()
    if (bcAtribuido) {
      await marcarContatoConfirmado({
        broadcast_id: bcAtribuido.id,
        representante_id: check.user.id,
      })
    }
  } catch (e) {
    console.error('[enviarTextoAction/marcarContato]', e)
  }

  revalidatePath('/inbox')
  return { sucesso: true, meta_message_id: metaMessageId }
}

/**
 * Kalebe 2026-09-14: 'em cada card de cliente ter o botão de acesso ao
 * canal de comunicação já dentro'.
 *
 * Abre (ou cria) a conversa WhatsApp de um projeto. Se o cliente
 * ainda não tem contato/conversa, cria automaticamente.
 * Retorna o conversa_id pra redirecionar pro /inbox?c=<id>.
 */
export async function abrirCanalDoProjetoAction(
  projeto_id: string,
): Promise<{ conversa_id: string } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }

  const admin = createAdminClient()

  const { data: projeto } = await admin
    .from('projetos')
    .select('id, cliente_razao_social, cliente_telefone, consultor_id')
    .eq('id', projeto_id)
    .maybeSingle()
  if (!projeto) return { erro: 'Projeto não encontrado' }

  // Gate: admin/representante/consultor podem abrir qualquer projeto;
  // consultor comum só o próprio.
  if (check.perfil?.role === 'consultor' && projeto.consultor_id !== check.user.id) {
    return { erro: 'Não é seu projeto' }
  }

  const telefone = String(projeto.cliente_telefone || '').replace(/\D/g, '')
  if (!telefone || telefone.length < 10) {
    return { erro: 'Cliente sem telefone válido no cadastro.' }
  }
  let tel = telefone
  if (tel.length === 11 || tel.length === 10) tel = '55' + tel

  const contato = await upsertContato(admin, {
    telefone: tel,
    nome_exibicao: projeto.cliente_razao_social || undefined,
    tipo_default: 'lead',
  })
  if (!contato) return { erro: 'Falha ao criar contato' }

  // Se contato ainda não linkava projeto, linka agora
  await admin
    .from('wa_contatos')
    .update({ projeto_id })
    .eq('id', contato.id)

  const conversa = await findOrCreateConversaAtiva(admin, contato.id, {
    status_inicial: 'em_atendimento',
  })
  if (!conversa) return { erro: 'Falha ao abrir conversa' }

  return { conversa_id: conversa.id }
}

/**
 * Cria conversa manualmente iniciando pelo telefone (pra testar sem cliente
 * mandar msg primeiro). Só admin.
 */
export async function abrirConversaManualAction(entrada: {
  telefone: string
  nome_exibicao?: string
}): Promise<{ conversa_id: string } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  if (check.perfil?.role !== 'admin') return { erro: 'Só admin pode abrir conversa manual.' }

  const admin = createAdminClient()
  const contato = await upsertContato(admin, {
    telefone: entrada.telefone,
    nome_exibicao: entrada.nome_exibicao,
  })
  if (!contato) return { erro: 'Falha ao criar contato' }
  const conversa = await findOrCreateConversaAtiva(admin, contato.id)
  if (!conversa) return { erro: 'Falha ao criar conversa' }

  revalidatePath('/inbox')
  return { conversa_id: conversa.id }
}
