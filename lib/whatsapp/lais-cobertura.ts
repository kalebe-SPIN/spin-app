import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from './config'
import { enviarTextoPeloCanal } from './enviar-canal'
import { gravarMensagem } from './conversas'
import { anexosNovosDoCliente } from './anexos-ia'
import { avisarUsuario, cadastroDoContato } from '@/lib/agentes/diretorio'
import { NOME_SDR, URL_PORTAL } from '@/lib/agentes/nomes'
import { transcricaoDaConversa, resumirConversa, cortar } from './resumo-conversa'

/**
 * Laís cobrindo o usuário (Kalebe 2026-10-09): "um botão de acionamento para
 * assumir um atendimento no lugar do usuário, para o caso do usuário não poder
 * atender na hora. Ela lê toda a conversa daquele dia e segue o atendimento
 * dizendo que depois vai passar para o usuário a demanda que surgir."
 *
 * - Liga: botão "🤖 Laís assume" no Spinzap (wa_conversas.lais_cobrindo_desde).
 * - Cada mensagem do cliente → a Laís lê a conversa do dia e responde, sem
 *   prometer preço/prazo/condição; pendências viram "demandas" (aviso pro
 *   usuário + lista na devolução).
 * - Desliga: botão "Retomar", ou o usuário escreve pelo Spinzap ou pelo celular.
 */

type Admin = ReturnType<typeof createAdminClient>
type Demanda = { texto: string; em: string }

/** 00:00 de hoje em Brasília (sem horário de verão desde 2019). */
function inicioDoDiaBRT(d = new Date()): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return new Date(`${dia}T00:00:00-03:00`).toISOString()
}
const horaBRT = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const primeiroNome = (s: string | null | undefined) => String(s || '').trim().split(/\s+/)[0] || ''

