import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'

/**
 * HTTPS por um servidor intermediário (proxy HTTP com CONNECT) — Kalebe
 * 2026-10-23: o fornecedor só libera a API pra IP fixo; as chamadas saem
 * pelo VPS da Spin (IP fixo). Sem dependência: túnel CONNECT + TLS do Node.
 * A conexão com o destino é TLS de ponta a ponta (o proxy não vê o conteúdo).
 */

export type RespostaHttp = { status: number; headers: Record<string, string>; corpo: string }

export type OpcoesHttp = { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }

export function requisicaoViaProxy(urlAlvo: string, proxyUrl: string, opcoes: OpcoesHttp = {}): Promise<RespostaHttp> {
  let alvo: URL, proxy: URL
  try { alvo = new URL(urlAlvo); proxy = new URL(proxyUrl) } catch { return Promise.reject(new Error('Endereço inválido')) }
  if (alvo.protocol !== 'https:') return Promise.reject(new Error('A API precisa ser https'))
  const auth = proxy.username
    ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`
    : null
  const porta = Number(alvo.port) || 443
  const timeout = opcoes.timeoutMs || 20_000

  return new Promise((resolve, reject) => {
    const conectar = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 3128,
      method: 'CONNECT',
      path: `${alvo.hostname}:${porta}`,
      headers: { Host: `${alvo.hostname}:${porta}`, ...(auth ? { 'Proxy-Authorization': auth } : {}) },
      timeout,
    })
    conectar.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        reject(new Error(res.statusCode === 407 ? 'O servidor intermediário recusou o usuário/senha (407)' : `O servidor intermediário respondeu ${res.statusCode}`))
        return
      }
      const req = https.request({
        host: alvo.hostname,
        port: porta,
        method: opcoes.method || 'GET',
        path: alvo.pathname + alvo.search,
        headers: { ...(opcoes.headers || {}), ...(opcoes.body ? { 'Content-Length': String(Buffer.byteLength(opcoes.body)) } : {}) },
        agent: false,
        createConnection: () => tls.connect({ socket, servername: alvo.hostname }),
        timeout,
      }, (r) => {
        const partes: Buffer[] = []
        r.on('data', (c: Buffer) => partes.push(c))
        r.on('end', () => resolve({
          status: r.statusCode || 0,
          headers: Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')])),
          corpo: Buffer.concat(partes).toString('utf8'),
        }))
        r.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('Tempo esgotado esperando a API do fornecedor')))
      req.on('error', reject)
      if (opcoes.body) req.write(opcoes.body)
      req.end()
    })
    conectar.on('timeout', () => conectar.destroy(new Error('Tempo esgotado conectando no servidor intermediário')))
    conectar.on('error', (e) => reject(new Error(`Não conectou no servidor intermediário: ${e.message}`)))
    conectar.end()
  })
}

/** Sem proxy (fornecedor que aceita só a chave): fetch direto, mesma resposta. */
export async function requisicaoDireta(urlAlvo: string, opcoes: OpcoesHttp = {}): Promise<RespostaHttp> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), opcoes.timeoutMs || 20_000)
  try {
    const r = await fetch(urlAlvo, { method: opcoes.method || 'GET', headers: opcoes.headers, body: opcoes.body, signal: ctl.signal, cache: 'no-store' })
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), corpo: await r.text() }
  } finally { clearTimeout(t) }
}

/**
 * Ponte (Kalebe 2026-10-26): arquivo de repasse num site com IP fixo — o
 * spinsolar.com.br na HostGator (docs/ponte-hostgator/ponte.php). O sistema
 * manda pra ponte (com o token) o que quer chamar; ela chama o fornecedor e
 * devolve status e corpo. Formato: https://TOKEN@site/caminho/ponte.php
 */
export async function requisicaoViaPonte(urlAlvo: string, ponteUrl: string, opcoes: OpcoesHttp = {}): Promise<RespostaHttp> {
  let ponte: URL
  try { ponte = new URL(ponteUrl) } catch { throw new Error('Endereço da ponte inválido') }
  const token = decodeURIComponent(ponte.username || '')
  if (!token) throw new Error('Ponte sem token (formato https://TOKEN@site/caminho/ponte.php)')
  ponte.username = ''
  ponte.password = ''
  const r = await requisicaoDireta(ponte.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Spin-Token': token },
    body: JSON.stringify({ url: urlAlvo, method: opcoes.method || 'GET', headers: opcoes.headers || {}, body: opcoes.body ?? null }),
    timeoutMs: (opcoes.timeoutMs || 20_000) + 10_000,
  })
  let j: any = null
  try { j = JSON.parse(r.corpo) } catch { /* resposta fora do formato */ }
  if (r.status !== 200 || !j || typeof j.status !== 'number') {
    throw new Error(j?.erro ? `Ponte: ${j.erro}` : `A ponte respondeu ${r.status}${r.status === 404 ? ' (arquivo não encontrado no site)' : ''}`)
  }
  return { status: j.status, headers: {}, corpo: String(j.corpo ?? '') }
}

/** Saída pelo IP fixo: ponte (https://…) ou servidor intermediário (http://…); vazio = direto. */
export function requisicaoPelaSaida(urlAlvo: string, saida: string | null, opcoes: OpcoesHttp = {}): Promise<RespostaHttp> {
  if (!saida) return requisicaoDireta(urlAlvo, opcoes)
  return saida.startsWith('https://') ? requisicaoViaPonte(urlAlvo, saida, opcoes) : requisicaoViaProxy(urlAlvo, saida, opcoes)
}
