/**
 * Traduz erros do SDK Anthropic pra mensagens amigáveis em pt-BR.
 * Evita que erros crus (JSON com "invalid_request_error" etc) apareçam
 * pro usuário. Também retorna código estruturado pro frontend saber o tipo.
 */

export type ErroAnthropic = {
  codigo: 'sem_creditos' | 'rate_limit' | 'chave_invalida' | 'timeout' | 'servidor' | 'desconhecido'
  mensagem: string       // texto pt-BR amigável
  acao?: string          // sugestão de próximo passo
  tecnico?: string       // erro cru pra logs
}

export function traduzirErroAnthropic(e: any): ErroAnthropic {
  const tecnico = e?.message || String(e || '')
  const msg = tecnico.toLowerCase()

  // Credit balance zerado (o erro que Kalebe pegou)
  if (
    msg.includes('credit balance is too low') ||
    msg.includes('billing') ||
    msg.includes('insufficient credits')
  ) {
    return {
      codigo: 'sem_creditos',
      mensagem: 'Não consigo acessar a IA agora — a conta Anthropic está sem crédito.',
      acao: 'Recarregue em console.anthropic.com/settings/billing (~$20 costuma durar dias).',
      tecnico,
    }
  }

  // Rate limit
  if (msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('429')) {
    return {
      codigo: 'rate_limit',
      mensagem: 'Muitas requisições em pouco tempo. Aguarde ~30 segundos e tente de novo.',
      tecnico,
    }
  }

  // Chave inválida
  if (
    msg.includes('invalid_api_key') ||
    msg.includes('authentication_error') ||
    msg.includes('unauthorized') ||
    msg.includes('401')
  ) {
    return {
      codigo: 'chave_invalida',
      mensagem: 'A chave da IA está inválida ou não configurada.',
      acao: 'Confira a variável ANTHROPIC_API_KEY no Vercel.',
      tecnico,
    }
  }

  // Timeout / rede
  if (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network')
  ) {
    return {
      codigo: 'timeout',
      mensagem: 'A IA demorou pra responder. Tente novamente.',
      tecnico,
    }
  }

  // 500/502/503 no upstream
  if (
    msg.includes('overloaded') ||
    msg.includes('service_unavailable') ||
    msg.includes('internal') ||
    msg.match(/50\d/)
  ) {
    return {
      codigo: 'servidor',
      mensagem: 'A IA está instável no momento. Tente novamente em 1-2 minutos.',
      tecnico,
    }
  }

  return {
    codigo: 'desconhecido',
    mensagem: 'Deu um erro inesperado com a IA. Se persistir, me avise.',
    tecnico,
  }
}
