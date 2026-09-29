import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from '@/lib/whatsapp/config'
import { enviarTextoPeloCanal } from '@/lib/whatsapp/enviar-canal'
import { avisarUsuario } from '@/lib/agentes/diretorio'

/**
 * Follow-ups agendados na conversa (Kalebe 2026-09-29). Roda a cada 5 min
 * (pg_cron → /api/cron/followups). Pra cada follow-up vencido:
 *   - cliente respondeu depois do agendamento (e marcou "cancelar se
 *     responder") → cancela e avisa o responsável
 *   - janela de 24h fechada → não dá pra mandar texto livre: avisa o
 *     responsável pra chamar pelo celular (status aguardando_humano)
 *   - senão a Bianca envia (texto exato ou escrito por ela) e avisa
 */

const LIMITE_POR_RODADA = 15

export async function executarFollowupsVencidos() {
  const admin = createAdminClient()
  const { data: fila } = await admin
    .from('wa_followups')
    .select('*')
    .eq('status', 'agendado')
    .lte('executar_em', new Date().toISOString())
    .order('executar_em')
    .limit(LIMITE_POR_RODADA)

  const resultado = { vencidos: (fila || []).length, enviados: 0, cancelados: 0, aguardando_humano: 0, falhas: 0 }

  for (const f of fila || []) {
    // Trava otimista: só segue quem conseguir tirar do 'agendado' (evita envio duplo)
    const { data: pego } = await admin
      .from('wa_followups')
      .update({ status: 'falhou', motivo: 'processando' })
      .eq('id', f.id)
      .eq('status', 'agendado')
      .select('id')
    if (!pego?.length) continue

    try {
      const r = await executarUm(admin, f)
      resultado[r] += 1
    } catch (e: any) {
      resultado.falhas += 1
      await admin.from('wa_followups')
        .update({ status: 'falhou', motivo: String(e?.message || e).slice(0, 300), executado_em: new Date().toISOString() })
        .eq('id', f.id)
    }
  }
  return resultado
}

async function executarUm(
  admin: ReturnType<typeof createAdminClient>,
  f: any,
): Promise<'enviados' | 'cancelados' | 'aguardando_humano' | 'falhas'> {
  const agora = new Date().toISOString()
  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, janela_24h_expira_em, contato:contato_id(telefone, nome_exibicao)')
    .eq('id', f.conversa_id)
    .maybeSingle()
  const contato: any = (conv as any)?.contato
  if (!conv || !contato?.telefone) {
    await admin.from('wa_followups').update({ status: 'falhou', motivo: 'Conversa ou telefone não encontrado', executado_em: agora }).eq('id', f.id)
    return 'falhas'
  }
  const nomeCliente = contato.nome_exibicao || contato.telefone

  // 1) Cliente respondeu depois que o follow-up foi agendado?
  if (f.cancelar_se_responder) {
    const { data: resposta } = await admin
      .from('wa_mensagens')
      .select('id')
      .eq('conversa_id', f.conversa_id)
      .eq('direcao', 'inbound')
      .gt('criada_em', f.criado_em)
      .limit(1)
    if (resposta?.length) {
      await admin.from('wa_followups').update({ status: 'cancelado', motivo: 'Cliente respondeu antes', executado_em: agora }).eq('id', f.id)
      await avisar(f, `O follow-up com ${nomeCliente} foi cancelado: o cliente respondeu antes da hora marcada. Dá uma olhada na conversa.`)
      return 'cancelados'
    }
  }

  // 2) Janela de 24h fechada → só modelo aprovado; passa pro humano
  const janelaAberta = !!conv.janela_24h_expira_em && new Date(conv.janela_24h_expira_em) > new Date()
  if (!janelaAberta) {
    await admin.from('wa_followups').update({ status: 'aguardando_humano', motivo: 'Janela de 24h fechada', executado_em: agora }).eq('id', f.id)
    await avisar(f, `Hora do follow-up com ${nomeCliente}, mas o cliente não fala com o número da Spin há mais de 24h — o WhatsApp não deixa a Bianca mandar. Chama pelo celular.${f.modo === 'texto_exato' ? `\n\nMensagem combinada: "${f.mensagem}"` : `\n\nObjetivo: ${f.mensagem}`}`, true)
    return 'aguardando_humano'
  }

  // 3) Monta o texto e envia
  const texto = f.modo === 'texto_exato' ? String(f.mensagem).trim() : await biancaEscreve(admin, f, nomeCliente)
  if (!texto) throw new Error('Bianca não conseguiu escrever a mensagem')

  const envio = await enviarTextoPeloCanal({
    conversa_id: f.conversa_id,
    telefone: contato.telefone,
    texto,
    remetente_agente: 'bianca',
    origem_agente_nome: 'Bianca',
  })
  if ('erro' in envio) throw new Error(envio.erro)

  await admin.from('wa_followups').update({ status: 'enviado', texto_enviado: texto, motivo: null, executado_em: agora }).eq('id', f.id)
  await avisar(f, `Bianca mandou o follow-up pra ${nomeCliente}:\n\n"${texto}"`)
  return 'enviados'
}

async function biancaEscreve(admin: ReturnType<typeof createAdminClient>, f: any, nomeCliente: string): Promise<string> {
  const cfg = await getWaConfig()
  if (!cfg.anthropic_api_key) throw new Error('Chave da Anthropic não configurada')
  const { data: resp } = await admin.from('profiles').select('nome_completo').eq('id', f.responsavel_id).maybeSingle()
  const { data: msgsDesc } = await admin
    .from('wa_mensagens')
    .select('direcao, tipo, texto, origem_agente_nome')
    .eq('conversa_id', f.conversa_id)
    .order('criada_em', { ascending: false })
    .limit(30)
  const historico = (msgsDesc || []).slice().reverse().map((m: any) => {
    const quem = m.direcao === 'inbound' ? 'Cliente' : (m.origem_agente_nome || 'Spin')
    return `${quem}: ${m.tipo === 'text' ? (m.texto || '') : `[${m.tipo}${m.texto ? `: ${m.texto}` : ''}]`}`
  }).join('\n')

  const r = await new Anthropic({ apiKey: cfg.anthropic_api_key }).messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: `Você é a Bianca, assistente da Spin Solar (energia solar em SC), escrevendo um follow-up no
WhatsApp em nome de ${resp?.nome_completo || 'o consultor'} para ${nomeCliente}.
Regras: UMA mensagem curta (até 3 frases), cordial, português do Brasil, sem "prezado".
Não invente preço, prazo, desconto ou condição que não esteja no histórico. Não assine
(o nome "Bianca" já vai no cabeçalho). Retorne SOMENTE o texto da mensagem.`,
    messages: [{
      role: 'user',
      content: `Objetivo do follow-up: ${f.mensagem}\n\nHistórico recente da conversa:\n${historico || '(sem mensagens)'}`,
    }],
  })
  const bloco = r.content.find((b) => b.type === 'text') as any
  return String(bloco?.text || '').trim().replace(/^"|"$/g, '')
}

async function avisar(f: any, mensagem: string, urgente = false) {
  await avisarUsuario({
    destinatario_id: f.responsavel_id,
    agente: 'bianca',
    titulo: 'Follow-up',
    mensagem,
    urgente,
    projeto_id: f.projeto_id || null,
    conversa_id: f.conversa_id,
  }).catch((e) => console.error('[followups] aviso', e))
}
