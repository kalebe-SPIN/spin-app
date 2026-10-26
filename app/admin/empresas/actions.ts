'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Empresas (CNPJ/marca) e fornecedores de catálogo — Kalebe 2026-10-19,
 * migration 158. Só admin. A chave da API do fornecedor vai pra
 * catalogo_fornecedores_credenciais (sem policy: só o servidor lê) e nunca
 * volta pra tela — aparece mascarada, como no config do WhatsApp.
 */

async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const }
  return { ok: true as const, user_id: user.id }
}

export type CorEtiqueta = 'azul' | 'branco' | 'coral' | 'sol' | 'verde'

export type EmpresaAdmin = {
  id: string
  nome: string
  razao_social: string
  cnpj: string
  catalogo_fornecedor_id: string | null
  endereco: string
  telefone: string
  email: string
  site: string
  logo_url: string
  papel_timbrado_url: string
  rt_nome: string
  rt_titulo: string
  rt_crea: string
  rt_art_padrao: string
  rt_telefone: string
  rt_email: string
  rt_assinatura_url: string
  cor: CorEtiqueta | null
  padrao: boolean
  ativo: boolean
}

export type FornecedorCatalogoAdmin = {
  id: string
  nome: string
  tipo: 'planilha' | 'api'
  api_base_url: string
  ativo: boolean
  /** Chave mascarada ("não cadastrada" / "abcd1234…wxyz (40 caracteres)") */
  chave: string
  tem_chave: boolean
  ultima_sincronizacao_em: string | null
  /** Fator sobre o preço que a API devolve (null = ainda não definido — o cálculo trava) */
  fator_preco: number | null
  /** Servidor intermediário (IP fixo) mascarado: "http://usuario:••••@IP:porta" */
  proxy: string
  tem_proxy: boolean
}

/** Mostra o servidor intermediário sem a senha */
const mascararProxy = (v: string | null | undefined) => {
  if (!v) return 'não cadastrado'
  try {
    const u = new URL(v)
    // Ponte (https://TOKEN@site/caminho): esconde o token; servidor intermediário: esconde a senha
    if (u.protocol === 'https:') return `ponte ${u.hostname}${u.pathname}`
    return `${u.protocol}//${u.username ? `${decodeURIComponent(u.username)}:••••@` : ''}${u.hostname}${u.port ? `:${u.port}` : ''}`
  } catch { return 'endereço inválido' }
}

const mascarar = (v: string | null | undefined) =>
  !v ? 'não cadastrada' : v.length <= 12 ? `${'•'.repeat(v.length)}` : `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} caracteres)`

const soDigitos = (s: string) => String(s || '').replace(/\D/g, '')
const formatarCnpj = (s: string) => soDigitos(s).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const t = (s: unknown) => String(s ?? '').trim()

export async function dadosEmpresasAdminAction(): Promise<
  { empresas: EmpresaAdmin[]; fornecedores: FornecedorCatalogoAdmin[] } | { erro: string }
> {
  const c = await verificarAdmin()
  if ('erro' in c) return { erro: c.erro as string }
  const admin = createAdminClient()
  const [e, f, cred] = await Promise.all([
    admin.from('empresas').select('*').order('padrao', { ascending: false }).order('nome'),
    admin.from('catalogo_fornecedores').select('*').order('nome'),
    admin.from('catalogo_fornecedores_credenciais').select('*'),
  ])
  if (e.error || f.error) return { erro: 'Falta rodar a migration 158 (multiempresa) no Supabase.' }
  const chaves = new Map(((cred.data || []) as any[]).map((x) => [x.catalogo_fornecedor_id, x.api_chave as string | null]))
  const proxies = new Map(((cred.data || []) as any[]).map((x) => [x.catalogo_fornecedor_id, (x.proxy_url as string | null) || null]))
  return {
    empresas: ((e.data || []) as any[]).map((x) => ({
      id: x.id, nome: x.nome || '', razao_social: x.razao_social || '', cnpj: x.cnpj || '', catalogo_fornecedor_id: x.catalogo_fornecedor_id || null,
      endereco: x.endereco || '', telefone: x.telefone || '', email: x.email || '', site: x.site || '',
      logo_url: x.logo_url || '', papel_timbrado_url: x.papel_timbrado_url || '',
      rt_nome: x.rt_nome || '', rt_titulo: x.rt_titulo || '', rt_crea: x.rt_crea || '', rt_art_padrao: x.rt_art_padrao || '',
      rt_telefone: x.rt_telefone || '', rt_email: x.rt_email || '', rt_assinatura_url: x.rt_assinatura_url || '',
      cor: x.cor || null, padrao: !!x.padrao, ativo: x.ativo !== false,
    })),
    fornecedores: ((f.data || []) as any[]).map((x) => ({
      id: x.id, nome: x.nome, tipo: x.tipo === 'api' ? 'api' : 'planilha', api_base_url: x.api_base_url || '', ativo: x.ativo !== false,
      chave: mascarar(chaves.get(x.id)), tem_chave: !!chaves.get(x.id), ultima_sincronizacao_em: x.ultima_sincronizacao_em || null,
      fator_preco: Number(x.api_config?.fator_preco) > 0 ? Number(x.api_config.fator_preco) : null,
      proxy: mascararProxy(proxies.get(x.id)), tem_proxy: !!proxies.get(x.id),
    })),
  }
}

