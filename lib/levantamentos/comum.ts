// Partes do módulo Levantamentos usadas no servidor e nas telas.
import { fmtNum } from '@/lib/formatters'
import type { CampoModelo, Finalidade, ModeloChecklist, StatusLevantamento } from './types'

export const BUCKET_LEVANTAMENTOS = 'levantamentos'
export const FINALIDADES: Finalidade[] = ['fv', 'padrao_novo', 'aumento_carga']

/**
 * Kalebe 2026-10-27: só o admin e o setor campo abrem, preenchem e atualizam
 * os levantamentos (o representante preenche o projeto; os dados dele entram
 * sozinhos no formulário). Mesma regra da migration 164.
 */
export const PAPEIS_CAMPO = ['profissional_campo', 'instalador']
export const podeUsarLevantamentos = (role: string | null | undefined, ativo: boolean | null | undefined) =>
  !!ativo && (role === 'admin' || PAPEIS_CAMPO.includes(String(role)))

/** Rótulos curtos das abas (página de referência). */
export const CURTO_FINALIDADE: Record<Finalidade, string> = {
  fv: 'Sistema FV',
  padrao_novo: 'Padrão novo',
  aumento_carga: 'Aumento de carga',
}

/** Status em que o autor ainda edita as respostas e as fotos. */
export const STATUS_EDITAVEIS: StatusLevantamento[] = ['rascunho', 'com_pendencia']

/** Cor da etiqueta de status (só contorno — visual minimalista). */
export const COR_STATUS: Record<StatusLevantamento, string> = {
  rascunho: 'border-white/30',
  enviado: 'border-[#4d8cff]/70',
  em_projeto: 'border-[#a78bfa]/70',
  com_pendencia: 'border-sol/80',
  aguardando_aprovacao: 'border-[#22d3ee]/70',
  aprovado: 'border-verde/70',
  cancelado: 'border-coral/70',
}

/** Abas de status da equipe de projeto. */
export const FILTROS_EQUIPE: { id: string; rotulo: string; status: StatusLevantamento[] | null }[] = [
  { id: 'todos', rotulo: 'Todos', status: null },
  { id: 'fila', rotulo: 'Fila do projeto', status: ['enviado', 'em_projeto'] },
  { id: 'aprovar', rotulo: 'Para aprovar', status: ['aguardando_aprovacao'] },
  { id: 'pendencia', rotulo: 'Com pendência', status: ['com_pendencia'] },
  { id: 'rascunho', rotulo: 'Rascunhos', status: ['rascunho'] },
  { id: 'aprovado', rotulo: 'Aprovados', status: ['aprovado'] },
]

export function camposDoModelo(m: ModeloChecklist): CampoModelo[] {
  return m.secoes.flatMap((s) => s.campos)
}

/** "12,5" / "12.5" / "1.234,5" → número; vazio ou inválido → null. */
export function numeroBR(texto: string): number | null {
  const s = texto.trim().replace(/\s/g, '')
  if (!s) return null
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** Número como o consultor digitaria (vírgula decimal, sem milhar). */
export function numeroParaCampo(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).replace('.', ',')
  return v == null ? '' : String(v)
}

/** Valor de uma resposta pronto pra leitura (números no padrão brasileiro). */
export function valorExibido(c: CampoModelo, v: unknown): string {
  if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (c.tipo === 'number') {
    const n = typeof v === 'number' ? v : numeroBR(String(v))
    if (n == null) return String(v)
    const casas = Number.isInteger(n) ? 0 : 2
    return fmtNum(n, casas, c.unidade ? ` ${c.unidade}` : undefined)
  }
  if (c.tipo === 'date') {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
  return String(v)
}

/** Mensagem do banco → texto que diz o que fazer. */
export function erroAmigavel(msg: string | undefined | null): string {
  const m = String(msg || '')
  if (/Mudança de status não permitida/i.test(m)) {
    return 'Esse passo não é permitido agora: o levantamento mudou de situação. Atualize a página e veja o status atual.'
  }
  if (/Só dá para excluir/i.test(m)) return 'Só dá para excluir um levantamento seu que esteja em rascunho ou com pendência.'
  if (/não pode mais ser removido/i.test(m)) return 'Esse arquivo não pode mais ser removido (o levantamento já foi enviado).'
  if (/acesso a esse projeto/i.test(m)) return 'Você não tem acesso a esse projeto para ligar o levantamento.'
  if (/começa como rascunho/i.test(m)) return 'Um levantamento novo começa como rascunho.'
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso neste levantamento.'
  if (/levantamentos|checklist_modelos/.test(m) && /does not exist|schema cache/i.test(m)) {
    return 'O módulo de levantamentos ainda não foi ativado no banco (migrations 162 e 163).'
  }
  return m || 'Algo deu errado. Tente de novo.'
}

/** Tabela ainda não criada (migrations 162/163 não aplicadas). */
export function faltaMigration(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))
}
