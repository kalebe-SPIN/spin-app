import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarTextoPeloCanal } from './enviar-canal'

/**
 * Agente de qualificação de leads WhatsApp (Sprint 2).
 *
 * Kalebe 2026-09-12: 'através de um agente de qualificação e criar um
 * card de projeto e depois disso ele dispara para todos os representantes'.
 *
 * Este arquivo só cuida da qualificação. Distribuição pros representantes
 * fica no Sprint 3 (broadcast + SLA 8min).
 *
 * FLUXO
 *   msg inbound → webhook chama processarMensagemQualificacao(conversa_id, texto)
 *   1. Lê conversa + últimas 20 mensagens
 *   2. Chama Claude Haiku pra:
 *      - extrair info nova da última resposta do cliente
 *      - decidir se já tem info suficiente
 *      - se sim: retorna acao='criar_projeto' + resumo pra representante
 *      - se não: retorna acao='perguntar' + próxima pergunta
 *   3. Grava contexto_qualificacao atualizado na conversa
 *   4. Envia próxima pergunta OU cria projeto+muda status
 *
 * DADOS QUE PRECISAM SER COLETADOS (mínimo pra qualificar)
 *   - nome_cliente
 *   - cidade (idealmente cidade + UF)
 *   - tipo_sistema ('on_grid'|'hibrido'|'bess'|'ve_recarga'|'limpeza'|
 *                   'revisao'|'outro')
 *   - consumo_kwh_mes    (opcional — só se cliente souber)
 *   - tipo_imovel        ('residencial'|'comercial'|'industrial'|'rural')
 *   - valor_conta_media  (opcional — R$/mês)
 */

const CAMPOS_OBRIGATORIOS = ['nome_cliente', 'cidade', 'tipo_sistema', 'tipo_imovel'] as const
type CampoObrigatorio = typeof CAMPOS_OBRIGATORIOS[number]

type ContextoQualificacao = {
  nome_cliente?: string
  cidade?: string
  uf?: string
  tipo_sistema?: 'on_grid' | 'hibrido' | 'bess' | 've_recarga' | 'limpeza' | 'revisao' | 'outro'
  consumo_kwh_mes?: number
  tipo_imovel?: 'residencial' | 'comercial' | 'industrial' | 'rural'
  valor_conta_media?: number
  observacoes?: string
  status_qualificacao?: 'coletando' | 'qualificada' | 'escalar_humano'
  perguntas_feitas?: string[]
}

const NOME_AGENTE = 'Assistente Spin'

const SYSTEM_PROMPT = `Você é o Assistente de Qualificação da Spin Solar — empresa de energia solar em Santa Catarina.
Seu papel: qualificar leads chegando pelo WhatsApp da empresa.

TOM
- Cordial, direto, brasileiro. Sem "prezado", sem "atenciosamente".
- Uma pergunta por vez. Nada de listas gigantes.
- Se o cliente já respondeu algo em conversas anteriores, NÃO peça de novo.
- Se ele mandar áudio ou imagem que você não conseguir ler, peça pra digitar.
- Se pedir pra falar com humano ou reclamar da IA, escale imediatamente.

COMO QUALIFICAR
Colete NA SEGUINTE ORDEM:
  1. nome (se ainda não sabe)
  2. cidade + estado (pra saber HSP e distância)
  3. tipo de sistema (on_grid, hibrido, bess, ve_recarga, limpeza, revisao ou outro)
     - explique brevemente cada opção só se o cliente perguntar
  4. tipo de imóvel (residencial, comercial, industrial ou rural)
  5. consumo médio ou valor da conta (opcional — só pergunta se já tem os 4 anteriores)

QUANDO ENCERRAR
Assim que tiver os 4 campos obrigatórios (nome, cidade, tipo_sistema, tipo_imovel),
avise o cliente que vai passar pra um representante e defina status_qualificacao='qualificada'.

EXTRAÇÃO DE DADOS
Sempre atualize APENAS os campos que a última resposta do cliente esclareceu.
Não invente. Se não deu pra entender, deixe o campo em branco e pergunte de novo.

FORMATO DE SAÍDA
Você DEVE responder com um JSON VÁLIDO com essa estrutura:
{
  "contexto_atualizado": {
    "nome_cliente"?: string,
    "cidade"?: string,
    "uf"?: string (2 letras),
    "tipo_sistema"?: "on_grid" | "hibrido" | "bess" | "ve_recarga" | "limpeza" | "revisao" | "outro",
    "consumo_kwh_mes"?: number,
    "tipo_imovel"?: "residencial" | "comercial" | "industrial" | "rural",
    "valor_conta_media"?: number,
    "observacoes"?: string,
    "status_qualificacao": "coletando" | "qualificada" | "escalar_humano"
  },
  "proxima_mensagem": string   // O QUE mandar pro cliente agora. Se status_qualificacao != 'coletando', é a msg de "aguarde que já vou passar pra um representante".
}

Retorne SOMENTE o JSON, sem cercas de código, sem comentários.`

