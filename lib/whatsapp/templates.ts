import { createAdminClient } from '@/lib/supabase/admin'
import { gravarMensagem, normalizarTelefone } from './conversas'
import { getWaConfig } from './config'
import {
  DEFINICOES_TEMPLATES, WABA_ID_SPIN, renderizarTemplate,
  type ChaveTemplate,
} from './templates-definicoes'

/**
 * Envio de modelos aprovados pela Meta (Kalebe 2026-09-30). É o único jeito
 * de falar com quem está fora da janela de 24h ou nunca escreveu pra Spin.
 * Textos em ./templates-definicoes.ts.
 */

export type { ChaveTemplate } from './templates-definicoes'

// Status dos modelos na Meta — cache curto (aprovação muda raramente)
let cacheStatus: { em: number; mapa: Map<string, string> } | null = null
const CACHE_MS = 5 * 60 * 1000

export async function statusDosTemplates(forcar = false): Promise<Map<string, string>> {
  if (!forcar && cacheStatus && Date.now() - cacheStatus.em < CACHE_MS) return cacheStatus.mapa
  const cfg = await getWaConfig()
  const mapa = new Map<string, string>()
  if (!cfg.access_token) return mapa
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WABA_ID_SPIN}/message_templates?fields=name,status,language&limit=200`, {
      headers: { Authorization: `Bearer ${cfg.access_token}` },
      cache: 'no-store',
    })
    const j = await r.json()
    for (const t of j?.data || []) mapa.set(`${t.name}|${t.language}`, t.status)
    cacheStatus = { em: Date.now(), mapa }
  } catch (e) {
    console.error('[templates] status', e)
  }
  return mapa
}

/** 'APPROVED' | 'PENDING' | 'REJECTED' | … | 'INEXISTENTE' */
export async function statusDoTemplate(chave: ChaveTemplate): Promise<string> {
  const def = DEFINICOES_TEMPLATES[chave]
  return (await statusDosTemplates()).get(`${def.nome}|${def.idioma}`) || 'INEXISTENTE'
}

export async function templateAprovado(chave: ChaveTemplate): Promise<boolean> {
  return (await statusDoTemplate(chave)) === 'APPROVED'
}

export const STATUS_TEMPLATE_PT: Record<string, string> = {
  APPROVED: 'aprovado', PENDING: 'em análise na Meta', REJECTED: 'recusado pela Meta',
  PAUSED: 'pausado pela Meta', DISABLED: 'desativado pela Meta', INEXISTENTE: 'não criado',
}

/** Meta recusa parâmetro com quebra de linha, tab ou mais de 4 espaços seguidos */
function limparParametro(v: string, max = 900): string {
  return String(v ?? '')
    .replace(/[\r\n\t]+/g, ' · ')
    .replace(/ {4,}/g, '   ')
    .trim()
    .slice(0, max) || '-'
}

function telefoneMeta(t: string): string {
  let tel = normalizarTelefone(t)
  if (tel.length === 10 || tel.length === 11) tel = '55' + tel
  return tel
}

export const primeiroNome = (s: string | null | undefined) => String(s || '').trim().split(/\s+/)[0] || ''

/**
 * Envia um modelo aprovado e grava no histórico da conversa.
 * botoes_payload: um por botão de resposta rápida (volta no webhook em msg.button.payload).
 */
export async function enviarTemplatePeloCanal(entrada: {
  conversa_id: string
  telefone: string
  template: ChaveTemplate
  parametros: string[]
  botoes_payload?: string[]
  remetente_id?: string | null
  remetente_agente?: 'qualificacao' | 'bianca' | 'davi' | 'sistema' | null
  origem_agente_nome?: string | null
}): Promise<{ sucesso: true; meta_message_id: string | null } | { erro: string; codigo?: number }> {
  const def = DEFINICOES_TEMPLATES[entrada.template]
  const status = await statusDoTemplate(entrada.template)
  if (status !== 'APPROVED') {
    return { erro: `Modelo "${def.nome}" ${STATUS_TEMPLATE_PT[status] || status} — ainda não dá pra enviar.` }
  }
  const cfg = await getWaConfig()
  if (!cfg.access_token || !cfg.phone_number_id) return { erro: 'Meta Cloud API não configurada' }
  const tel = telefoneMeta(entrada.telefone)
  if (!tel) return { erro: 'Telefone inválido' }

  const params = entrada.parametros.map((p) => limparParametro(p))
  const components: any[] = [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
  for (const [i, payload] of (entrada.botoes_payload || []).entries()) {
    components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload }] })
  }

  let ok = false
  let metaId: string | null = null
  let erro: string | null = null
  let codigo: number | undefined
  try {
    const resp = await fetch(`https://graph.facebook.com/v20.0/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: tel,
        type: 'template',
        template: { name: def.nome, language: { code: def.idioma }, components },
      }),
    })
    const data = await resp.json()
    if (resp.ok) { ok = true; metaId = data?.messages?.[0]?.id || null }
    else { erro = `[${data?.error?.code || resp.status}] ${data?.error?.message || 'Erro Meta API'}`; codigo = data?.error?.code }
  } catch (e: any) {
    erro = e?.message || 'Erro de rede'
  }

  await gravarMensagem(createAdminClient(), {
    conversa_id: entrada.conversa_id,
    direcao: 'outbound',
    tipo: 'template',
    texto: renderizarTemplate(def.corpo, params),
    meta_message_id: metaId,
    remetente_id: entrada.remetente_id ?? null,
    remetente_agente: entrada.remetente_agente ?? null,
    origem_agente_nome: entrada.origem_agente_nome ?? null,
    status_entrega: ok ? 'enviada' : 'falhou',
    erro,
  })

  return ok ? { sucesso: true, meta_message_id: metaId } : { erro: erro || 'Falha no envio', codigo }
}
