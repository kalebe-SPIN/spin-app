/**
 * Tipos de evento da agenda criados pela conversa (Kalebe 2026-10-13: entrou
 * "Call" — videochamada com sala gerada — e "Reunião externa", no endereço
 * do cliente). Ordem A→Z (regra dos dropdowns). Sem import de servidor.
 */
export type TipoEvento = 'call' | 'ligacao' | 'reuniao' | 'reuniao_externa' | 'visita_tecnica'

export const TIPOS_EVENTO: Array<{ valor: TipoEvento; rotulo: string; emoji: string }> = [
  { valor: 'call', rotulo: 'Call (vídeo)', emoji: '🎥' },
  { valor: 'ligacao', rotulo: 'Ligação', emoji: '📞' },
  { valor: 'reuniao', rotulo: 'Reunião', emoji: '🤝' },
  { valor: 'reuniao_externa', rotulo: 'Reunião externa', emoji: '🚗' },
  { valor: 'visita_tecnica', rotulo: 'Visita técnica', emoji: '🔧' },
]

export function rotuloTipoEvento(tipo: string | null | undefined): string {
  const t = TIPOS_EVENTO.find((x) => x.valor === tipo)
  return t ? `${t.emoji} ${t.rotulo}` : String(tipo || 'Evento')
}
