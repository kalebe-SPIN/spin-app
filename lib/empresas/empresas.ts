import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Multiempresa (Kalebe 2026-10-19 — migration 158): a proposta sai pelo CNPJ
 * escolhido no kit; a empresa define o fornecedor (catálogo e kit) e a marca
 * do PDF. Todo o resto (clientes, Spinzap, agenda, precificação) é
 * compartilhado. Sem a migration 158, a empresa é a de configuracoes_empresa.
 */

type Admin = ReturnType<typeof createAdminClient>

export type Empresa = {
  id: string | null                // null = configuracoes_empresa (antes da migration 158)
  nome: string
  razao_social: string | null
  cnpj: string | null
  /** catalogo_fornecedores.id — de onde vêm o catálogo e o kit */
  fornecedor_id: string | null
  fornecedor_nome: string | null
  fornecedor_tipo: 'planilha' | 'api' | null
  /** Fornecedor de API: fator sobre o preço que a API devolve (null = ainda não definido) */
  fornecedor_fator: number | null
  endereco: string | null
  telefone: string | null
  email: string | null
  site: string | null
  logo_url: string | null
  papel_timbrado_url: string | null
  rt_nome: string | null
  rt_titulo: string | null
  rt_crea: string | null
  rt_art_padrao: string | null
  rt_telefone: string | null
  rt_email: string | null
  rt_assinatura_url: string | null
  cor: string | null
  padrao: boolean
}

// catalogo_fornecedores (migration 158) — public.fornecedores é o cadastro do Financeiro
const CAMPOS = 'id, nome, razao_social, cnpj, catalogo_fornecedor_id, endereco, telefone, email, site, logo_url, papel_timbrado_url, rt_nome, rt_titulo, rt_crea, rt_art_padrao, rt_telefone, rt_email, rt_assinatura_url, cor, padrao, fornecedor:catalogo_fornecedor_id(nome, tipo, api_config)'

function daLinha(x: any): Empresa {
  return {
    id: x.id ?? null, nome: x.nome || x.razao_social || 'Spin Solar', razao_social: x.razao_social ?? null, cnpj: x.cnpj ?? null,
    fornecedor_id: x.catalogo_fornecedor_id ?? null, fornecedor_nome: x.fornecedor?.nome ?? null, fornecedor_tipo: x.fornecedor?.tipo ?? null,
    fornecedor_fator: Number(x.fornecedor?.api_config?.fator_preco) > 0 ? Number(x.fornecedor.api_config.fator_preco) : null,
    endereco: x.endereco ?? null, telefone: x.telefone ?? null, email: x.email ?? null, site: x.site ?? null,
    logo_url: x.logo_url ?? null, papel_timbrado_url: x.papel_timbrado_url ?? null,
    rt_nome: x.rt_nome ?? null, rt_titulo: x.rt_titulo ?? null, rt_crea: x.rt_crea ?? null, rt_art_padrao: x.rt_art_padrao ?? null,
    rt_telefone: x.rt_telefone ?? null, rt_email: x.rt_email ?? null, rt_assinatura_url: x.rt_assinatura_url ?? null,
    cor: x.cor ?? null, padrao: !!x.padrao,
  }
}

async function daConfiguracao(admin: Admin): Promise<Empresa> {
  const { data } = await admin.from('configuracoes_empresa').select('*').limit(1).maybeSingle()
  return { ...daLinha({ ...(data || {}), id: null, nome: 'Spin Solar' }), padrao: true, fornecedor_tipo: 'planilha', fornecedor_nome: 'WEG' }
}

/** Empresas ativas (padrão primeiro, depois A→Z). */
export async function empresasAtivas(admin: Admin): Promise<Empresa[]> {
  const { data, error } = await admin.from('empresas').select(CAMPOS).eq('ativo', true)
  if (error || !data?.length) return [await daConfiguracao(admin)]
  return (data as any[]).map(daLinha)
    .sort((a, b) => (a.padrao === b.padrao ? a.nome.localeCompare(b.nome, 'pt-BR') : a.padrao ? -1 : 1))
}

export async function empresaPorId(admin: Admin, id: string | null | undefined): Promise<Empresa> {
  if (id) {
    const { data } = await admin.from('empresas').select(CAMPOS).eq('id', id).maybeSingle()
    if (data) return daLinha(data)
  }
  const { data: padrao, error } = await admin.from('empresas').select(CAMPOS).eq('padrao', true).maybeSingle()
  if (!error && padrao) return daLinha(padrao)
  return daConfiguracao(admin)
}

/** Empresa da proposta do projeto (sem escolha = a padrão). */
export async function empresaDoProjeto(admin: Admin, projetoId: string | null | undefined): Promise<Empresa> {
  if (!projetoId) return empresaPorId(admin, null)
  const { data, error } = await admin.from('projetos').select('empresa_id').eq('id', projetoId).maybeSingle()
  return empresaPorId(admin, error ? null : (data as any)?.empresa_id || null)
}

/** Mesmo formato de configuracoes_empresa (o que os PDFs já recebem) + marca e papel de quem assina. */
export function configEmpresaDoPdf(e: Empresa) {
  return {
    nome: e.nome,
    // A Spin assina como "Diretor comercial" (modelo oficial); outra empresa, pelo título do responsável
    papel_assinatura: e.padrao ? 'Diretor comercial' : (e.rt_titulo || 'Responsável'),
    razao_social: e.razao_social, cnpj: e.cnpj, endereco: e.endereco, telefone: e.telefone, email: e.email, site: e.site,
    logo_url: e.logo_url, papel_timbrado_url: e.papel_timbrado_url,
    rt_nome: e.rt_nome, rt_titulo: e.rt_titulo, rt_crea: e.rt_crea, rt_art_padrao: e.rt_art_padrao,
    rt_telefone: e.rt_telefone, rt_email: e.rt_email, rt_assinatura_url: e.rt_assinatura_url,
  }
}

/**
 * Filtro do catálogo pela empresa: a de planilha (WEG) usa o catálogo atual
 * (produtos.catalogo_fornecedor_id vazio); empresa com fornecedor de API usa
 * só os produtos daquele fornecedor.
 */
export type FiltroCatalogo = {
  /** Fornecedor de API: só os produtos dele; senão o catálogo atual (sem fornecedor) */
  api: boolean
  fornecedor_id: string | null
  fornecedor_nome: string | null
  /** Fator sobre o preço da API (substitui o fator WEG no cálculo) */
  fator_preco: number | null
}

export function filtroCatalogoDaEmpresa(e: Empresa): FiltroCatalogo | null {
  // Sem a migration 158 (empresa de configuracoes_empresa): catálogo de sempre, sem filtro
  if (!e.id) return null
  const api = e.fornecedor_tipo === 'api' && !!e.fornecedor_id
  return { api, fornecedor_id: api ? e.fornecedor_id : null, fornecedor_nome: e.fornecedor_nome, fator_preco: api ? e.fornecedor_fator : null }
}