type ResultadoQualificacao =
  | { acao: 'perguntou'; texto_enviado: string; contexto: ContextoQualificacao }
  | { acao: 'qualificada'; projeto_id: string; contexto: ContextoQualificacao }
  | { acao: 'escalada'; contexto: ContextoQualificacao }
  | { acao: 'ignorada'; motivo: string }
  | { erro: string }

export async function processarMensagemQualificacao(
  conversa_id: string,
): Promise<ResultadoQualificacao> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { erro: 'ANTHROPIC_API_KEY não configurada' }

  const admin = createAdminClient()

  // Busca conversa + contato
  const { data: conv } = await admin
    .from('wa_conversas')
    .select(`
      id, status, contato_id, contexto_qualificacao, agente_ativo,
      contato:contato_id(id, telefone, nome_exibicao, tipo, cliente_id, projeto_id)
    `)
    .eq('id', conversa_id)
    .maybeSingle()

  if (!conv) return { erro: 'Conversa não encontrada' }
  const contato: any = (conv as any).contato
  if (!contato) return { erro: 'Contato ausente' }

  // Só qualifica conversa 'nova' ou 'em_qualificacao'. Se já tem responsável,
  // sai fora (humano no comando).
  if (!['nova', 'em_qualificacao'].includes((conv as any).status)) {
    return { acao: 'ignorada', motivo: 'conversa não está em qualificação' }
  }

  // Carrega últimas 20 mensagens pra contexto do prompt
  const { data: msgs } = await admin
    .from('wa_mensagens')
    .select('direcao, tipo, texto, criada_em, origem_agente_nome')
    .eq('conversa_id', conversa_id)
    .order('criada_em', { ascending: true })
    .limit(30)

  // Se a última mensagem já é outbound do próprio agente, não faz nada (evita loop)
  const ultima = msgs?.[msgs.length - 1]
  if (ultima && ultima.direcao === 'outbound') {
    return { acao: 'ignorada', motivo: 'última mensagem é outbound — aguardando cliente' }
  }

  const contextoAtual: ContextoQualificacao = (conv as any).contexto_qualificacao || {}

  // Constrói histórico compacto pra Claude
  const historico = (msgs || []).map((m) => {
    const quem = m.direcao === 'inbound'
      ? 'Cliente'
      : (m.origem_agente_nome || 'Agente Spin')
    const t = m.tipo === 'text' ? (m.texto || '') : `[${m.tipo}]`
    return `${quem}: ${t}`
  }).join('\n')

  // Chama Claude Haiku
  let resposta: any = null
  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `CONTEXTO ATUAL DA QUALIFICAÇÃO (o que já sabemos):
${JSON.stringify(contextoAtual, null, 2)}

HISTÓRICO DA CONVERSA:
${historico || '(vazio)'}

TAREFA: leia a última resposta do cliente, extraia info nova, decida próximo passo.
Retorne apenas o JSON no formato definido.`,
      }],
    })
    const bloco = resp.content?.[0]
    const texto = bloco?.type === 'text' ? (bloco as any).text : ''
    // Remove cercas ```json se vieram
    const limpo = String(texto).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    resposta = JSON.parse(limpo)
  } catch (e: any) {
    console.error('[agente-qualificacao] Claude/parse', e)
    return { erro: `IA falhou: ${e?.message || 'parse error'}` }
  }

  const contextoNovo: ContextoQualificacao = {
    ...contextoAtual,
    ...(resposta?.contexto_atualizado || {}),
  }
  const proximaMsg: string = String(resposta?.proxima_mensagem || '').trim()
  const status = contextoNovo.status_qualificacao || 'coletando'

  // Persiste contexto sempre
  await admin
    .from('wa_conversas')
    .update({
      contexto_qualificacao: contextoNovo,
      status: 'em_qualificacao',
      agente_ativo: 'qualificacao',
    })
    .eq('id', conversa_id)

  // Escalar pra humano (cliente pediu ou IA decidiu)
  if (status === 'escalar_humano') {
    if (proximaMsg) {
      await enviarTextoPeloCanal({
        conversa_id,
        telefone: contato.telefone,
        texto: proximaMsg,
        remetente_agente: 'qualificacao',
        origem_agente_nome: NOME_AGENTE,
      })
    }
    await admin
      .from('wa_conversas')
      .update({
        status: 'aguardando_representante',
        agente_ativo: null,
      })
      .eq('id', conversa_id)
    return { acao: 'escalada', contexto: contextoNovo }
  }

  // Ainda coletando — só envia a próxima pergunta
  if (status === 'coletando') {
    if (proximaMsg) {
      await enviarTextoPeloCanal({
        conversa_id,
        telefone: contato.telefone,
        texto: proximaMsg,
        remetente_agente: 'qualificacao',
        origem_agente_nome: NOME_AGENTE,
      })
    }
    return { acao: 'perguntou', texto_enviado: proximaMsg, contexto: contextoNovo }
  }

  // Qualificada — cria projeto + muda status pra aguardando_representante
  if (status === 'qualificada') {
    // Sanity: precisa dos 4 obrigatórios. Se faltar, volta pra coletando.
    const faltando = CAMPOS_OBRIGATORIOS.filter((c) => !contextoNovo[c])
    if (faltando.length > 0) {
      console.warn('[agente-qualificacao] IA marcou qualificada mas faltam campos:', faltando)
      return { acao: 'ignorada', motivo: `IA marcou qualificada mas faltam: ${faltando.join(', ')}` }
    }

    const projetoId = await criarProjetoDoLead(admin, contato, contextoNovo)
    if (!projetoId) return { erro: 'Falha ao criar projeto' }

    // Vincula contato ao projeto pra próximas mensagens já saberem
    await admin
      .from('wa_contatos')
      .update({ projeto_id: projetoId, tipo: 'lead' })
      .eq('id', contato.id)

    // Envia msg de fechamento pro cliente (avisando que vai passar)
    if (proximaMsg) {
      await enviarTextoPeloCanal({
        conversa_id,
        telefone: contato.telefone,
        texto: proximaMsg,
        remetente_agente: 'qualificacao',
        origem_agente_nome: NOME_AGENTE,
      })
    }

    // Muda status pra aguardando_representante (Sprint 3 pega daqui)
    await admin
      .from('wa_conversas')
      .update({
        status: 'aguardando_representante',
        agente_ativo: null,
      })
      .eq('id', conversa_id)

    return { acao: 'qualificada', projeto_id: projetoId, contexto: contextoNovo }
  }

  return { acao: 'ignorada', motivo: `status desconhecido: ${status}` }
}

