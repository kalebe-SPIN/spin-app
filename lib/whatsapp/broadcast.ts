import { createAdminClient } from '@/lib/supabase/admin'
import { enviarTextoPeloCanal } from './enviar-canal'
import { upsertContato, findOrCreateConversaAtiva } from './conversas'

/**
 * Motor de broadcast/fila FIFO pros representantes.
 *
 * Kalebe 2026-09-14: 'agente cria projeto e depois disso ele dispara
 * para todos os representantes uma mensagem de lead novo e aquele que
 * aceitar (ordem de aceite) terá 8 minutos... senão perde e vai pro
 * próximo da fila'.
 *
 * Ver [[project_fluxo_lead_whatsapp_spin]] na memória.
 *
 * PRAZOS FIXOS (regra de negócio Spin):
 *   PRAZO_CONTATO_MIN = 8    (a partir de virar no_volante)
 *   AVISO_MIN_ANTES   = 2    (aviso "restam 2 min" antes do prazo)
 *   RETOMADA_MIN      = 35   (após esse tempo sem contato, agente
 *                             volta a qualificar profundo)
 */
export const PRAZO_CONTATO_MIN = 8
export const AVISO_MIN_ANTES = 2
export const RETOMADA_MIN = 35

const NOME_AGENTE_QUALIFICACAO = 'Assistente Spin'

/**
 * Inicia um broadcast: cria lead_broadcasts + notifica cada representante
 * ativo. Idempotente por (conversa_id, status ativo).
 *
 * Retorna id do broadcast criado (ou existente).
 */
export async function iniciarBroadcastLead(entrada: {
  conversa_id: string
  projeto_id: string | null
  contato_id: string
  resumo: string                 // "João da Silva · Palhoça · on_grid · residencial"
  contexto_qualificacao: any
}): Promise<{ broadcast_id: string; ja_existia: boolean; representantes_notificados: number } | { erro: string }> {
  const admin = createAdminClient()

  // Verifica se já tem broadcast ativo pra essa conversa (uniq parcial)
  const { data: jaExiste } = await admin
    .from('lead_broadcasts')
    .select('id, qtd_representantes_notificados')
    .eq('conversa_id', entrada.conversa_id)
    .in('status', ['aguardando_aceites', 'atribuido'])
    .maybeSingle()

  if (jaExiste) {
    return {
      broadcast_id: jaExiste.id,
      ja_existia: true,
      representantes_notificados: jaExiste.qtd_representantes_notificados || 0,
    }
  }

  // Busca representantes ativos COM telefone cadastrado
  const { data: reps } = await admin
    .from('profiles')
    .select('id, nome_completo, telefone')
    .in('role', ['representante', 'admin', 'consultor'])   // MVP: admin + consultor também recebem
    .eq('ativo', true)

  const repsValidos = (reps || []).filter((r) =>
    r.telefone && String(r.telefone).replace(/\D/g, '').length >= 10,
  )

  if (repsValidos.length === 0) {
    console.warn('[broadcast] Nenhum representante ativo com telefone cadastrado')
  }

  // Cria broadcast
  const { data: broadcast, error } = await admin
    .from('lead_broadcasts')
    .insert({
      conversa_id: entrada.conversa_id,
      projeto_id: entrada.projeto_id,
      contato_id: entrada.contato_id,
      resumo: entrada.resumo,
      contexto_qualificacao: entrada.contexto_qualificacao,
      status: 'aguardando_aceites',
      posicao_atual: 0,
      qtd_representantes_notificados: repsValidos.length,
    })
    .select('id')
    .single()

  if (error || !broadcast) {
    return { erro: error?.message || 'Falha ao criar broadcast' }
  }

  // Notifica cada representante individualmente pelo canal Spin
  // (usa upsert de contato — a maioria já deve existir).
  for (const rep of repsValidos) {
    try {
      const tel = normalizarBR(rep.telefone!)
      const contato = await upsertContato(admin, {
        telefone: tel,
        nome_exibicao: rep.nome_completo || undefined,
        tipo_default: 'representante',
      })
      if (!contato) continue
      const conversaRep = await findOrCreateConversaAtiva(admin, contato.id, {
        status_inicial: 'em_atendimento',
      })
      if (!conversaRep) continue

      const primeiroNome = (rep.nome_completo || '').split(' ')[0]
      const msg = [
        `🎯 *Novo lead disponível*`,
        ``,
        entrada.resumo,
        ``,
        `Responda *ACEITAR* pra atender.`,
        `Quem responder primeiro fica com o lead — depois disso você tem ${PRAZO_CONTATO_MIN} min pra contatar o cliente (mensagem de voz ou chamada) pelo canal Spin.`,
      ].join('\n')

      await enviarTextoPeloCanal({
        conversa_id: conversaRep.id,
        telefone: tel,
        texto: msg,
        remetente_agente: 'sistema',
        origem_agente_nome: 'Central Spin',
        prefixar_com_nome: false,     // template estruturado, não persona
      })

      // Guarda o vínculo broadcast → conversa do rep pra saber onde ele respondeu
      // (sem tabela extra: guardamos em lead_aceites depois quando ele aceitar)
    } catch (e) {
      console.error('[broadcast/notifica_rep]', rep.id, e)
    }
  }

  return {
    broadcast_id: broadcast.id,
    ja_existia: false,
    representantes_notificados: repsValidos.length,
  }
}