export async function salvarEmpresaAction(input: Omit<EmpresaAdmin, 'id'> & { id?: string | null }): Promise<{ sucesso: true; id: string } | { erro: string }> {
  const c = await verificarAdmin()
  if ('erro' in c) return { erro: c.erro as string }
  const nome = t(input.nome)
  const razao = t(input.razao_social)
  const cnpj = soDigitos(input.cnpj)
  if (!nome) return { erro: 'Dê o nome da marca (aparece na etiqueta do Spinzap)' }
  if (!razao) return { erro: 'Informe a razão social' }
  if (cnpj.length !== 14) return { erro: 'CNPJ precisa ter 14 dígitos' }
  if (!input.catalogo_fornecedor_id) return { erro: 'Escolha o fornecedor que atende essa empresa (define o catálogo e o kit)' }
  const admin = createAdminClient()
  const linha = {
    nome, razao_social: razao, cnpj: formatarCnpj(cnpj), catalogo_fornecedor_id: input.catalogo_fornecedor_id,
    endereco: t(input.endereco) || null, telefone: t(input.telefone) || null, email: t(input.email) || null, site: t(input.site) || null,
    logo_url: t(input.logo_url) || null, papel_timbrado_url: t(input.papel_timbrado_url) || null,
    rt_nome: t(input.rt_nome) || null, rt_titulo: t(input.rt_titulo) || null, rt_crea: t(input.rt_crea) || null, rt_art_padrao: t(input.rt_art_padrao) || null,
    rt_telefone: t(input.rt_telefone) || null, rt_email: t(input.rt_email) || null, rt_assinatura_url: t(input.rt_assinatura_url) || null,
    cor: input.cor || null, ativo: input.ativo !== false, atualizado_em: new Date().toISOString(),
  }
  // Uma só é a padrão (a que vale quando ninguém escolhe)
  if (input.padrao) {
    const q = admin.from('empresas').update({ padrao: false }).eq('padrao', true)
    await (input.id ? q.neq('id', input.id) : q)
  }
  const { data, error } = input.id
    ? await admin.from('empresas').update({ ...linha, ...(input.padrao ? { padrao: true } : {}) }).eq('id', input.id).select('id').single()
    : await admin.from('empresas').insert({ ...linha, padrao: !!input.padrao }).select('id').single()
  if (error) return { erro: /empresas_cnpj_key|duplicate/i.test(error.message) ? 'Já existe uma empresa com esse CNPJ' : error.message }
  revalidatePath('/admin/empresas')
  return { sucesso: true, id: (data as any).id }
}

