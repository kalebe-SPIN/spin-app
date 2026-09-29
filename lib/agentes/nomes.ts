/**
 * Nomes dos agentes num lugar só (Kalebe 2026-09-27: o SDR do inbox foi
 * batizado de Laís — antes era "Assistente Spin").
 * Módulo sem dependências pra evitar import circular entre whatsapp/ e agentes/.
 */
export const NOME_SDR = 'Laís'
export const NOME_BIANCA = 'Bianca'
export const NOME_DAVI = 'Davi'

/** Endereço do portal pra links nas mensagens internas */
export const URL_PORTAL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.spinsolar.com.br'
