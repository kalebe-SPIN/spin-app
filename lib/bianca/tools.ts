import type Anthropic from '@anthropic-ai/sdk'

export const BIANCA_TOOLS: Anthropic.Tool[] = [
  {
    name: 'listar_projetos_ativos',
    description: 'Lista projetos ativos (não cancelados). CONSULTOR vê só os próprios; ADMIN vê da empresa toda. SEMPRE use ANTES de criar evento/tarefa quando mencionar cliente por nome.',
    input_schema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Filtrar por nome do cliente (opcional, ex: "Vanildo").' },
      },
    },
  },
  {
    name: 'listar_projetos_parados',
    description: 'ADMIN APENAS. Lista projetos que estão parados há mais de X dias no mesmo status (não avançaram). Use pra alertar sobre gargalos comerciais.',
    input_schema: {
      type: 'object',
      properties: {
        dias_minimos: { type: 'number', description: 'Mínimo de dias parado (padrão: 7)' },
      },
    },
  },
  {
    name: 'listar_homologacoes_em_andamento',
    description: 'ADMIN APENAS. Lista todas as homologações CELESC ativas (não aprovadas nem canceladas) e mostra em que etapa cada uma está, quem é responsável, e há quantos dias está travada.',
    input_schema: {
      type: 'object',
      properties: {
        atrasadas_apenas: { type: 'boolean', description: 'Se true, filtra só as com etapa parada há mais de 5 dias.' },
      },
    },
  },
  {
    name: 'listar_etapas_homologacao_atrasadas',
    description: 'ADMIN APENAS. Detalha etapas de homologação em andamento há muito tempo — ajuda supervisão de prazos.',
    input_schema: {
      type: 'object',
      properties: {
        dias_alerta: { type: 'number', description: 'Alertar etapas em_andamento há mais de X dias (padrão: 5)' },
      },
    },
  },
  {
    name: 'resumo_operacional_empresa',
    description: 'ADMIN APENAS. Panorama geral: nº projetos por status, homologações abertas, tarefas urgentes vencidas, eventos da semana. Use pra brief executivo.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'criar_evento',
    description: 'Cria um novo evento na agenda (reunião, visita, ligação, apresentação). Se for sobre um cliente com projeto, use listar_projetos_ativos ANTES pra achar o projeto_id.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título curto, ex: "Reunião com Vanildo"' },
        data_hora_inicio: { type: 'string', description: 'Data/hora início ISO 8601 com timezone -03:00 (ex: 2026-07-15T14:00:00-03:00). Baseie-se na DATA/HORA ATUAL fornecida no system prompt.' },
        data_hora_fim: { type: 'string', description: 'Data/hora fim ISO 8601 (opcional).' },
        descricao: { type: 'string', description: 'Detalhes/pauta do evento.' },
        local: { type: 'string', description: 'Endereço físico ou nome do local.' },
        url_reuniao: { type: 'string', description: 'Link do Meet/Zoom se for online.' },
        tipo: { type: 'string', enum: ['reuniao', 'visita', 'ligacao', 'geral'], description: 'Categoria. Padrão: geral' },
        cliente_nome: { type: 'string', description: 'Nome do cliente (se aplicável).' },
        projeto_id: { type: 'string', description: 'UUID do projeto vinculado (obtido via listar_projetos_ativos). Deixa vazio se não for de um projeto específico.' },
      },
      required: ['titulo', 'data_hora_inicio'],
    },
  },
  {
    name: 'criar_tarefa',
    description: 'Cria uma tarefa (to-do). Se for sobre cliente com projeto, use listar_projetos_ativos ANTES pra achar o projeto_id.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        data_prazo: { type: 'string', description: 'Data limite YYYY-MM-DD (opcional).' },
        prioridade: { type: 'string', enum: ['baixa', 'media', 'alta', 'urgente'], description: 'Padrão: media' },
        projeto_id: { type: 'string', description: 'UUID do projeto vinculado (obtido via listar_projetos_ativos). Deixa vazio se não for de projeto específico.' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'listar_eventos',
    description: 'Lista eventos do usuário em um período específico. Use pra responder "o que tem hoje/amanhã/na semana".',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'amanha', 'semana', 'mes', 'proximos_7_dias'], description: 'Padrão: hoje' },
      },
    },
  },
  {
    name: 'listar_tarefas',
    description: 'Lista tarefas do usuário. Use pra responder "quais minhas pendências".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendente', 'concluida', 'todas'], description: 'Padrão: pendente' },
      },
    },
  },
  {
    name: 'marcar_tarefa_concluida',
    description: 'Marca uma tarefa como concluída pelo ID (obtenha o ID via listar_tarefas primeiro).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'deletar_evento',
    description: 'Deleta um evento pelo ID (obtenha o ID via listar_eventos primeiro). Use com cautela — confirme antes se não estiver claro.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
]
