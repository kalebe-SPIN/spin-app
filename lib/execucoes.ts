/**
 * Helpers do modulo Execucoes — pipeline de obras/servicos contratados.
 */

export type StatusExecucao =
  | 'aguardando_pre_requisitos'
  | 'agendando'
  | 'agendado'
  | 'preparando_material'
  | 'em_execucao'
  | 'concluido'
  | 'entregue'
  | 'pos_venda'
  | 'cancelado'

export const STATUS_INFO: Record<StatusExecucao, {
  label: string
  emoji: string
  cor: string        // classe tailwind (verde/sol/coral/weg-azul/white)
  bg: string
  descricao: string
  ordem: number      // pra kanban
}> = {
  aguardando_pre_requisitos: {
    label: 'Aguardando pré-requisitos',
    emoji: '⏳',
    cor: 'text-white/60',
    bg: 'bg-white/5 border-white/10',
    descricao: 'Depende de contrato, pagamento, homologação, etc.',
    ordem: 1,
  },
  agendando: {
    label: 'Agendando',
    emoji: '📞',
    cor: 'text-weg-azul',
    bg: 'bg-weg-azul/10 border-weg-azul/30',
    descricao: 'Buscando data com o cliente.',
    ordem: 2,
  },
  agendado: {
    label: 'Agendado',
    emoji: '📅',
    cor: 'text-sol',
    bg: 'bg-sol/10 border-sol/30',
    descricao: 'Data confirmada — aguardando o dia.',
    ordem: 3,
  },
  preparando_material: {
    label: 'Preparando material',
    emoji: '📦',
    cor: 'text-sol',
    bg: 'bg-sol/10 border-sol/30',
    descricao: 'Separando insumos, comprando o que falta.',
    ordem: 4,
  },
  em_execucao: {
    label: 'Em execução',
    emoji: '🔨',
    cor: 'text-coral',
    bg: 'bg-coral/10 border-coral/40',
    descricao: 'Equipe no local executando.',
    ordem: 5,
  },
  concluido: {
    label: 'Concluído',
    emoji: '✅',
    cor: 'text-verde',
    bg: 'bg-verde/10 border-verde/30',
    descricao: 'Serviço finalizado tecnicamente — aguardando aceite do cliente.',
    ordem: 6,
  },
  entregue: {
    label: 'Entregue',
    emoji: '🎉',
    cor: 'text-verde',
    bg: 'bg-verde/15 border-verde/50',
    descricao: 'Cliente assinou o aceite — obra fechada.',
    ordem: 7,
  },
  pos_venda: {
    label: 'Pós-venda / garantia',
    emoji: '🛠️',
    cor: 'text-weg-azul',
    bg: 'bg-weg-azul/5 border-weg-azul/20',
    descricao: 'Em garantia — pode ter chamados de suporte.',
    ordem: 8,
  },
  cancelado: {
    label: 'Cancelado',
    emoji: '❌',
    cor: 'text-white/40',
    bg: 'bg-white/5 border-white/10',
    descricao: 'Cancelado por desistência ou impossibilidade.',
    ordem: 9,
  },
}

/** Proximas transicoes sugeridas por status (o consultor pode saltar) */
export const PROXIMOS_STATUS: Record<StatusExecucao, StatusExecucao[]> = {
  aguardando_pre_requisitos: ['agendando', 'cancelado'],
  agendando:                 ['agendado', 'cancelado'],
  agendado:                  ['preparando_material', 'em_execucao', 'cancelado'],
  preparando_material:       ['em_execucao', 'cancelado'],
  em_execucao:               ['concluido', 'cancelado'],
  concluido:                 ['entregue', 'em_execucao'],
  entregue:                  ['pos_venda'],
  pos_venda:                 [],
  cancelado:                 ['agendando'],
}

/** Titulo humano do tipo de servico (fallback pra chave) */
export function getTituloTipo(tipo: string): string {
  const map: Record<string, string> = {
    fv_ongrid: 'Sistema FV on-grid',
    fv_hibrido: 'Sistema FV híbrido BESS',
    fv_zero_grid: 'Sistema FV zero-grid',
    fv_offgrid: 'Sistema FV off-grid',
    bess: 'BESS standalone',
    ve_recarga: 'Estação de recarga VE',
    srv_limpeza: 'Limpeza fotovoltaica',
    srv_manutencao: 'Revisão e manutenção',
    srv_eletrica_predial: 'Elétrica predial',
    srv_padrao_entrada: 'Padrão de entrada CELESC',
    srv_laudo_tecnico: 'Laudo técnico',
    srv_analise_rede: 'Análise de rede',
    srv_retirada_recolocacao: 'Retirada e recolocação de módulos',
    srv_instalacao_placas: 'Instalação de módulos em projeto',
    srv_alvenaria: 'Alvenaria',
    srv_serralheria: 'Serralheria',
    srv_carpintaria: 'Carpintaria',
    aluguel_maquinas: 'Aluguel de máquinas pesadas',
    aluguel_equipamentos: 'Aluguel de equipamentos',
    outros: 'Outros',
  }
  return map[tipo] || tipo
}
