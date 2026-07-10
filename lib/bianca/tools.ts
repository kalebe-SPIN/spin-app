import type Anthropic from '@anthropic-ai/sdk'

export const BIANCA_TOOLS: Anthropic.Tool[] = [
  {
    name: 'criar_evento',
    description: 'Cria um novo evento na agenda do usuário (reunião, visita, ligação, apresentação). Use quando o usuário pedir para agendar algum compromisso.',
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
      },
      required: ['titulo', 'data_hora_inicio'],
    },
  },
  {
    name: 'criar_tarefa',
    description: 'Cria uma tarefa (to-do). Use quando o usuário pedir para lembrar de algo, adicionar pendência ou marcar algo a fazer.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        data_prazo: { type: 'string', description: 'Data limite YYYY-MM-DD (opcional).' },
        prioridade: { type: 'string', enum: ['baixa', 'media', 'alta', 'urgente'], description: 'Padrão: media' },
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
