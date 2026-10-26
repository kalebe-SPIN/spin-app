import type { createAdminClient } from '@/lib/supabase/admin'
import { requisicaoPelaSaida, type OpcoesHttp, type RespostaHttp } from './http'

/**
 * Chamada à API de um fornecedor de catálogo (Kalebe 2026-10-23): endereço
 * em catalogo_fornecedores.api_base_url, chave e servidor intermediário em
 * catalogo_fornecedores_credenciais (só o servidor lê). Com proxy, sai pelo
 * IP fixo; sem, direto. Como a chave vai no cabeçalho depende do fornecedor
 * (api_config.auth_header / auth_prefixo — padrão "Authorization: Bearer").
 * Os endpoints de catálogo, preço e kit entram quando chegar a documentação.
 */

type Admin = ReturnType<typeof createAdminClient>

export type ConfigFornecedorApi = {
  nome: string
  base_url: string | null
  chave: string | null
  proxy_url: string | null
  auth_header: string
  auth_prefixo: string
}

export async function configFornecedorApi(admin: Admin, fornecedorId: string): Promise<ConfigFornecedorApi | { erro: string }> {
  const [{ data: f }, { data: c, error: ec }] = await Promise.all([
    admin.from('catalogo_fornecedores').select('nome, tipo, api_base_url, api_config').eq('id', fornecedorId).maybeSingle(),
    admin.from('catalogo_fornecedores_credenciais').select('api_chave, proxy_url').eq('catalogo_fornecedor_id', fornecedorId).maybeSingle(),
  ])
  if (!f) return { erro: 'Fornecedor não encontrado' }
  if (ec && /proxy_url/.test(ec.message)) return { erro: 'Falta rodar a migration 161 (servidor intermediário) no Supabase.' }
  const cfg = ((f as any).api_config || {}) as Record<string, any>
  return {
    nome: (f as any).nome,
    base_url: (f as any).api_base_url || null,
    chave: (c as any)?.api_chave || null,
    proxy_url: (c as any)?.proxy_url || null,
    auth_header: String(cfg.auth_header || 'Authorization'),
    auth_prefixo: cfg.auth_prefixo != null ? String(cfg.auth_prefixo) : 'Bearer ',
  }
}

/** Chama um caminho da API do fornecedor (ex.: "/produtos"), pelo IP fixo quando configurado. */
export async function chamarFornecedor(cfg: ConfigFornecedorApi, caminho: string, opcoes: OpcoesHttp = {}): Promise<RespostaHttp> {
  if (!cfg.base_url) throw new Error('Cadastre o endereço da API do fornecedor')
  const url = new URL(caminho.replace(/^\/+/, ''), cfg.base_url.endsWith('/') ? cfg.base_url : `${cfg.base_url}/`).toString()
  const headers: Record<string, string> = { Accept: 'application/json', ...(opcoes.headers || {}) }
  if (cfg.chave) headers[cfg.auth_header] = `${cfg.auth_prefixo}${cfg.chave}`
  const o = { ...opcoes, headers }
  return requisicaoPelaSaida(url, cfg.proxy_url, o)
}

/** IP com que as chamadas saem (pelo servidor intermediário, quando houver) — é o IP que o fornecedor libera. */
export async function ipDeSaida(cfg: ConfigFornecedorApi): Promise<string> {
  const url = 'https://api.ipify.org?format=json'
  const r = await requisicaoPelaSaida(url, cfg.proxy_url, { timeoutMs: 15_000 })
  const ip = (() => { try { return JSON.parse(r.corpo).ip } catch { return null } })()
  if (!ip) throw new Error(`Não consegui descobrir o IP de saída (status ${r.status})`)
  return String(ip)
}