/**
 * Rep aceita o lead. Cria lead_aceites com posição = próximo(1..N).
 * Se posição=1, promove imediatamente pra 'no_volante' e inicia prazo.
 *
 * Idempotente: se rep já aceitou, retorna o aceite existente.
 * Corrida: usa SELECT FOR UPDATE via RPC — MVP usa retry simples.
 */
export async function aceitarLead(entrada: {
  broadcast_id: string
  representante_id: string
}): Promise<{ aceite_id: string; posicao: number; no_volante: boolean } | { erro: string }> {
  const admin = createAdminClient()

  // Busca broadcast e valida
  const { data: bc } = await admin
    .from('lead_broadcasts')
    .select('id, status, contato_id, conversa_id')
    .eq('id', entrada.broadcast_id)
    .maybeSingle()
  if (!bc) return { erro: 'Broadcast não encontrado' }
  if (!['aguardando_aceites', 'atribuido'].includes(bc.status)) {
    return { erro: `Broadcast já ${bc.status}` }
  }

  // Idempotência: rep já aceitou?
  const { data: aceiteExistente } = await admin
    .from('lead_aceites')
    .select('id, posicao, status')
    .eq('broadcast_id', entrada.broadcast_id)
    .eq('representante_id', entrada.representante_id)
    .maybeSingle()
  if (aceiteExistente) {
    return {
      aceite_id: aceiteExistente.id,
      posicao: aceiteExistente.posicao,
      no_volante: aceiteExistente.status === 'no_volante',
    }
  }

  // Descobre próxima posição
  const { data: aceites } = await admin
    .from('lead_aceites')
    .select('posicao')
    .eq('broadcast_id', entrada.broadcast_id)
    .order('posicao', { ascending: false })
    .limit(1)
  const proximaPosicao = ((aceites?.[0]?.posicao) || 0) + 1

  // Se ainda não tem ninguém no volante, este vira o volante direto
  const { data: temNoVolante } = await admin
    .from('lead_aceites')
    .select('id')
    .eq('broadcast_id', entrada.broadcast_id)
    .eq('status', 'no_volante')
    .maybeSingle()

  const viraVolanteAgora = !temNoVolante

  const agora = new Date()
  const prazoExpira = new Date(agora.getTime() + PRAZO_CONTATO_MIN * 60 * 1000)

  const { data: aceite, error } = await admin
    .from('lead_aceites')
    .insert({
      broadcast_id: entrada.broadcast_id,
      representante_id: entrada.representante_id,
      posicao: proximaPosicao,
      status: viraVolanteAgora ? 'no_volante' : 'pendente',
      no_volante_em: viraVolanteAgora ? agora.toISOString() : null,
      prazo_expira_em: viraVolanteAgora ? prazoExpira.toISOString() : null,
    })
    .select('id')
    .single()

  if (error || !aceite) return { erro: error?.message || 'Falha ao criar aceite' }

  if (viraVolanteAgora) {
    await admin
      .from('lead_broadcasts')
      .update({
        status: 'atribuido',
        posicao_atual: proximaPosicao,
        atualizado_em: agora.toISOString(),
      })
      .eq('id', entrada.broadcast_id)

    // Avisa o REP: "você está no volante, tem 8 min. Contato = voz ou vídeo pelo canal Spin"
    await avisarNoVolante(admin, entrada.broadcast_id, entrada.representante_id, bc.contato_id)

    // Avisa o LEAD: "vou te conectar com {nome}"
    await avisarLeadAtendimentoIminente(admin, bc.conversa_id, entrada.representante_id)
  } else {
    // Confirma pro rep que aceitou e está na fila
    await avisarPosicaoNaFila(admin, entrada.representante_id, proximaPosicao)
  }

  return {
    aceite_id: aceite.id,
    posicao: proximaPosicao,
    no_volante: viraVolanteAgora,
  }
}

/**
 * Marca que o rep no volante cumpriu o SLA (mandou áudio/vídeo pelo canal).
 * Chamado pelo webhook quando detecta áudio outbound do rep pra o cliente do broadcast,
 * OU pelo botão "iniciar chamada Jitsi".
 */