function extrairJson(texto: string): any {
  const limpo = String(texto || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try { return JSON.parse(limpo) } catch { /* recorte abaixo */ }
  const ini = limpo.indexOf('{'); const fim = limpo.lastIndexOf('}')
  if (ini >= 0 && fim > ini) return JSON.parse(limpo.slice(ini, fim + 1))
  throw new Error('resposta da IA sem JSON')
}

function promptCobertura(nome: string, primeira: boolean): string {
  return `Você é a Laís, do atendimento da Spin Solar (energia solar, baterias, recarga de carro elétrico e serviços elétricos em Santa Catarina).
${nome} estava atendendo este cliente pelo WhatsApp e precisou se ausentar. A pedido de ${nome}, você assume a conversa agora e segue o atendimento no lugar.

O QUE FAZER
- Leia toda a conversa de hoje e continue de onde parou, com naturalidade — o cliente não precisa repetir nada.
- ${primeira
    ? `Esta é a sua primeira mensagem: apresente-se ("Aqui é a Laís, da Spin Solar"), diga que vai seguir com o atendimento por aqui e que vai passar para ${nome} tudo o que surgir.`
    : 'Você já se apresentou nesta conversa; não repita a apresentação.'}
- Resolva o que der com o que já está na conversa: confirmar recebimento, tirar dúvidas gerais, pedir fotos, fatura, endereço ou o melhor horário para o retorno.
- NUNCA invente nem prometa preço, desconto, prazo, data de visita ou de instalação, condição de pagamento ou detalhe técnico que não esteja na conversa. Nesses casos diga que anotou e que ${nome} retorna com a resposta.
- Sempre que surgir um pedido, dúvida ou pendência que ${nome} vai precisar resolver, escreva em "demanda" (1 frase curta, para a equipe interna). Se não surgiu nada novo, "demanda": null.
- Áudio você não consegue ouvir: diga que recebeu e que ${nome} vai ouvir; registre em "demanda".
- Fotos e PDFs que vierem anexados: olhe o conteúdo e use o que der.
- Se a última mensagem do cliente só encerra ou agradece ("ok", "obrigado", emoji), responda bem curto ou deixe "mensagem" vazia.
- Nunca passe dados de outros clientes nem telefone ou dados pessoais da equipe.
- Tom de WhatsApp: cordial, direto, português do Brasil, mensagens curtas, uma pergunta por vez, sem "prezado".
- Nunca diga que é robô ou IA, a menos que perguntem diretamente — aí seja honesta.

FORMATO — responda SOMENTE este JSON:
{"mensagem": "texto para o cliente (ou vazio)", "demanda": "pendência nova para ${nome} ou null"}`
}

export async function processarCoberturaLais(conversa_id: string): Promise<
  { acao: 'respondeu' | 'ignorada'; motivo?: string } | { erro: string }
> {
  const admin = createAdminClient()
  const { data: conv, error } = await admin
    .from('wa_conversas')
    .select(`
      id, encerrada_em, janela_24h_expira_em, lais_cobrindo_desde, lais_cobrindo_por, responsavel_id, contexto_qualificacao,
      contato:contato_id(id, telefone, nome_exibicao, cliente_id, projeto_id),
      cobrindo:lais_cobrindo_por(nome_completo),
      responsavel:responsavel_id(nome_completo)
    `)
    .eq('id', conversa_id)
    .maybeSingle()
  const c: any = conv
  if (error || !c?.lais_cobrindo_desde) return { acao: 'ignorada', motivo: 'sem cobertura' }
  if (c.encerrada_em) return { acao: 'ignorada', motivo: 'conversa encerrada' }
  const contato = c.contato
  if (!contato?.telefone) return { erro: 'Contato sem telefone' }

  // Conversa do dia (ou desde o início da cobertura, se começou antes)
  const hoje = inicioDoDiaBRT()
  const desde = c.lais_cobrindo_desde < hoje ? c.lais_cobrindo_desde : hoje
  const { data: desc } = await admin
    .from('wa_mensagens')
    .select('direcao, tipo, texto, criada_em, origem_agente_nome, remetente_agente, midia_url, midia_mime, remetente:remetente_id(nome_completo)')
    .eq('conversa_id', conversa_id)
    .gte('criada_em', desde)
    .order('criada_em', { ascending: false })
    .limit(120)
  // Registros internos (tipo system) não entram na conversa com o cliente
  const msgs = ((desc || []) as any[]).reverse().filter((m) => m.tipo !== 'system')
  const ultima = msgs[msgs.length - 1]
  if (!ultima) return { acao: 'ignorada', motivo: 'sem mensagens hoje' }
  if (ultima.direcao !== 'inbound') return { acao: 'ignorada', motivo: 'aguardando o cliente' }
  if (c.janela_24h_expira_em && new Date(c.janela_24h_expira_em) < new Date()) {
    return { acao: 'ignorada', motivo: 'janela de 24h fechada' }
  }

  const nome = primeiroNome(c.cobrindo?.nome_completo || c.responsavel?.nome_completo) || 'o consultor'
  const primeira = !msgs.some((m) => m.direcao === 'outbound' && m.remetente_agente === 'qualificacao' && m.criada_em >= c.lais_cobrindo_desde)
  const anexos = await anexosNovosDoCliente(msgs)
  const linhas = msgs.map((m) => {
    const quem = m.direcao === 'inbound' ? 'Cliente' : (m.origem_agente_nome || primeiroNome(m.remetente?.nome_completo) || 'Spin')
    const anexado = anexos.some((a) => a.url === m.midia_url)
    const t = ['text', 'interactive', 'button'].includes(m.tipo) ? (m.texto || '')
      : m.tipo === 'audio' ? '[áudio — você não consegue ouvir]'
      : m.tipo === 'image' ? (anexado ? '[foto — anexada abaixo]' : `[foto${m.texto ? `: ${m.texto}` : ''}]`)
      : m.tipo === 'document' ? `[arquivo: ${m.texto || 'documento'}${anexado ? ' — anexado abaixo' : ''}]`
      : `[${m.tipo}${m.texto ? `: ${m.texto}` : ''}]`
    return `${horaBRT(m.criada_em)} ${quem}: ${t}`
  })
  const cadastro = await cadastroDoContato(admin, contato).catch(() => null)
  const textoPrompt = [
    `CLIENTE: ${contato.nome_exibicao || 'sem nome no WhatsApp'}`,
    cadastro ? `CADASTRO DESTE CLIENTE (só dele):\n${JSON.stringify(cadastro)}` : null,
    `CONVERSA DE HOJE:\n${linhas.join('\n').slice(-12000)}`,
    'Responda à última mensagem do cliente. Retorne só o JSON.',
  ].filter(Boolean).join('\n\n')

  const { anthropic_api_key } = await getWaConfig()
  if (!anthropic_api_key) return { erro: 'Chave da IA não configurada' }
  let resposta: any
  try {
    const anthropic = new Anthropic({ apiKey: anthropic_api_key })
    const chamar = (comAnexos: boolean) => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: promptCobertura(nome, primeira),
      messages: [{
        role: 'user',
        content: comAnexos && anexos.length
          ? [
              ...anexos.map((a): Anthropic.ContentBlockParam => a.tipo === 'image'
                ? { type: 'image', source: { type: 'url', url: a.url } }
                : { type: 'document', source: { type: 'url', url: a.url } }),
              { type: 'text', text: textoPrompt },
            ]
          : textoPrompt,
      }],
    })
    const consultar = async () => {
      const r = await chamar(true).catch((e) => { if (!anexos.length) throw e; return chamar(false) })
      return extrairJson((r.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join(''))
    }
    try { resposta = await consultar() } catch {
      await new Promise((ok) => setTimeout(ok, 1500))
      resposta = await consultar()
    }
  } catch (e: any) {
    console.error('[lais-cobertura]', e)
    const { avisarFalhaIA } = await import('@/lib/ia/erros')
    await avisarFalhaIA(e, 'Laís (cobrindo atendimento)')
    return { erro: `IA falhou: ${e?.message || 'sem resposta'}` }
  }

  // A cobertura pode ter acabado enquanto a IA pensava (usuário voltou)
  const { data: ainda } = await admin.from('wa_conversas').select('lais_cobrindo_desde').eq('id', conversa_id).maybeSingle()
  if (!(ainda as any)?.lais_cobrindo_desde) return { acao: 'ignorada', motivo: 'usuário retomou' }

  const texto = String(resposta?.mensagem || '').trim()
  if (texto) {
    const r = await enviarTextoPeloCanal({
      conversa_id, telefone: contato.telefone, texto,
      remetente_agente: 'qualificacao', origem_agente_nome: NOME_SDR,
    })
    if ('erro' in r) console.error('[lais-cobertura] envio', r.erro)
  }

  const demanda = String(resposta?.demanda || '').trim()
  if (demanda && demanda.toLowerCase() !== 'null') {
    const ctx = c.contexto_qualificacao || {}
    const demandas: Demanda[] = [...(ctx.cobertura_demandas || []), { texto: demanda.slice(0, 300), em: new Date().toISOString() }]
    await admin.from('wa_conversas').update({ contexto_qualificacao: { ...ctx, cobertura_demandas: demandas } }).eq('id', conversa_id)
    if (c.lais_cobrindo_por) {
      await avisarUsuario({
        destinatario_id: c.lais_cobrindo_por,
        agente: 'qualificacao',
        titulo: 'Demanda anotada pela Laís',
        mensagem: [
          `📝 *${contato.nome_exibicao || 'Cliente'}*: ${cortar(demanda, 300)}`,
          'A Laís segue com o cliente até você retomar.',
          `🔗 Conversa: ${URL_PORTAL}/spinzap?c=${conversa_id}`,
        ].join('\n'),
        conversa_id,
        projeto_id: contato.projeto_id || null,
      }).catch((e) => console.error('[lais-cobertura] aviso', e))
    }
  }
  return texto ? { acao: 'respondeu' } : { acao: 'ignorada', motivo: 'nada a responder' }
}

