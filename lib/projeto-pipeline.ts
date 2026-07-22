/**
 * Definição das fases do pipeline comercial da Spin.
 * Ordem cronológica: Projeto → Negócio → Venda → Execução → Pós-Venda
 */

export type StatusProjeto =
  // Fase 1: Projeto (workflow técnico)
  | 'rascunho' | 'fatura_analisada' | 'telhado_preenchido' | 'dimensionado'
  | 'kit_selecionado' | 'lista_ca_confirmada' | 'orcamento_gerado'
  // Fase 2: Negócio
  | 'proposta_enviada' | 'negociando' | 'em_fechamento'
  // Fase 3: Venda
  | 'vendido' | 'aceito'
  // Fase 4: Execução
  | 'em_homologacao' | 'em_execucao' | 'instalado'
  // Fase 5: Pós-venda
  | 'ativo_pos_venda'
  // Terminais
  | 'recusado' | 'cancelado' | 'expirado'

export type FasePipeline = 'projeto' | 'negocio' | 'venda' | 'execucao' | 'pos_venda' | 'perdido'

export const FASE_DE_STATUS: Record<StatusProjeto, FasePipeline> = {
  rascunho: 'projeto',
  fatura_analisada: 'projeto',
  telhado_preenchido: 'projeto',
  dimensionado: 'projeto',
  kit_selecionado: 'projeto',
  lista_ca_confirmada: 'projeto',
  orcamento_gerado: 'projeto',
  proposta_enviada: 'negocio',
  negociando: 'negocio',
  em_fechamento: 'negocio',
  vendido: 'venda',
  aceito: 'venda',
  em_homologacao: 'execucao',
  em_execucao: 'execucao',
  instalado: 'execucao',
  ativo_pos_venda: 'pos_venda',
  recusado: 'perdido',
  cancelado: 'perdido',
  expirado: 'perdido',
}

export const INFO_STATUS: Record<StatusProjeto, { label: string; emoji: string; fase: FasePipeline; cor: string }> = {
  rascunho:            { label: 'Rascunho',           emoji: '📝', fase: 'projeto',    cor: 'text-white/60' },
  fatura_analisada:    { label: 'Fatura OK',          emoji: '📊', fase: 'projeto',    cor: 'text-weg-azul' },
  telhado_preenchido:  { label: 'Telhado OK',         emoji: '🏠', fase: 'projeto',    cor: 'text-weg-azul' },
  dimensionado:        { label: 'Dimensionado',       emoji: '⚙️',  fase: 'projeto',    cor: 'text-weg-azul' },
  kit_selecionado:     { label: 'Kit escolhido',      emoji: '📦', fase: 'projeto',    cor: 'text-weg-azul' },
  lista_ca_confirmada: { label: 'Lista CA OK',        emoji: '🔌', fase: 'projeto',    cor: 'text-weg-azul' },
  orcamento_gerado:    { label: 'Orçamento pronto',   emoji: '💰', fase: 'projeto',    cor: 'text-sol' },
  proposta_enviada:    { label: 'Proposta enviada',   emoji: '📤', fase: 'negocio',    cor: 'text-sol' },
  negociando:          { label: 'Negociando',         emoji: '🤝', fase: 'negocio',    cor: 'text-sol' },
  em_fechamento:       { label: 'Em fechamento',      emoji: '📋', fase: 'negocio',    cor: 'text-sol' },
  vendido:             { label: 'Vendido',            emoji: '🎉', fase: 'venda',      cor: 'text-verde' },
  aceito:              { label: 'Aceito ✓',           emoji: '✅', fase: 'venda',      cor: 'text-verde' },
  em_homologacao:      { label: 'Em homologação',     emoji: '⚡', fase: 'execucao',   cor: 'text-verde' },
  em_execucao:         { label: 'Em execução',        emoji: '🔨', fase: 'execucao',   cor: 'text-verde' },
  instalado:           { label: 'Instalado',          emoji: '🔩', fase: 'execucao',   cor: 'text-verde' },
  ativo_pos_venda:     { label: 'Ativo · O&M',        emoji: '☀️',  fase: 'pos_venda',  cor: 'text-verde' },
  recusado:            { label: 'Recusado',           emoji: '❌', fase: 'perdido',    cor: 'text-coral' },
  cancelado:           { label: 'Cancelado',          emoji: '🚫', fase: 'perdido',    cor: 'text-white/40' },
  expirado:            { label: 'Expirado',           emoji: '⏰', fase: 'perdido',    cor: 'text-coral' },
}

