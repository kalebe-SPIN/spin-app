import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarTextoPeloCanal } from './enviar-canal'
import { iniciarBroadcastLead, RETOMADA_MIN } from './broadcast'
import { getWaConfig } from './config'

/**
 * Agente de qualificação de leads WhatsApp.
 *
 * Kalebe 2026-09-14 (regra revisada):
 * "o agente só vai fazer perguntas [profundas] depois que for identificado
 *  que o lead ainda não foi atendido após um prazo de 35 minutos e antes
 *  disso ele só pergunta a cidade e o nome e pede se o cliente pode enviar
 *  a fatura para adiantar no atendimento"
 *
 * MODO LEVE (default, primeiros 35min):
 *   - Coleta: nome + cidade
 *   - Pede: fatura (imagem/PDF/áudio)
 *   - Assim que tem nome+cidade → cria projeto + dispara broadcast pros reps
 *   - Se cliente manda fatura, agente agradece e diz que já passou pra equipe
 *   - Se cliente segue mandando msgs, agente responde curto ("já estou passando",
 *     "aguarde só um pouquinho") sem qualificar mais
 *
 * MODO PROFUNDO (após 35min sem contato de nenhum rep):
 *   - Ativado pelo cron quando broadcast está sem contato há 35min
 *   - Agora agente pergunta: tipo de sistema, tipo de imóvel, consumo,
 *     valor conta
 *   - Continua tentando manter o lead engajado
 *
 * Fluxo por conversa:
 *   status='nova' | 'em_qualificacao' → agente responde
 *   status='aguardando_representante' → agente só responde msgs curtas
 *     ("já estou te passando"), sem qualificar
 *   status='em_atendimento' → agente SILENCIA (humano no volante)
 */

type ContextoQualificacao = {
  nome_cliente?: string
  cidade?: string
  uf?: string
  fatura_recebida?: boolean
  fatura_pediu_em?: string  // ISO
  // Modo profundo (só preenchido depois de 35min)
  tipo_sistema?: 'on_grid' | 'hibrido' | 'bess' | 've_recarga' | 'limpeza' | 'revisao' | 'outro'
  consumo_kwh_mes?: number
  tipo_imovel?: 'residencial' | 'comercial' | 'industrial' | 'rural'
  valor_conta_media?: number
  observacoes?: string
  status_qualificacao?: 'coletando_leve' | 'broadcast_disparado' | 'coletando_profundo' | 'qualificada' | 'escalar_humano'
  perguntas_feitas?: string[]
  projeto_id?: string
  broadcast_disparado_em?: string  // ISO
}

const SYSTEM_PROMPT_MODO_LEVE = `Você é o Assistente de Qualificação da Spin Solar — energia solar em Santa Catarina.
Você atende leads chegando pelo WhatsApp e faz UMA coleta rápida antes de passar pra equipe comercial.

TOM
- Cordial, direto, brasileiro. Sem "prezado", sem "atenciosamente".
- Uma pergunta por vez.
- Não faça perguntas técnicas (tipo de sistema, consumo, tipo de imóvel) nessa fase — deixe pro representante.
- Se cliente pedir humano ou reclamar da IA, escale imediatamente.

MODO LEVE — colete SÓ estes 3 itens, nessa ordem:
  1. nome do cliente
  2. cidade (idealmente cidade + estado)
  3. peça pra ele enviar a foto/PDF da fatura de energia pra adiantar o atendimento
     (se cliente disser que não pode ou não tem, tudo bem — não insista)

QUANDO PASSAR PRA EQUIPE
Assim que tiver nome + cidade, marque status_qualificacao="qualificada" e envie mensagem
avisando que já está passando pra equipe comercial. Nesse ponto o sistema dispara notificação
pros representantes.

DEPOIS DE PASSAR PRA EQUIPE
Se cliente responder de novo (com fatura, dúvida, "oi?"), responda curto:
- Se mandou fatura: agradeça, diga que já anexou ao atendimento
- Se pergunta: "Já estou passando pra equipe, em instantes um representante te chama, tá?"
- Se ele ficar impaciente: peça 5-10 min de paciência
NÃO faça mais perguntas nessa fase.

FORMATO DE SAÍDA — JSON estrito
{
  "contexto_atualizado": {
    "nome_cliente"?: string,
    "cidade"?: string,
    "uf"?: string,
    "fatura_recebida"?: boolean,
    "status_qualificacao": "coletando_leve" | "qualificada" | "escalar_humano"
  },
  "proxima_mensagem": string
}
Retorne SOMENTE o JSON, sem cercas de código.`

