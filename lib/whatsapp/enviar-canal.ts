import { createAdminClient } from '@/lib/supabase/admin'
import { gravarMensagem, normalizarTelefone } from './conversas'

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
  remetente_agente: 'qualificacao' | 'bianca' | 'sistema'
  origem_agente_nome: string  // ex: 'Qualificação Spin' — o que aparece pro cliente
  prefixar_com_nome?: boolean  // default true
}): Promise<{ sucesso: true; meta_message_id: string | null } | { erro: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
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
