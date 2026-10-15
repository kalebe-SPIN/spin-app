import { CONFIG_SECAO, TIPOS_SECAO } from '@/lib/propostas/secoes'

/**
 * O que o painel de precificação mostra em cada proposta (Kalebe 2026-10-14).
 * Parâmetros = chaves de parametros_precificacao que o motor daquela
 * categoria usa (editar muda o sistema todo); serviços = parâmetros dos
 * serviços O&M; itens = itens com variáveis e faixas (seções e tabelas).
 */

export type ContextoPainel = 'fotovoltaico' | 'recarga' | 'bess' | 'om' | 'projetos'

export type DefParametro = { chave: string; rotulo: string; unidade?: string; grupo?: string; padrao?: number }

const COMUNS: DefParametro[] = [
  { chave: 'margem_contribuicao_perc', rotulo: 'Margem da empresa', unidade: '%' },
  { chave: 'comissao_vendedor_perc', rotulo: 'Comissão de venda', unidade: '%' },
  { chave: 'aliquota_simples_perc', rotulo: 'Imposto sobre a nota Spin', unidade: '%' },
  { chave: 'margem_minima_negociacao_perc', rotulo: 'Margem mínima na negociação', unidade: '%' },
  { chave: 'desconto_a_vista_pix_perc', rotulo: 'Desconto à vista no PIX', unidade: '%' },
  { chave: 'parcelas_cartao_padrao', rotulo: 'Parcelas no cartão', unidade: 'x' },
  { chave: 'juros_cartao_total_perc', rotulo: 'Juros totais do cartão', unidade: '%' },
]
const PROJETO: DefParametro[] = [
  { chave: 'projeto_valor_fixo_ate_30kwp', rotulo: 'Projeto + ART até 30 kW', unidade: 'R$' },
  { chave: 'projeto_rs_por_kwp_acima_30kwp', rotulo: 'Projeto acima de 30 kW', unidade: 'R$/kW' },
]
const DIAGRAMAS: DefParametro[] = [
  { chave: 'valor_diagrama_unifilar', rotulo: 'Diagrama unifilar', unidade: 'R$' },
  { chave: 'valor_diagrama_trifilar', rotulo: 'Diagrama trifilar', unidade: 'R$' },
]

/** Itens de seção (aluguel, alvenaria…) — aparecem em todas as propostas. */
const ITENS_SECOES = TIPOS_SECAO.map((t) => ({ chave: CONFIG_SECAO[t.tipo].faixa || t.tipo, rotulo: `${t.emoji} ${t.rotulo}` }))

export const CONTEXTOS_PAINEL: Record<ContextoPainel, { titulo: string; parametros: DefParametro[]; servicos: string[]; itens: Array<{ chave: string; rotulo: string }> }> = {
  fotovoltaico: {
    titulo: 'Projeto fotovoltaico',
    parametros: [
      ...COMUNS,
      { chave: 'fator_kit_weg_preco_cliente', rotulo: 'Fator sobre a tabela WEG', unidade: '×' },
      ...PROJETO,
      { chave: 'frete_ate_16_placas', rotulo: 'Frete até 16 placas', unidade: 'R$' },
      { chave: 'frete_acima_16_placas', rotulo: 'Frete acima de 16 placas', unidade: 'R$' },
      { chave: 'frete_km_extra_fora_raio', rotulo: 'Frete por km fora do raio', unidade: 'R$/km' },
    ],
    servicos: [],
    itens: ITENS_SECOES,
  },
  recarga: {
    titulo: 'Estação de recarga',
    parametros: [
      ...COMUNS,
      ...DIAGRAMAS,
      { chave: 'valor_diaria_eletrica_predial', rotulo: 'Diária do eletricista', unidade: 'R$/dia' },
      { chave: 've_instaladores', rotulo: 'Instaladores', unidade: 'pessoas' },
      { chave: 've_horas_instalacao_por_carregador', rotulo: 'Horas por carregador', unidade: 'h' },
      { chave: 've_horas_por_diaria', rotulo: 'Horas de uma diária', unidade: 'h' },
      { chave: 've_dias_extra_alvenaria', rotulo: 'Dias a mais com alvenaria', unidade: 'dias' },
      { chave: 've_distancia_padrao_m', rotulo: 'Distância padrão até a conexão', unidade: 'm' },
      { chave: 'valor_km_rodado', rotulo: 'Deslocamento por km', unidade: 'R$/km' },
      // Kalebe 2026-10-15: trecho subterrâneo (custo por metro; sem padrão — definir aqui)
      { chave: 've_vala_m', rotulo: 'Vala: abrir, passar a tubulação e fechar (mão de obra)', unidade: 'R$/m', grupo: 've_recarga' },
      { chave: 've_tubo_subterraneo_m', rotulo: 'Tubulação subterrânea (material)', unidade: 'R$/m', grupo: 've_recarga' },
      { chave: 've_concretagem_m', rotulo: 'Recomposição em concreto', unidade: 'R$/m', grupo: 've_recarga' },
    ],
    servicos: [],
    itens: ITENS_SECOES,
  },
  bess: {
    titulo: 'Sistema BESS',
    parametros: [
      ...COMUNS,
      { chave: 'fator_kit_weg_preco_cliente', rotulo: 'Fator sobre a tabela WEG', unidade: '×' },
      { chave: 'bess_mo_por_inversor', rotulo: 'Instalação por inversor', unidade: 'R$', grupo: 'bess', padrao: 1200 },
      { chave: 'bess_mo_por_bateria', rotulo: 'Instalação por bateria', unidade: 'R$', grupo: 'bess', padrao: 200 },
      ...PROJETO,
      { chave: 'frete_ate_16_placas', rotulo: 'Frete', unidade: 'R$' },
    ],
    servicos: [],
    itens: ITENS_SECOES,
  },
  om: {
    titulo: 'O&M',
    parametros: [COMUNS[4], COMUNS[5], COMUNS[6]],
    servicos: ['limpeza_fotovoltaica', 'revisao_manutencao', 'retirada_recolocacao'],
    itens: [
      { chave: 'limpeza_fotovoltaica', rotulo: '🧹 Limpeza (faixa de referência)' },
      { chave: 'revisao_manutencao', rotulo: '🔧 Revisão (faixa de referência)' },
      { chave: 'retirada_recolocacao', rotulo: '🔄 Retirada e recolocação (faixa de referência)' },
      ...ITENS_SECOES,
    ],
  },
  projetos: {
    titulo: 'Projetos técnicos',
    parametros: [COMUNS[0], COMUNS[1], COMUNS[2], ...PROJETO, ...DIAGRAMAS],
    servicos: [],
    itens: [
      { chave: 'laudo_tecnico', rotulo: '📋 Laudo técnico' },
      { chave: 'analise_rede', rotulo: '📊 Análise de rede' },
      ...ITENS_SECOES,
    ],
  },
}

export const MODOS_VARIAVEL: Array<{ valor: 'por_unidade' | 'faixa_total' | 'por_item' | 'fixo'; rotulo: string; ajuda: string }> = [
  { valor: 'por_unidade', rotulo: 'Por unidade', ajuda: 'valor da faixa × quantidade' },
  { valor: 'faixa_total', rotulo: 'Valor da faixa', ajuda: 'a faixa que contém a quantidade dá o valor total' },
  { valor: 'por_item', rotulo: 'Por item da tabela', ajuda: 'escolhe um item (descrição da faixa) × quantidade' },
  { valor: 'fixo', rotulo: 'Valor fixo', ajuda: 'valor da primeira faixa, uma vez' },
]