/**
 * Fim da cobertura: o usuário retomou (botão, Spinzap ou celular). Registra na
 * conversa o que aconteceu e as demandas anotadas. `resumir: false` pula o
 * resumo da IA (quando o usuário já está escrevendo — não segura o envio).
 */
export async function encerrarCoberturaLais(
  admin: Admin,
  conversa_id: string,
  opcoes: { resumir?: boolean; por_id?: string | null; motivo?: string } = {},
): Promise<{ resumo: string | null; demandas: string[]; para: string | null } | null> {
  const { data: conv, error } = await admin.from('wa_conversas')
    .select('lais_cobrindo_desde, lais_cobrindo_por, contexto_qualificacao, cobrindo:lais_cobrindo_por(nome_completo)')
    .eq('id', conversa_id).maybeSingle()
  const c: any = conv
  if (error || !c?.lais_cobrindo_desde) return null

  const ctx = c.contexto_qualificacao || {}
  const demandas = ((ctx.cobertura_demandas || []) as Demanda[])
    .filter((d) => d.em >= c.lais_cobrindo_desde).map((d) => d.texto)
  const { cobertura_demandas: _fora, ...ctxSem } = ctx
  // Desliga antes do resumo: a próxima mensagem do cliente já não cai na Laís
  await admin.from('wa_conversas').update({
    lais_cobrindo_desde: null, lais_cobrindo_por: null, agente_ativo: null, contexto_qualificacao: ctxSem,
  }).eq('id', conversa_id)

  let resumo: string | null = null
  if (opcoes.resumir !== false) {
    const { linhas } = await transcricaoDaConversa(admin, conversa_id, { desde: c.lais_cobrindo_desde, limite: 60 })
    if (linhas.some((l) => l.startsWith('Cliente:'))) resumo = await resumirConversa(linhas, 'atendimento')
  }

  const para = primeiroNome(c.cobrindo?.nome_completo) || null
  await gravarMensagem(admin, {
    conversa_id, direcao: 'outbound', tipo: 'system',
    texto: [
      `🤖 Laís devolveu o atendimento${para ? ` para ${para}` : ''}${opcoes.motivo ? ` (${opcoes.motivo})` : ''}.`,
      resumo ? `📝 ${resumo}` : null,
      demandas.length ? `Demandas anotadas:\n${demandas.map((d) => `• ${d}`).join('\n')}` : 'Nenhuma demanda nova anotada.',
    ].filter(Boolean).join('\n'),
    remetente_id: opcoes.por_id || null, origem_agente_nome: 'Spinzap', status_entrega: 'enviada',
  })
  return { resumo, demandas, para }
}
