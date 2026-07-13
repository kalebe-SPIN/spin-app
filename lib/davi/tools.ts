import type Anthropic from '@anthropic-ai/sdk'

export const DAVI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'listar_produtos_sem_preco',
    description: 'Lista produtos ATIVOS do catálogo que não têm preço vigente. Prioridade máxima pra cotação. Use quando o admin pergunta "o que preciso cotar?" ou "quais produtos estão sem preço?".',
    input_schema: {
      type: 'object',
      properties: {
        categoria: { type: 'string', description: 'Filtrar por categoria (opcional): placa, inversor, cabo_ca, disjuntor, dps, quadro, etc.' },
        limite: { type: 'number', description: 'Máximo de resultados. Padrão: 20.' },
      },
    },
  },
  {
    name: 'listar_produtos_desatualizados',
    description: 'Lista produtos cujo preço vigente foi definido há mais de X dias. Use pra pedir revisão de cotações antigas.',
    input_schema: {
      type: 'object',
      properties: {
        dias_minimos: { type: 'number', description: 'Mínimo de dias sem atualização. Padrão: 60.' },
        limite: { type: 'number' },
      },
    },
  },
  {
    name: 'buscar_produto',
    description: 'Busca um produto específico no catálogo por nome, modelo ou código WEG. Retorna preço vigente e histórico.',
    input_schema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Nome, modelo ou código a buscar' },
      },
      required: ['termo'],
    },
  },
  {
    name: 'registrar_cotacao',
    description: 'Registra uma cotação recebida de um fornecedor. Não atualiza o preço vigente automaticamente — só armazena a cotação. Use quando o admin cola preço recebido.',
    input_schema: {
      type: 'object',
      properties: {
        produto_id: { type: 'string', description: 'UUID do produto (se cadastrado)' },
        descricao_livre: { type: 'string', description: 'Descrição do item se não tem produto cadastrado' },
        categoria: { type: 'string' },
        preco_cotado: { type: 'number', description: 'Preço em reais' },
        unidade: { type: 'string', description: 'un, m, kg, kit... padrão: un' },
        fornecedor_nome: { type: 'string' },
        cidade: { type: 'string' },
        uf: { type: 'string' },
        validade_dias: { type: 'number' },
        observacoes: { type: 'string' },
      },
      required: ['preco_cotado', 'fornecedor_nome'],
    },
  },
  {
    name: 'atualizar_preco_produto',
    description: 'Aplica um novo preço vigente ao produto. Encerra o preço anterior automaticamente. Use SÓ quando o admin confirmar explicitamente que quer aplicar. Retorna a variação vs preço antigo.',
    input_schema: {
      type: 'object',
      properties: {
        produto_id: { type: 'string' },
        novo_preco: { type: 'number' },
        fonte: { type: 'string', description: 'Origem: manual, cotacao_id, planilha_weg_2026-07 etc' },
      },
      required: ['produto_id', 'novo_preco'],
    },
  },
  {
    name: 'historico_precos',
    description: 'Mostra evolução do preço de um produto ao longo do tempo. Use pra análise de tendências.',
    input_schema: {
      type: 'object',
      properties: {
        produto_id: { type: 'string' },
      },
      required: ['produto_id'],
    },
  },
  {
    name: 'solicitacoes_pendentes',
    description: 'Lista solicitações de cotação abertas — produtos que Listas CA/projetos identificaram como sem preço.',
    input_schema: {
      type: 'object',
      properties: {
        limite: { type: 'number' },
      },
    },
  },
  {
    name: 'resumo_situacao',
    description: 'Panorama geral: total produtos, sem preço, desatualizados, cotações recentes, solicitações pendentes. Use quando o admin pergunta "como estamos?".',
    input_schema: { type: 'object', properties: {} },
  },
]
