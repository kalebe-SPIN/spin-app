import { createAdminClient } from '@/lib/supabase/admin'
import { gravarMensagem, normalizarTelefone } from './conversas'
import { getWaConfig } from './config'

/**
 * Envia mensagem pelo canal WhatsApp Spin, sem depender de usuário logado.
 * Uso: agentes IA (qualificação, Bianca) que rodam em webhook.
 *
 * Grava em wa_mensagens com remetente_agente + origem_agente_nome.
 * Se falhar Meta API, grava com status_entrega='falhou' + erro.
 */
export async function enviarTextoPeloCanal(entrada: {
  conversa_id: string
  telefone: string
  texto: string
  remetente_agente: 'qualificacao' | 'bianca' | 'davi' | 'sistema'
  origem_agente_nome: string  // ex: 'Qualificação Spin' — o que aparece pro cliente
  prefixar_com_nome?: boolean  // default true
}): Promise<{ sucesso: true; meta_message_id: string | null } | { erro: string }> {
  const cfg = await getWaConfig()
  const token = cfg.access_token
  const phoneNumberId = cfg.phone_number_id
  if (!token || !phoneNumberId) return { erro: 'Meta Cloud API não configurada' }

  const admin = createAdminClient()
  const texto = String(entrada.texto || '').trim()
  if (!texto) return { erro: 'Mensagem vazia' }

  let tel = normalizarTelefone(entrada.telefone)
  if (tel.length === 11) tel = '55' + tel
  if (!tel) return { erro: 'Telefone inválido' }

  const prefixar = entrada.prefixar_com_nome !== false
  const corpo = prefixar ? `*${entrada.origem_agente_nome}:*\n${texto}` : texto

  try {
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

      await gravarMensagem(admin, {
        conversa_id: entrada.conversa_id,
        direcao: 'outbound',
        tipo: 'text',
        texto,
        remetente_agente: entrada.remetente_agente,
        origem_agente_nome: entrada.origem_agente_nome,
        status_entrega: 'falhou',
      })
      return {
        erro: foraJanela
          ? 'Fora da janela 24h — precisa template pré-aprovado'
          : `[${erroCode || 'sem código'}] ${erroMsg}`,
      }
    }

    const metaMessageId: string | null = data?.messages?.[0]?.id || null
    await gravarMensagem(admin, {
      conversa_id: entrada.conversa_id,
      direcao: 'outbound',
      tipo: 'text',
      texto,
      meta_message_id: metaMessageId,
      remetente_agente: entrada.remetente_agente,
      origem_agente_nome: entrada.origem_agente_nome,
      status_entrega: 'enviada',
    })
    return { sucesso: true, meta_message_id: metaMessageId }
  } catch (e: any) {
    console.error('[enviarTextoPeloCanal]', e)
    return { erro: e?.message || 'Erro desconhecido' }
  }
}

/** Opção de resposta: o id volta no webhook (wa_mensagens.dados.resposta_id). */
export type OpcaoInterativa = { id: string; titulo: string; descricao?: string }

/**
 * Kalebe 2026-10-10: mensagem com BOTÕES (até 3) ou LISTA (até 10 opções) —
 * o cliente escolhe clicando em vez de digitar. Só dentro da janela de 24h
 * (fora dela a Meta só aceita modelo aprovado). Limites da Meta: título do
 * botão 20 caracteres; item de lista 24 (+ descrição 72); botão da lista 20.
 */
export async function enviarInterativoPeloCanal(entrada: {
  conversa_id: string
  telefone: string
  texto: string
  origem_agente_nome: string
  remetente_agente?: 'qualificacao' | 'bianca' | 'davi' | 'sistema'
  /** Até 3 botões. */
  botoes?: OpcaoInterativa[]
  /** Lista: texto do botão que abre a lista + opções (até 10). */
  lista?: { botao: string; titulo_secao?: string; opcoes: OpcaoInterativa[] }
  rodape?: string
}): Promise<{ sucesso: true; meta_message_id: string | null } | { erro: string }> {
  const cfg = await getWaConfig()
  if (!cfg.access_token || !cfg.phone_number_id) return { erro: 'Meta Cloud API não configurada' }
  const texto = String(entrada.texto || '').trim()
  if (!texto) return { erro: 'Mensagem vazia' }
  const botoes = (entrada.botoes || []).slice(0, 3)
  const opcoesLista = (entrada.lista?.opcoes || []).slice(0, 10)
  if (!botoes.length && !opcoesLista.length) return { erro: 'Sem opções' }

  let tel = normalizarTelefone(entrada.telefone)
  if (tel.length === 11) tel = '55' + tel
  if (!tel) return { erro: 'Telefone inválido' }

  const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const corpo = `*${entrada.origem_agente_nome}:*\n${texto}`
  const interactive: any = botoes.length
    ? {
        type: 'button',
        body: { text: corta(corpo, 1024) },
        action: { buttons: botoes.map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: corta(b.titulo, 20) } })) },
      }
    : {
        type: 'list',
        body: { text: corta(corpo, 4096) },
        action: {
          button: corta(entrada.lista!.botao || 'Ver opções', 20),
          sections: [{
            title: corta(entrada.lista!.titulo_secao || 'Opções', 24),
            rows: opcoesLista.map((o) => ({
              id: o.id.slice(0, 200), title: corta(o.titulo, 24),
              ...(o.descricao ? { description: corta(o.descricao, 72) } : {}),
            })),
          }],
        },
      }
  if (entrada.rodape) interactive.footer = { text: corta(entrada.rodape, 60) }

  // No Spinzap aparece o texto + as opções oferecidas
  const opcoes = botoes.length ? botoes : opcoesLista
  const registro = `${texto}\n\n${opcoes.map((o) => `▫️ ${o.titulo}`).join('\n')}`
  const admin = createAdminClient()
  const base = {
    conversa_id: entrada.conversa_id, direcao: 'outbound' as const, tipo: 'interactive' as const, texto: registro,
    remetente_agente: entrada.remetente_agente || 'qualificacao', origem_agente_nome: entrada.origem_agente_nome,
    dados: { interativo: botoes.length ? 'botoes' : 'lista', opcoes },
  }
  try {
    const resp = await fetch(`https://graph.facebook.com/v20.0/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'interactive', interactive }),
    })
    const data = await resp.json()
    if (!resp.ok) {
      const erroMsg = data?.error?.message || 'Erro Meta API'
      const erroCode = data?.error?.code
      await gravarMensagem(admin, { ...base, status_entrega: 'falhou', erro: `[${erroCode || 'sem código'}] ${erroMsg}` })
      return { erro: erroCode === 131047 || String(erroMsg).includes('24 hours') ? 'Fora da janela 24h — precisa template pré-aprovado' : `[${erroCode || 'sem código'}] ${erroMsg}` }
    }
    const metaMessageId: string | null = data?.messages?.[0]?.id || null
    await gravarMensagem(admin, { ...base, meta_message_id: metaMessageId, status_entrega: 'enviada' })
    return { sucesso: true, meta_message_id: metaMessageId }
  } catch (e: any) {
    console.error('[enviarInterativoPeloCanal]', e)
    return { erro: e?.message || 'Erro desconhecido' }
  }
}