const SYSTEM_PROMPT_MODO_PROFUNDO = `Você é o Assistente de Qualificação da Spin Solar. O lead está esperando há mais de 35 minutos
e nenhum representante conseguiu contatar ainda. Sua missão AGORA é manter o lead engajado
enquanto o sistema continua tentando passar pra alguém.

TOM
- Ainda mais empático. Peça desculpas pela demora ("desculpa a espera").
- Cordial, direto. Sem robotização.

O QUE FAZER
- Coletar as informações que ficaram pra trás: tipo de sistema, tipo de imóvel, consumo/valor da conta.
- Uma pergunta por vez. NUNCA pergunte tudo de uma vez.
- Isso ajuda a equipe a chegar mais preparada quando conseguir falar.

QUANDO ENCERRAR
Depois de coletar todos os campos, avise o lead que a equipe já está pronta e vai chamar
em instantes. Marque status_qualificacao="qualificada".

FORMATO DE SAÍDA — JSON estrito (mesmo formato do modo leve, agora com todos os campos):
{
  "contexto_atualizado": {
    "tipo_sistema"?: "on_grid|hibrido|bess|ve_recarga|limpeza|revisao|outro",
    "tipo_imovel"?: "residencial|comercial|industrial|rural",
    "consumo_kwh_mes"?: number,
    "valor_conta_media"?: number,
    "observacoes"?: string,
    "status_qualificacao": "coletando_profundo" | "qualificada" | "escalar_humano"
  },
  "proxima_mensagem": string
}
Retorne SOMENTE o JSON, sem cercas de código.`

type ResultadoQualificacao =
  | { acao: 'perguntou'; texto_enviado: string; contexto: ContextoQualificacao }
  | { acao: 'broadcast_disparado'; projeto_id: string; broadcast_id: string; contexto: ContextoQualificacao }
  | { acao: 'escalada'; contexto: ContextoQualificacao }
  | { acao: 'ignorada'; motivo: string }
  | { erro: string }

