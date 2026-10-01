/**
 * Erro de entrega da Meta (webhook de status 'failed') em português, com o
 * que fazer (Kalebe 2026-10-01: "Business eligibility payment issue" aparecia
 * cru no inbox e a Laís parecia ter enviado). Sem import de servidor.
 */
const POR_CODIGO: Record<number, string> = {
  131042: 'Meta recusou: a conta do WhatsApp Business está sem forma de pagamento válida (mensagem por modelo é cobrada). Cadastre o cartão no Gerenciador do WhatsApp → Pagamentos.',
  131047: 'Janela de 24h fechada: o cliente não escreveu nas últimas 24h. Use o modelo de retomada ou o app WhatsApp Business.',
  131049: 'Meta segurou a entrega pra não saturar o cliente (limite de mensagens de marketing). Tente mais tarde ou pelo app WhatsApp Business.',
  131026: 'Não entregue: o número não tem WhatsApp, está desatualizado ou bloqueou a Spin.',
  131051: 'Tipo de mensagem não suportado pelo WhatsApp.',
  131053: 'Falha no envio da mídia (arquivo inválido ou grande demais).',
  131056: 'Muitas mensagens seguidas pro mesmo número — aguarde um pouco.',
  132000: 'Modelo com número de variáveis errado.',
  132001: 'Modelo não existe ou ainda não foi aprovado nesse idioma.',
  132015: 'Modelo pausado pela Meta (baixa qualidade).',
  132016: 'Modelo desativado pela Meta.',
  368: 'Conta temporariamente bloqueada pela Meta por violação de política.',
  130472: 'Meta não entregou (experimento de marketing da Meta com esse número).',
}

export function traduzirErroMeta(err: { code?: number; title?: string; message?: string } | null | undefined): string {
  if (!err) return 'Falhou (sem detalhe da Meta)'
  const traduzido = err.code != null ? POR_CODIGO[Number(err.code)] : undefined
  if (traduzido) return traduzido
  const original = err.title || err.message || 'Falhou'
  return err.code != null ? `${original} (código ${err.code})` : original
}
