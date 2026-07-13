/**
 * Regra de composição — decide quais blocos incluir na proposta
 * conforme tipo do projeto, segmento e versão.
 */

import type { SegmentoCliente, VersaoProposta } from './tipos'

export type BlocoChave =
  | 'capa'
  | 'sumario_executivo'
  | 'ficha_cliente'
  | 'analise_consumo'
  | 'dimensionamento_tecnico'
  | 'especificacao_equipamentos'
  | 'escopo_servico'
  | 'composicao_preco'
  | 'formas_pagamento'
  | 'comparativo_financeiro'
  | 'analise_financeira_completa'
  | 'grafico_25_anos'
  | 'normas_certificacoes'
  | 'cronograma'
  | 'garantias'
  | 'termos_condicoes'
  | 'assinaturas'

export type ContextoComposicao = {
  segmento: SegmentoCliente
  versao: VersaoProposta
  temSistema: boolean       // FV / BESS / VE / híbrido
  temServico: boolean       // limpeza, manutenção, etc
}

/**
 * Retorna array de blocos na ordem correta pra compor a proposta.
 */
export function getBlocosDaProposta(ctx: ContextoComposicao): BlocoChave[] {
  const { segmento, versao, temSistema, temServico } = ctx
  const eResidencial = segmento === 'residencial'
  const eComercialIndustrial = segmento !== 'residencial'
  const eSimplificada = versao === 'simplificada'
  const eRefinada = versao === 'refinada'

  const blocos: BlocoChave[] = []

  // === Sempre ===
  blocos.push('capa', 'sumario_executivo', 'ficha_cliente')

  // === Contexto do consumo (só se tem sistema FV) ===
  if (temSistema && eRefinada) {
    blocos.push('analise_consumo')
  }

  // === Dimensionamento técnico (só sistema + refinada) ===
  if (temSistema && eRefinada) {
    blocos.push('dimensionamento_tecnico')
  }

  // === Equipamentos ===
  if (temSistema) {
    blocos.push('especificacao_equipamentos')
  }

  // === Escopo do serviço (se tem serviço) ===
  if (temServico) {
    blocos.push('escopo_servico')
  }

  // === Composição de preço ===
  blocos.push('composicao_preco')

  // === Comparativo financeiro (a estrela) ===
  // Sempre presente quando tem sistema — é o que fecha venda
  if (temSistema) {
    blocos.push('comparativo_financeiro')
  }

  // === Análise financeira completa (TIR/VPL) — só comercial refinada ===
  if (eComercialIndustrial && eRefinada && temSistema) {
    blocos.push('analise_financeira_completa')
  }

  // === Gráfico 25 anos (residencial refinada + comercial refinada) ===
  if (eRefinada && temSistema) {
    blocos.push('grafico_25_anos')
  }

  // === Formas de pagamento ===
  blocos.push('formas_pagamento')

  // === Cronograma (refinada) ===
  if (eRefinada) {
    blocos.push('cronograma')
  }

  // === Normas (comercial refinada) ===
  if (eComercialIndustrial && eRefinada) {
    blocos.push('normas_certificacoes')
  }

  // === Garantias (sempre, mas simplificado em simplificada) ===
  blocos.push('garantias')

  // === Termos e assinatura ===
  blocos.push('termos_condicoes', 'assinaturas')

  return blocos
}

/** Estimativa de páginas por bloco (pra estimar tamanho do PDF). */
export const PAGINAS_POR_BLOCO: Record<BlocoChave, number> = {
  capa: 1,
  sumario_executivo: 0.5,
  ficha_cliente: 0.5,
  analise_consumo: 1,
  dimensionamento_tecnico: 1,
  especificacao_equipamentos: 1,
  escopo_servico: 1,
  composicao_preco: 0.5,
  formas_pagamento: 0.5,
  comparativo_financeiro: 2,
  analise_financeira_completa: 1,
  grafico_25_anos: 1,
  normas_certificacoes: 0.5,
  cronograma: 0.5,
  garantias: 0.5,
  termos_condicoes: 0.5,
  assinaturas: 0.5,
}
