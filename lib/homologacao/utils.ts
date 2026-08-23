/**
 * Helpers síncronos pra homologação. Ficam fora de 'use server' pra
 * poderem ser importados por Server Components e Client Components.
 */

export type Socio = {
  id: string
  nome: string
  cpf?: string
  cnh_url?: string | null
  procuracao_url?: string | null
  cnh_enviado_em?: string | null
  procuracao_enviado_em?: string | null
  criado_em?: string
}

/**
 * Detecta se cliente é PJ pelo tamanho do CNPJ (14 dígitos).
 * PF = 11 dígitos (CPF).
 */
export function ehPJ(cpfCnpj: string | null | undefined): boolean {
  if (!cpfCnpj) return false
  return cpfCnpj.replace(/\D/g, '').length === 14
}

/**
 * Verifica se todos documentos obrigatórios estão presentes.
 * Considera:
 *   - 4 uploads técnicos (sempre)
 *   - CNH + procuração cliente (sempre)
 *   - Se PJ: cartão CNPJ + contrato social + cada sócio com CNH + procuração
 */
export function todosDocumentosCompletos(hom: any): boolean {
  const cpfCnpj = hom.projeto?.cliente_cpf_cnpj || hom.cliente_cpf_cnpj
  // Fatura vem do Passo 2 do projeto (analise_fatura preenchido)
  const faturaOk = !!(hom.projeto?.analise_fatura || hom.pdf_fatura_instalacao_url)
  const infraOk = !!(
    hom.foto_disjuntor_url &&
    hom.foto_padrao_entrada_url &&
    hom.foto_fachada_url
  )
  const clienteOk = !!(hom.cnh_cliente_url && hom.procuracao_cliente_url)
  if (!faturaOk || !infraOk || !clienteOk) return false

  if (ehPJ(cpfCnpj)) {
    const pjOk = !!(hom.cartao_cnpj_url && hom.contrato_social_url)
    if (!pjOk) return false
    const socios: Socio[] = hom.docs_socios || []
    // PJ precisa ter pelo menos 1 sócio, e todos com docs completos
    if (socios.length === 0) return false
    return socios.every((s) => s.cnh_url && s.procuracao_url)
  }
  return true
}

/**
 * Props JSON-safe que o DocumentosObrigatoriosCard consome.
 * Padrão vazio quando ainda não há homologação criada.
 */
export type PropsDocsHomologacao = {
  homologacaoId: string | null
  ehPJ: boolean
  faturaOk: boolean
  projetoId: string | undefined
  urls: Record<string, string | null>
  socios: any[]
  documentosCompletosEm: string | null
}

/**
 * Monta as props do DocumentosObrigatoriosCard a partir de um homologacao +
 * projeto. Usado pela página /homologacoes/[id] E pela página /projetos/[id]
 * (Kalebe quis que aparecesse nos 2 lugares apontando pra mesma tabela).
 */
export function montarPropsDocsHomologacao(
  hom: any | null | undefined,
  projeto: any | null | undefined,
): PropsDocsHomologacao {
  const vazio: PropsDocsHomologacao = {
    homologacaoId: hom?.id ?? null,
    ehPJ: ehPJ(projeto?.cliente_cpf_cnpj),
    faturaOk: !!projeto?.analise_fatura,
    projetoId: projeto?.id || undefined,
    urls: {
      foto_disjuntor: null, foto_padrao_entrada: null, foto_fachada: null,
      pdf_fatura_instalacao: null, cnh_cliente: null, procuracao_cliente: null,
      cartao_cnpj: null, contrato_social: null,
    },
    socios: [],
    documentosCompletosEm: null,
  }
  if (!hom) return vazio
  try {
    return JSON.parse(JSON.stringify({
      homologacaoId: hom.id,
      ehPJ: ehPJ(projeto?.cliente_cpf_cnpj),
      faturaOk: !!projeto?.analise_fatura,
      projetoId: projeto?.id || undefined,
      urls: {
        foto_disjuntor: hom.foto_disjuntor_url ?? null,
        foto_padrao_entrada: hom.foto_padrao_entrada_url ?? null,
        foto_fachada: hom.foto_fachada_url ?? null,
        pdf_fatura_instalacao: hom.pdf_fatura_instalacao_url ?? null,
        cnh_cliente: hom.cnh_cliente_url ?? null,
        procuracao_cliente: hom.procuracao_cliente_url ?? null,
        cartao_cnpj: hom.cartao_cnpj_url ?? null,
        contrato_social: hom.contrato_social_url ?? null,
      },
      socios: Array.isArray(hom.docs_socios) ? hom.docs_socios : [],
      documentosCompletosEm: hom.documentos_completos_em ?? null,
    }))
  } catch {
    return vazio
  }
}