export async function processarMensagemQualificacao(
  conversa_id: string,
): Promise<ResultadoQualificacao> {
  // Kalebe 2026-09-16: envs saíram do Vercel e viraram wa_config no Supabase.
  // Leitura via getWaConfig() com cache 30s + fallback pra process.env.
  const cfg = await getWaConfig()
  const apiKey = cfg.anthropic_api_key
  if (!apiKey) return { erro: 'ANTHROPIC_API_KEY não configurada. Cadastre em /admin/whatsapp/config.' }

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('wa_conversas')
    .select(`
      id, status, contato_id, contexto_qualificacao, agente_ativo, agente_id,
      contato:contato_id(id, telefone, nome_exibicao, tipo, cliente_id, projeto_id)
    `)
    .eq('id', conversa_id)
    .maybeSingle()

  if (!conv) return { erro: 'Conversa não encontrada' }
  const contato: any = (conv as any).contato
  if (!contato) return { erro: 'Contato ausente' }

  // Silencia quando humano já assumiu
  if (['em_atendimento', 'encerrada'].includes((conv as any).status)) {
    return { acao: 'ignorada', motivo: 'humano no volante' }
  }

  // Silencia quando o contato é um representante (broadcast bate aqui)
  if (contato.tipo === 'representante' || contato.tipo === 'colaborador') {
    return { acao: 'ignorada', motivo: 'contato interno, não é lead' }
  }

  const contextoAtual: ContextoQualificacao = (conv as any).contexto_qualificacao || {}

  // Últimas msgs pra prompt
  const { data: msgs } = await admin
    .from('wa_mensagens')
    .select('direcao, tipo, texto, criada_em, origem_agente_nome')
    .eq('conversa_id', conversa_id)
    .order('criada_em', { ascending: true })
    .limit(40)

  // Loop protection: última msg outbound = aguardando cliente
  const ultima = msgs?.[msgs.length - 1]
  if (ultima && ultima.direcao === 'outbound') {
    return { acao: 'ignorada', motivo: 'última mensagem é outbound' }
  }

  // Detecta se última msg é imagem/documento — provável fatura
  const detectouFatura = msgs?.slice(-3).some(
    (m) => m.direcao === 'inbound' && ['image', 'document'].includes(m.tipo),
  )
  if (detectouFatura && !contextoAtual.fatura_recebida) {
    contextoAtual.fatura_recebida = true
  }

  // Decide modo
  const modoLeve = contextoAtual.status_qualificacao !== 'coletando_profundo'
  const systemPrompt = await carregarSystemPrompt(admin, modoLeve)

  // Histórico compacto
  const historico = (msgs || []).map((m) => {
    const quem = m.direcao === 'inbound' ? 'Cliente' : (m.origem_agente_nome || 'Agente Spin')
    const t = m.tipo === 'text' ? (m.texto || '') : `[${m.tipo}]`
    return `${quem}: ${t}`
  }).join('\n')

  // Chama Claude
  let resposta: any = null
  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `CONTEXTO ATUAL:
${JSON.stringify(contextoAtual, null, 2)}

HISTÓRICO:
${historico || '(vazio)'}

Leia a última resposta do cliente, extraia info nova, decida próximo passo.
Retorne apenas o JSON.`,
      }],
    })
    const bloco = resp.content?.[0]
    const texto = bloco?.type === 'text' ? (bloco as any).text : ''
    const limpo = String(texto).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    resposta = JSON.parse(limpo)
  } catch (e: any) {
    console.error('[agente-qualificacao]', e)
    return { erro: `IA falhou: ${e?.message || 'parse error'}` }
  }

  const contextoNovo: ContextoQualificacao = {
    ...contextoAtual,
    ...(resposta?.contexto_atualizado || {}),
  }
  const proximaMsg: string = String(resposta?.proxima_mensagem || '').trim()
  const status = contextoNovo.status_qualificacao || 'coletando_leve'

  // Kalebe 2026-09-22: RACE CONDITION FIX. Entre a leitura inicial do status
  // e a chamada ao Claude (que demora 2-10s), o humano pode ter assumido a
  // conversa pelo inbox ou por fora. Re-checa antes de enviar QUALQUER msg
  // pro cliente. Se status virou em_atendimento OU há outbound humana
  // recente, silencia.
  async function agenteAindaPodeFalar(): Promise<boolean> {
    const { data: convAgora } = await admin
      .from('wa_conversas')
      .select('status, responsavel_id')
      .eq('id', conversa_id)
      .maybeSingle()
    if (!convAgora) return false
    if (['em_atendimento', 'encerrada'].includes((convAgora as any).status)) return false
    // Última msg outbound humana nos últimos 90s = humano acabou de responder
    const { data: ultimaHumana } = await admin
      .from('wa_mensagens')
      .select('criada_em, remetente_id')
      .eq('conversa_id', conversa_id)
      .eq('direcao', 'outbound')
      .not('remetente_id', 'is', null)  // humano tem remetente_id, agente não
      .order('criada_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultimaHumana) {
      const idadeMs = Date.now() - new Date((ultimaHumana as any).criada_em).getTime()
      if (idadeMs < 90_000) return false
    }
    return true
  }

  // Persiste contexto
  await admin
    .from('wa_conversas')
    .update({
      contexto_qualificacao: contextoNovo,
      status: (conv as any).status === 'nova' ? 'em_qualificacao' : (conv as any).status,
      agente_ativo: 'qualificacao',
    })
    .eq('id', conversa_id)

  // Escalar
  if (status === 'escalar_humano') {
    if (proximaMsg && await agenteAindaPodeFalar()) {
      await enviarTextoPeloCanal({
        conversa_id,
        telefone: contato.telefone,
        texto: proximaMsg,
        remetente_agente: 'qualificacao',
        origem_agente_nome: 'Assistente Spin',
      })
    }
    await admin
      .from('wa_conversas')
      .update({ status: 'aguardando_representante', agente_ativo: null })
      .eq('id', conversa_id)
    return { acao: 'escalada', contexto: contextoNovo }
  }

  // Ainda coletando (leve ou profundo)
  if (status === 'coletando_leve' || status === 'coletando_profundo') {
    if (proximaMsg) {
      if (!(await agenteAindaPodeFalar())) {
        return { acao: 'ignorada', motivo: 'humano assumiu durante processamento' }
      }
      await enviarTextoPeloCanal({
        conversa_id,
        telefone: contato.telefone,
        texto: proximaMsg,
        remetente_agente: 'qualificacao',
        origem_agente_nome: 'Assistente Spin',
      })
    }
    return { acao: 'perguntou', texto_enviado: proximaMsg, contexto: contextoNovo }
  }

  // status='qualificada'
  //  - Se modo leve: só precisa de nome + cidade
  //  - Se modo profundo (retomada): já disparou broadcast antes, agora só marca
  const jaDisparouBroadcast = !!contextoNovo.projeto_id && !!contextoNovo.broadcast_disparado_em

  // Modo LEVE — nome + cidade obrigatórios
  if (modoLeve && !jaDisparouBroadcast) {
    if (!contextoNovo.nome_cliente || !contextoNovo.cidade) {
      console.warn('[agente-qualificacao] IA marcou qualificada sem nome+cidade:', contextoNovo)
      return { acao: 'ignorada', motivo: 'faltam nome_cliente ou cidade' }
    }

    const projetoId = await criarProjetoDoLead(admin, contato, contextoNovo)
    if (!projetoId) return { erro: 'Falha ao criar projeto' }

    await admin
      .from('wa_contatos')
      .update({ projeto_id: projetoId, tipo: 'lead' })
      .eq('id', contato.id)

    // Manda a msg de fechamento pro lead ANTES do broadcast
    if (proximaMsg && await agenteAindaPodeFalar()) {
      await enviarTextoPeloCanal({
        conversa_id,
        telefone: contato.telefone,
        texto: proximaMsg,
        remetente_agente: 'qualificacao',
        origem_agente_nome: 'Assistente Spin',
      })
    }

    // Dispara broadcast pros representantes
    const resumo = [
      contextoNovo.nome_cliente,
      contextoNovo.cidade,
      contextoNovo.fatura_recebida ? 'fatura anexada' : 'fatura pendente',
    ].filter(Boolean).join(' · ')

    const broadcastResult = await iniciarBroadcastLead({
      conversa_id,
      projeto_id: projetoId,
      contato_id: contato.id,
      resumo,
      contexto_qualificacao: contextoNovo,
    })

    if ('erro' in broadcastResult) {
      console.error('[agente-qualificacao/broadcast]', broadcastResult.erro)
      return { erro: broadcastResult.erro }
    }

    // Marca contexto pra cron não redispara
    await admin
      .from('wa_conversas')
      .update({
        status: 'aguardando_representante',
        agente_ativo: null,
        contexto_qualificacao: {
          ...contextoNovo,
          projeto_id: projetoId,
          broadcast_disparado_em: new Date().toISOString(),
          status_qualificacao: 'broadcast_disparado',
        },
      })
      .eq('id', conversa_id)

    return {
      acao: 'broadcast_disparado',
      projeto_id: projetoId,
      broadcast_id: broadcastResult.broadcast_id,
      contexto: contextoNovo,
    }
  }

  // Modo PROFUNDO qualificado — só atualiza projeto com info extra + envia msg
  if (!modoLeve && jaDisparouBroadcast && contextoNovo.projeto_id) {
    if (proximaMsg && await agenteAindaPodeFalar()) {
      await enviarTextoPeloCanal({
        conversa_id,
        telefone: contato.telefone,
        texto: proximaMsg,
        remetente_agente: 'qualificacao',
        origem_agente_nome: 'Assistente Spin',
      })
    }
    await atualizarProjetoComContextoProfundo(admin, contextoNovo.projeto_id, contextoNovo)
    return { acao: 'ignorada', motivo: 'qualificação profunda concluída' }
  }

  return { acao: 'ignorada', motivo: `status ${status} sem ação` }
}

