/**
 * Rótulos do cartão de agenda na conversa (Kalebe 2026-10-19) — módulo puro,
 * usado pelo servidor (lib/spinzap/registro-agenda.ts) e pela tela do Spinzap.
 */

export type TipoRegistroAgenda = 'followup' | 'lembrete' | 'tarefa' | 'evento'
export type AcaoRegistroAgenda = 'concluido' | 'cancelado' | 'excluido'

export type RegistroAgenda = {
  acao: AcaoRegistroAgenda
  tipo: TipoRegistroAgenda
  titulo: string
  /** Data/hora já no padrão brasileiro (ou "sem prazo") */
  quando: string | null
  /** Primeiro nome de quem executa */
  responsavel: string | null
  /** Primeiro nome de quem concluiu/cancelou/excluiu */
  por: string | null
  /** Objetivo, mensagem, local, link da sala… */
  detalhe?: string | null
  /** Item da agenda (o cartão móvel some quando fixa) */
  item_id?: string | null
  item_tipo?: 'followup' | 'tarefa' | 'evento' | null
}

export const ROTULO_TIPO_AGENDA: Record<TipoRegistroAgenda, { emoji: string; nome: string }> = {
  followup: { emoji: '💬', nome: 'Follow-up' },
  lembrete: { emoji: '🔔', nome: 'Lembrete ao cliente' },
  tarefa: { emoji: '✅', nome: 'Tarefa' },
  evento: { emoji: '📅', nome: 'Evento' },
}
export const ROTULO_ACAO_AGENDA: Record<AcaoRegistroAgenda, string> = {
  concluido: 'concluído', cancelado: 'cancelado', excluido: 'excluído',
}

/** Texto do cartão (prévia da lista e telas que não desenham o cartão). */
export function textoRegistroAgenda(r: RegistroAgenda): string {
  const t = ROTULO_TIPO_AGENDA[r.tipo] || ROTULO_TIPO_AGENDA.tarefa
  return [
    `📌 ${t.emoji} ${t.nome} ${ROTULO_ACAO_AGENDA[r.acao] || r.acao}: ${r.titulo}`,
    r.quando ? `🕐 ${r.quando}` : null,
    r.responsavel ? `👤 Responsável: ${r.responsavel}` : null,
    r.detalhe ? `📝 ${r.detalhe}` : null,
    r.por ? `— por ${r.por}` : null,
  ].filter(Boolean).join('\n')
}
