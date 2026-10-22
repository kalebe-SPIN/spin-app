/**
 * Disparo em massa do Spinzap (Kalebe 2026-10-22) — regras comuns à tela e
 * ao servidor.
 */

/** Até 100 contatos por disparo (protege o número contra denúncias em massa) */
export const LIMITE_DISPARO = 100

/** Limites do WhatsApp por tipo de arquivo (MB) */
export const LIMITE_MB_MIDIA: Record<'image' | 'video' | 'audio' | 'document', number> = { image: 5, video: 16, audio: 16, document: 16 }

export const tipoDoMime = (mime: string): 'image' | 'video' | 'audio' | 'document' =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document'