/**
 * Cria projeto minimamente preenchido a partir do contexto qualificado.
 * Retorna projeto.id ou null em erro.
 *
 * origem_lead='lead_spin' + criado_por_role='sdr' (via trigger da migration 104).
 * consultor_id=null → pool pra distribuição (Sprint 3).
 */
async function criarProjetoDoLead(
  admin: ReturnType<typeof createAdminClient>,
  contato: any,
  ctx: ContextoQualificacao,
): Promise<string | null> {
  // Mapeia tipo_sistema → tipo_projeto do enum antigo (mantém compat com CRM)
  const tipoProjeto = ctx.tipo_sistema === 'hibrido' ? 'hibrido'
    : ctx.tipo_sistema === 'bess' ? 'bess'
    : ctx.tipo_sistema === 'limpeza' ? 'limpeza'
    : ctx.tipo_sistema === 'revisao' ? 'revisao'
    : ctx.tipo_sistema === 've_recarga' ? 've_recarga'
    : 'on_grid'  // default

  const observacoes = [
    ctx.observacoes,
    ctx.tipo_imovel && `Imóvel: ${ctx.tipo_imovel}`,
    ctx.consumo_kwh_mes && `Consumo declarado: ${ctx.consumo_kwh_mes} kWh/mês`,
    ctx.valor_conta_media && `Valor conta médio: R$ ${ctx.valor_conta_media}`,
    `Origem: WhatsApp qualificação IA`,
    `Telefone: ${contato.telefone}`,
  ].filter(Boolean).join(' · ')

  const { data, error } = await admin
    .from('projetos')
    .insert({
      cliente_razao_social: ctx.nome_cliente || contato.nome_exibicao || 'Lead WhatsApp',
      cliente_telefone: contato.telefone,
      tipo_projeto: tipoProjeto,
      status: 'rascunho',
      origem_lead: 'lead_spin',   // trigger da 104 aceita
      criado_por_role: 'sdr',     // Bianca-like: SDR = qualificação IA
      // Endereço do cliente (só cidade/UF por enquanto)
      cliente_endereco: {
        cidade: ctx.cidade || null,
        uf: ctx.uf || null,
      },
      // Contexto full em jsonb pra o representante consultar
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
