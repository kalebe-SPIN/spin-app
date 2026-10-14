import type { TipoItem } from '@/lib/tipos-projeto'

/**
 * Categorias de proposta (Kalebe 2026-10-13): "projetos fotovoltaicos,
 * estações de recarga, sistema BESS e O&M; os demais (aluguel de máquinas e
 * equipamentos, alvenaria, elétrica predial…) são incorporados dentro das
 * propostas como sessões". Cada categoria = um projeto do contato; pedir
 * outra categoria cria um projeto novo.
 * Mapa num lugar só — ajustar aqui se uma classificação mudar.
 */

export type CategoriaProposta = 'fotovoltaico' | 'recarga' | 'bess' | 'om' | 'venda' | 'projetos'

// Kalebe 2026-10-14: "adicionar nas 4 categorias principais mais duas: venda
// de ponto de venda e projetos técnicos" — ordem = a que ele definiu
export const CATEGORIAS_PROPOSTA: Array<{ chave: CategoriaProposta; rotulo: string; emoji: string; tipoPadrao: TipoItem; descricao: string }> = [
  { chave: 'fotovoltaico', rotulo: 'Projeto fotovoltaico', emoji: '☀️', tipoPadrao: 'fv_ongrid', descricao: 'On-grid, híbrido, zero-grid, off-grid' },
  { chave: 'recarga', rotulo: 'Estação de recarga', emoji: '⚡', tipoPadrao: 've_recarga', descricao: 'Carregadores de veículo elétrico' },
  { chave: 'bess', rotulo: 'Sistema BESS', emoji: '🔋', tipoPadrao: 'bess', descricao: 'Armazenamento de energia' },
  { chave: 'om', rotulo: 'O&M', emoji: '🧹', tipoPadrao: 'srv_manutencao', descricao: 'Limpeza, manutenção, retirada e recolocação' },
  { chave: 'venda', rotulo: 'Venda (ponto de venda)', emoji: '🛒', tipoPadrao: 'venda_equipamentos', descricao: 'Venda direta de equipamentos' },
  { chave: 'projetos', rotulo: 'Projetos técnicos', emoji: '📐', tipoPadrao: 'srv_projeto_tecnico', descricao: 'Projeto elétrico, laudos, análise de rede, homologação' },
]
export const INFO_CATEGORIA = Object.fromEntries(CATEGORIAS_PROPOSTA.map((c) => [c.chave, c])) as Record<CategoriaProposta, (typeof CATEGORIAS_PROPOSTA)[number]>

/** Cada tipo de item: categoria principal OU 'secao' (entra dentro de uma proposta). */
export const CATEGORIA_DO_TIPO: Record<string, CategoriaProposta | 'secao'> = {
  fv_ongrid: 'fotovoltaico', fv_hibrido: 'fotovoltaico', fv_zero_grid: 'fotovoltaico', fv_offgrid: 'fotovoltaico',
  srv_instalacao_placas: 'fotovoltaico',
  ve_recarga: 'recarga',
  bess: 'bess',
  srv_limpeza: 'om', srv_manutencao: 'om', srv_retirada_recolocacao: 'om',
  venda_equipamentos: 'venda',
  srv_projeto_tecnico: 'projetos', srv_laudo_tecnico: 'projetos', srv_analise_rede: 'projetos',
  srv_eletrica_predial: 'secao', srv_padrao_entrada: 'secao', srv_alvenaria: 'secao', srv_serralheria: 'secao',
  srv_carpintaria: 'secao', aluguel_maquinas: 'secao', aluguel_equipamentos: 'secao', outros: 'secao',
}

/** tipo_projeto antigo (projetos criados pela Laís) → categoria */
const CATEGORIA_DO_TIPO_PROJETO: Record<string, CategoriaProposta> = {
  on_grid: 'fotovoltaico', hibrido: 'fotovoltaico', zero_grid: 'fotovoltaico', off_grid: 'fotovoltaico',
  ve_recarga: 'recarga', bess: 'bess', limpeza: 'om', revisao: 'om',
}

export function categoriaDoTipo(tipo: string | null | undefined): CategoriaProposta | 'secao' | null {
  return tipo ? CATEGORIA_DO_TIPO[tipo] || null : null
}

/** Categoria de um projeto: pelo 1º item principal; senão pelo tipo_projeto antigo. */
export function categoriaDoProjeto(itens: string[], tipoProjeto: string | null | undefined): CategoriaProposta | null {
  for (const t of itens) {
    const c = CATEGORIA_DO_TIPO[t]
    if (c && c !== 'secao') return c
  }
  return tipoProjeto ? CATEGORIA_DO_TIPO_PROJETO[tipoProjeto] || null : null
}

/** Tela onde a proposta daquele tipo é montada (fluxos que já existem no projeto). */
export function urlDoFluxo(projetoId: string, tipo: string): string {
  const base = `/projetos/${projetoId}`
  if (tipo.startsWith('fv_')) return `${base}/kit`
  if (tipo === 've_recarga') return `${base}/ve`
  if (tipo === 'bess') return `${base}/kit`
  if (tipo === 'srv_limpeza') return `${base}/servico-limpeza`
  if (tipo === 'srv_manutencao') return `${base}/servico-revisao`
  if (tipo === 'srv_retirada_recolocacao') return `${base}/servico-retirada`
  if (tipo === 'srv_instalacao_placas') return `${base}/servico-instalacao`
  if (tipo === 'venda_equipamentos') return `${base}/venda-direta`
  return `${base}/servico?tipo=${tipo}`
}