/**
 * Puxa system_prompt de wa_agentes (chave 'qualificacao_padrao').
 * Fallback pra prompts hardcoded se tabela vazia.
 */
async function carregarSystemPrompt(
  admin: ReturnType<typeof createAdminClient>,
  modoLeve: boolean,
): Promise<string> {
  try {
    const { data: agente } = await admin
      .from('wa_agentes')
      .select('system_prompt')
      .eq('chave', modoLeve ? 'qualificacao_padrao' : 'qualificacao_profunda')
      .eq('ativo', true)
      .maybeSingle()
    if (agente?.system_prompt) return agente.system_prompt
  } catch (e) {
    // fallback
  }
  return modoLeve ? SYSTEM_PROMPT_MODO_LEVE : SYSTEM_PROMPT_MODO_PROFUNDO
}

async function criarProjetoDoLead(
  admin: ReturnType<typeof createAdminClient>,
  contato: any,
  ctx: ContextoQualificacao,
): Promise<string | null> {
  // Sem tipo_sistema no modo leve, cai como on_grid default. Rep ajusta depois.
  const tipoProjeto = ctx.tipo_sistema === 'hibrido' ? 'hibrido'
    : ctx.tipo_sistema === 'bess' ? 'bess'
    : ctx.tipo_sistema === 'limpeza' ? 'limpeza'
    : ctx.tipo_sistema === 'revisao' ? 'revisao'
    : ctx.tipo_sistema === 've_recarga' ? 've_recarga'
    : 'on_grid'

  const observacoes = [
    `Origem: WhatsApp qualificação IA (modo leve)`,
    `Telefone: ${contato.telefone}`,
    ctx.fatura_recebida && `Fatura anexada na conversa`,
    !ctx.fatura_recebida && `Fatura pendente — pedir na 1ª abordagem`,
  ].filter(Boolean).join(' · ')

  const { data, error } = await admin
    .from('projetos')
    .insert({
      cliente_razao_social: ctx.nome_cliente || contato.nome_exibicao || 'Lead WhatsApp',
      cliente_telefone: contato.telefone,
      tipo_projeto: tipoProjeto,
      status: 'rascunho',
      origem_lead: 'lead_spin',
      criado_por_role: 'sdr',
      cliente_endereco: { cidade: ctx.cidade || null, uf: ctx.uf || null },
      analise_fatura: {
        origem_qualificacao_whatsapp: true,
        contexto: ctx,
      },
      observacoes,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[criarProjetoDoLead]', error)
    return null
  }
  return data.id
}

async function atualizarProjetoComContextoProfundo(
  admin: ReturnType<typeof createAdminClient>,
  projeto_id: string,
  ctx: ContextoQualificacao,
) {
  await admin
    .from('projetos')
    .update({
      tipo_projeto: ctx.tipo_sistema === 'hibrido' ? 'hibrido'
        : ctx.tipo_sistema === 'bess' ? 'bess'
        : ctx.tipo_sistema === 'limpeza' ? 'limpeza'
        : ctx.tipo_sistema === 'revisao' ? 'revisao'
        : ctx.tipo_sistema === 've_recarga' ? 've_recarga'
        : 'on_grid',
      analise_fatura: {
        origem_qualificacao_whatsapp: true,
        contexto: ctx,
      },
      observacoes: `Origem: WhatsApp · qualificação profunda após ${RETOMADA_MIN}min sem contato`,
    })
    .eq('id', projeto_id)
}
