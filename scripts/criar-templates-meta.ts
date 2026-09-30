/**
 * Cria na Meta os modelos de mensagem da Spin que ainda não existem
 * (Kalebe 2026-09-30). Idempotente: o que já existe só é listado.
 *
 *   npx tsx scripts/criar-templates-meta.ts
 *
 * Lê o token do WhatsApp em wa_config (via service role do .env.local).
 */
import { readFileSync } from 'fs'
import { DEFINICOES_TEMPLATES, WABA_ID_SPIN, payloadCriacao } from '../lib/whatsapp/templates-definicoes'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

async function token(): Promise<string> {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/wa_config?select=whatsapp_access_token&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
  const t = ((await r.json())[0] || {}).whatsapp_access_token || env.WHATSAPP_ACCESS_TOKEN
  if (!t) throw new Error('Sem token do WhatsApp em wa_config nem no .env.local')
  return t
}

async function main() {
  const tk = await token()
  const base = `https://graph.facebook.com/v20.0/${WABA_ID_SPIN}/message_templates`
  const lista = await (await fetch(`${base}?fields=name,status,category,language&limit=200`, { headers: { Authorization: `Bearer ${tk}` } })).json()
  if (lista.error) throw new Error(`Meta: ${lista.error.message}`)
  const existentes = new Map<string, any>((lista.data || []).map((t: any) => [`${t.name}|${t.language}`, t]))

  for (const def of Object.values(DEFINICOES_TEMPLATES)) {
    const ja = existentes.get(`${def.nome}|${def.idioma}`)
    if (ja) { console.log(`= ${def.nome}: já existe (${ja.status}, ${ja.category})`); continue }
    const resp = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadCriacao(def)),
    })
    const j = await resp.json()
    if (!resp.ok) console.log(`✗ ${def.nome}: ${j?.error?.error_user_msg || j?.error?.message || resp.status}`)
    else console.log(`✓ ${def.nome}: enviado (${j.status || 'PENDING'}, categoria ${j.category || def.categoria})`)
  }
}

main().catch((e) => { console.error('Falhou:', e.message); process.exit(1) })