export const INFO_FASE: Record<FasePipeline, { label: string; descricao: string; cor: string; bgClass: string; borderClass: string }> = {
  projeto:  { label: '📐 Projeto',      descricao: 'Coleta técnica → orçamento',  cor: 'weg-azul',  bgClass: 'bg-weg-azul/10', borderClass: 'border-weg-azul/40' },
  negocio:  { label: '🤝 Negócio',      descricao: 'Proposta → fechamento',        cor: 'sol',       bgClass: 'bg-sol/10',      borderClass: 'border-sol/40' },
  venda:    { label: '🎉 Venda',        descricao: 'Venda concretizada',           cor: 'verde',     bgClass: 'bg-verde/10',    borderClass: 'border-verde/40' },
  execucao: { label: '🔨 Execução',     descricao: 'Homologação → instalação',     cor: 'verde',     bgClass: 'bg-verde/10',    borderClass: 'border-verde/40' },
  pos_venda:{ label: '☀️ Pós-venda',     descricao: 'Ativo · Monitoramento · O&M', cor: 'verde',     bgClass: 'bg-verde/5',     borderClass: 'border-verde/30' },
  perdido:  { label: '💤 Perdido',      descricao: 'Recusado · Cancelado',         cor: 'coral',     bgClass: 'bg-coral/5',     borderClass: 'border-coral/30' },
}

export const FASES_ORDEM: FasePipeline[] = ['projeto', 'negocio', 'venda', 'execucao', 'pos_venda', 'perdido']

// Próximas transições sugeridas por status (o consultor pode saltar)
export const PROXIMAS_ETAPAS: Partial<Record<StatusProjeto, StatusProjeto[]>> = {
  rascunho:            ['fatura_analisada', 'cancelado'],
  fatura_analisada:    ['telhado_preenchido'],
  telhado_preenchido:  ['dimensionado'],
  dimensionado:        ['kit_selecionado'],
  kit_selecionado:     ['lista_ca_confirmada'],
  lista_ca_confirmada: ['orcamento_gerado'],
  orcamento_gerado:    ['proposta_enviada'],
  proposta_enviada:    ['negociando', 'em_fechamento', 'recusado'],
  negociando:          ['em_fechamento', 'recusado', 'proposta_enviada'],
  em_fechamento:       ['vendido', 'negociando', 'recusado'],
  vendido:             ['em_homologacao'],
  aceito:              ['em_homologacao'],
  em_homologacao:      ['em_execucao'],
  em_execucao:         ['instalado'],
  instalado:           ['ativo_pos_venda'],
  ativo_pos_venda:     [],
  recusado:            ['proposta_enviada', 'cancelado'],
  cancelado:           ['rascunho'],
  expirado:            ['proposta_enviada', 'cancelado'],
}

/**
 * Pipeline simplificado pra projetos que SÓ tem serviço (nao FV).
 * Pula passos tecnicos irrelevantes: fatura, telhado, padrao, dimensionar, kit, lista_ca.
 * Sequencia: rascunho -> orcamento_gerado -> proposta_enviada -> [negociando] -> vendido -> em_execucao -> instalado.
 */
export const PROXIMAS_ETAPAS_SERVICO: Partial<Record<StatusProjeto, StatusProjeto[]>> = {
  rascunho:            ['orcamento_gerado', 'cancelado'],
  fatura_analisada:    ['orcamento_gerado'],
  telhado_preenchido:  ['orcamento_gerado'],
  dimensionado:        ['orcamento_gerado'],
  kit_selecionado:     ['orcamento_gerado'],
  lista_ca_confirmada: ['orcamento_gerado'],
  orcamento_gerado:    ['proposta_enviada'],
  proposta_enviada:    ['negociando', 'vendido', 'recusado'],
  negociando:          ['vendido', 'recusado', 'proposta_enviada'],
  em_fechamento:       ['vendido', 'negociando', 'recusado'],
  vendido:             ['em_execucao'],    // servico nao passa por homologacao CELESC
  aceito:              ['em_execucao'],
  em_homologacao:      ['em_execucao'],
  em_execucao:         ['instalado'],
  instalado:           ['ativo_pos_venda'],
  ativo_pos_venda:     [],
  recusado:            ['proposta_enviada', 'cancelado'],
  cancelado:           ['rascunho'],
  expirado:            ['proposta_enviada', 'cancelado'],
}

/** Retorna as proximas etapas conforme se o projeto tem so servicos ou nao. */
export function getProximasEtapas(status: StatusProjeto, soServicos: boolean): StatusProjeto[] {
  const mapa = soServicos ? PROXIMAS_ETAPAS_SERVICO : PROXIMAS_ETAPAS
  return mapa[status] || []
}
