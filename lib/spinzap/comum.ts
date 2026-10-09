import { GRUPOS_INFO, TIPOS_ITEM, getInfoTipo, type Grupo, type TipoItem } from '@/lib/tipos-projeto'

/**
 * Spinzap (Kalebe 2026-10-09) — o Inbox vira o centro do sistema. Regras
 * comuns (sem import de servidor): etapas do atendimento, etiquetas de
 * produto/perfil e o setor de cada conversa.
 */

export type Etapa =
  | 'atendimento_lais' | 'reuniao_agendada' | 'reagendamento' | 'negocio_andamento'
  | 'visita_agendada' | 'fechado' | 'perdido'

/** Ordem da barra lateral (como um CRM), com cor por etapa. */
export const ETAPAS: Array<{ chave: Etapa; rotulo: string; emoji: string; cls: string }> = [
  { chave: 'atendimento_lais', rotulo: 'Atendimento Laís', emoji: '🤖', cls: 'bg-weg-azul/15 border-weg-azul/40 text-weg-azul' },
  { chave: 'reuniao_agendada', rotulo: 'Reunião agendada', emoji: '📅', cls: 'bg-sol/15 border-sol/40 text-sol' },
  { chave: 'reagendamento', rotulo: 'Reagendamento', emoji: '🔁', cls: 'bg-coral/10 border-coral/40 text-coral' },
  { chave: 'negocio_andamento', rotulo: 'Negócio em andamento', emoji: '💼', cls: 'bg-[#a78bfa]/15 border-[#a78bfa]/40 text-[#a78bfa]' },
  { chave: 'visita_agendada', rotulo: 'Visita campo agendada', emoji: '🚐', cls: 'bg-[#22d3ee]/15 border-[#22d3ee]/40 text-[#22d3ee]' },
  { chave: 'fechado', rotulo: 'Fechado', emoji: '✅', cls: 'bg-verde/15 border-verde/40 text-verde' },
  { chave: 'perdido', rotulo: 'Perdido', emoji: '✕', cls: 'bg-white/5 border-white/20 text-white/50' },
]
export const INFO_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.chave, e])) as Record<Etapa, (typeof ETAPAS)[number]>
export const ordemEtapa = (e: string | null | undefined) => {
  const i = ETAPAS.findIndex((x) => x.chave === e)
  return i < 0 ? 0 : i
}

/** Produto/serviço = tipo do item; perfil de compra = a família (grupo) dele. */
export function infoProduto(tipo: string | null | undefined): { rotulo: string; emoji: string; grupo: Grupo | null; perfil: string | null } | null {
  if (!tipo) return null
  const t = getInfoTipo(tipo as TipoItem)
  if (!t) return { rotulo: tipo, emoji: '📦', grupo: null, perfil: null }
  return { rotulo: t.label, emoji: t.emoji, grupo: t.grupo, perfil: GRUPOS_INFO[t.grupo].label }
}

/** Opções de produto/serviço (os itens que o sistema oferece hoje). */
export const PRODUTOS = TIPOS_ITEM.filter((t) => t.disponivel && !t.oculto)
  .map((t) => ({ valor: t.chave, rotulo: `${t.emoji} ${t.label}`, label: t.label, grupo: t.grupo }))
  .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

/** Perfis de compra = famílias que têm algum produto disponível (A→Z). */
export const PERFIS = Array.from(new Set(PRODUTOS.map((p) => p.grupo)))
  .map((g) => ({ valor: g, rotulo: GRUPOS_INFO[g].label }))
  .sort((a, b) => a.rotulo.replace(/^\W+/, '').localeCompare(b.rotulo.replace(/^\W+/, ''), 'pt-BR'))

/** Setor da conversa: Laís (IA no comando), sem responsável, ou o setor de quem atende. */
export const SETOR_LAIS = 'lais'
export const SETOR_SEM_RESPONSAVEL = 'sem_responsavel'