export async function salvarFornecedorCatalogoAction(input: {
  id?: string | null
  nome: string
  tipo: 'planilha' | 'api'
  api_base_url: string
  ativo: boolean
  /** Vazio = mantém a chave que já está salva */
  api_chave?: string
  /** Fator sobre o preço da API (vazio = ainda não definido) */
  fator_preco?: number | null
  /** Servidor intermediário com IP fixo (vazio = mantém o atual) */
  proxy_url?: string
}): Promise<{ sucesso: true; id: string } | { erro: string }> {
  const c = await verificarAdmin()
  if ('erro' in c) return { erro: c.erro as string }
  const nome = t(input.nome)
  if (!nome) return { erro: 'Dê o nome do fornecedor' }
  const url = t(input.api_base_url)
  if (input.tipo === 'api' && url && !/^https:\/\//i.test(url)) return { erro: 'O endereço da API precisa começar com https://' }
  const fator = input.fator_preco != null && Number(input.fator_preco) > 0 ? Number(input.fator_preco) : null
  if (fator != null && fator > 5) return { erro: 'Fator alto demais — confira (ex.: 0,85 ou 1,10)' }
  const admin = createAdminClient()
  // api_config: mantém o que já tem e grava o fator
  let apiConfig: Record<string, any> = {}
  if (input.id) {
    const { data: atual } = await admin.from('catalogo_fornecedores').select('api_config').eq('id', input.id).maybeSingle()
    apiConfig = ((atual as any)?.api_config || {}) as Record<string, any>
  }
  apiConfig = { ...apiConfig, fator_preco: fator }
  const linha = { nome, tipo: input.tipo === 'api' ? 'api' : 'planilha', api_base_url: url || null, ativo: input.ativo !== false, api_config: apiConfig, atualizado_em: new Date().toISOString() }
  const { data, error } = input.id
    ? await admin.from('catalogo_fornecedores').update(linha).eq('id', input.id).select('id').single()
    : await admin.from('catalogo_fornecedores').insert(linha).select('id').single()
  if (error) return { erro: /duplicate|unique/i.test(error.message) ? 'Já existe um fornecedor com esse nome' : error.message }
  const id = (data as any).id as string
  const chave = t(input.api_chave)
  const proxy = t(input.proxy_url)
  if (proxy) {
    // Ponte no site (https://TOKEN@spinsolar.com.br/spin-ponte/ponte.php) ou servidor intermediário (http://usuario:senha@IP:porta)
    const formato = 'Use https://TOKEN@site/caminho/ponte.php (ponte) ou http://usuario:senha@IP:porta (servidor intermediário)'
    try {
      const u = new URL(proxy)
      const ponteOk = u.protocol === 'https:' && !!u.username && u.pathname.length > 1
      const proxyOk = u.protocol === 'http:' && !!u.port
      if (!ponteOk && !proxyOk) return { erro: formato }
    } catch { return { erro: formato } }
  }
  if (chave || proxy) {
    // Só os campos preenchidos: o que ficou em branco mantém o que já estava
    const { error: e2 } = await admin.from('catalogo_fornecedores_credenciais')
      .upsert({
        catalogo_fornecedor_id: id, ...(chave ? { api_chave: chave } : {}), ...(proxy ? { proxy_url: proxy } : {}),
        atualizado_em: new Date().toISOString(), atualizado_por: c.user_id,
      }, { onConflict: 'catalogo_fornecedor_id' })
    if (e2) return { erro: /proxy_url/.test(e2.message) ? 'Fornecedor salvo, mas falta rodar a migration 161 (servidor intermediário).' : `Fornecedor salvo, mas a chave não: ${e2.message}` }
  }
  revalidatePath('/admin/empresas')
  return { sucesso: true, id }
}

/**
 * Testa a integração (Kalebe 2026-10-23): mostra o IP com que as chamadas
 * saem (o que o fornecedor libera) e se a API respondeu — sem mostrar o
 * conteúdo da resposta.
 */
export async function testarFornecedorAction(id: string): Promise<{ ip_saida: string; via_proxy: boolean; api: string } | { erro: string }> {
  const c = await verificarAdmin()
  if ('erro' in c) return { erro: c.erro as string }
  const { configFornecedorApi, ipDeSaida, chamarFornecedor } = await import('@/lib/fornecedores/api')
  const cfg = await configFornecedorApi(createAdminClient(), id)
  if ('erro' in cfg) return cfg
  let ip: string
  try { ip = await ipDeSaida(cfg) } catch (e: any) { return { erro: e?.message || 'Falha ao testar o servidor intermediário' } }
  let api = 'endereço da API não cadastrado'
  if (cfg.base_url) {
    try {
      const r = await chamarFornecedor(cfg, '', { timeoutMs: 15_000 })
      api = r.status >= 200 && r.status < 300 ? `respondeu ${r.status} (ok)`
        : r.status === 401 || r.status === 403 ? `respondeu ${r.status} — acesso negado (chave errada ou IP ainda não liberado)`
        : `respondeu ${r.status}`
    } catch (e: any) { api = `não respondeu: ${e?.message || e}` }
  }
  return { ip_saida: ip, via_proxy: !!cfg.proxy_url, api }
}
