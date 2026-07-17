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