export async function marcarContatoConfirmado(entrada: {
  broadcast_id: string
  representante_id: string
}): Promise<{ sucesso: true } | { erro: string }> {
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const { data: aceite } = await admin
    .from('lead_aceites')
    .select('id, status')
    .eq('broadcast_id', entrada.broadcast_id)
    .eq('representante_id', entrada.representante_id)
    .maybeSingle()
  if (!aceite) return { erro: 'Aceite não encontrado' }
  if (aceite.status !== 'no_volante') {
    // Rep contatou fora do turno (não era ele quem estava no volante) — ignora
    return { sucesso: true }
  }

  await admin
    .from('lead_aceites')
    .update({
      status: 'contatou',
      contatou_em: agora,
      fim_turno_em: agora,
    })
    .eq('id', aceite.id)

  await admin
    .from('lead_broadcasts')
    .update({
      status: 'contatado',
      atualizado_em: agora,
      encerrado_em: agora,
    })
    .eq('id', entrada.broadcast_id)

  return { sucesso: true }
}

// ─── Helpers de mensagens automatizadas ──────────────────────────────────

async function avisarNoVolante(
  admin: ReturnType<typeof createAdminClient>,
  broadcast_id: string,
  rep_id: string,
  contato_lead_id: string,
) {
  const { data: rep } = await admin
    .from('profiles').select('telefone, nome_completo').eq('id', rep_id).maybeSingle()
  if (!rep?.telefone) return
  const tel = normalizarBR(rep.telefone)
  const contato = await upsertContato(admin, { telefone: tel, tipo_default: 'representante' })
  if (!contato) return
  const conversa = await findOrCreateConversaAtiva(admin, contato.id, { status_inicial: 'em_atendimento' })
  if (!conversa) return

  const { data: leadContato } = await admin
    .from('wa_contatos')
    .select('telefone, nome_exibicao')
    .eq('id', contato_lead_id)
    .maybeSingle()
  const telLead = leadContato?.telefone || ''
  const nomeLead = leadContato?.nome_exibicao || 'o lead'

  const msg = [
    `✅ Lead pra você!`,
    ``,
    `Cliente: ${nomeLead} · ${telLead}`,
    ``,
    `Você tem *${PRAZO_CONTATO_MIN} minutos* pra mandar mensagem de voz ou iniciar chamada pelo canal Spin.`,
    `Contato por WhatsApp pessoal NÃO conta — precisa ser pelo canal.`,
  ].join('\n')

  await enviarTextoPeloCanal({
    conversa_id: conversa.id,
    telefone: tel,
    texto: msg,
    remetente_agente: 'sistema',
    origem_agente_nome: 'Central Spin',
    prefixar_com_nome: false,
  })
}

async function avisarPosicaoNaFila(
  admin: ReturnType<typeof createAdminClient>,
  rep_id: string,
  posicao: number,
) {
  const { data: rep } = await admin
    .from('profiles').select('telefone').eq('id', rep_id).maybeSingle()
  if (!rep?.telefone) return
  const tel = normalizarBR(rep.telefone)
  const contato = await upsertContato(admin, { telefone: tel, tipo_default: 'representante' })
  if (!contato) return
  const conversa = await findOrCreateConversaAtiva(admin, contato.id, { status_inicial: 'em_atendimento' })
  if (!conversa) return

  await enviarTextoPeloCanal({
    conversa_id: conversa.id,
    telefone: tel,
    texto: `📋 Você está na *posição ${posicao}* da fila desse lead. Se quem tá na frente não contatar em ${PRAZO_CONTATO_MIN}min, o lead vem pra você.`,
    remetente_agente: 'sistema',
    origem_agente_nome: 'Central Spin',
    prefixar_com_nome: false,
  })
}

async function avisarLeadAtendimentoIminente(
  admin: ReturnType<typeof createAdminClient>,
  conversa_id: string,
  rep_id: string,
) {
  const { data: rep } = await admin
    .from('profiles').select('nome_completo').eq('id', rep_id).maybeSingle()
  const primeiroNome = (rep?.nome_completo || '').split(' ')[0] || 'um representante'

  const { data: conv } = await admin
    .from('wa_conversas')
    .select('contato:contato_id(telefone)')
    .eq('id', conversa_id)
    .maybeSingle()
  const tel = (conv?.contato as any)?.telefone
  if (!tel) return

  await enviarTextoPeloCanal({
    conversa_id,
    telefone: tel,
    texto: `Ótimo! Vou te conectar com o ${primeiroNome}, do time comercial Spin. Ele vai te mandar uma mensagem em instantes.`,
    remetente_agente: 'qualificacao',
    origem_agente_nome: NOME_AGENTE_QUALIFICACAO,
  })
}

function normalizarBR(t: string) {
  let x = String(t || '').replace(/\D/g, '')
  if (x.length === 11) x = '55' + x
  if (x.length === 10) x = '55' + x
  return x
}
