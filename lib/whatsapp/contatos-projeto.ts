import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Contatos do projeto vindos da conversa (Kalebe 2026-09-29): o cliente
 * repassa o contato do decisor (cartão de contato do WhatsApp ou número
 * digitado) e ele fica salvo no mesmo projeto (tabela projeto_contatos).
 */

export type PapelContato = 'decisor' | 'financeiro' | 'tecnico' | 'outro'
export type ContatoCartao = { nome: string; telefone: string | null; email: string | null }

/** Telefone só dígitos com DDI 55 (10/11 dígitos brasileiros ganham o 55). */
export function normalizarTelefoneContato(t: string | null | undefined): string | null {
  let d = String(t || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d.length >= 12 && d.length <= 13 ? d : null
}

/** Cartões de contato de uma mensagem 'contacts' do webhook da Meta. */
export function extrairCartoes(msg: any): ContatoCartao[] {
  return (msg?.contacts || []).map((c: any) => {
    const fone = (c.phones || [])[0] || {}
    return {
      nome: c.name?.formatted_name || [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ') || 'Contato',
      telefone: normalizarTelefoneContato(fone.wa_id || fone.phone),
      email: (c.emails || [])[0]?.email || null,
    }
  })
}

/** Texto curto pro histórico e pros agentes: "📇 Fulano · (48) 99999-0000" */
export function textoDosCartoes(cartoes: ContatoCartao[]): string {
  return cartoes.map((c) => `📇 ${c.nome}${c.telefone ? ` · ${formatarTelefoneExibicao(c.telefone)}` : ''}`).join('\n')
}

/** Lê de volta os cartões a partir do texto gravado ("📇 Nome · (48) 99999-0000"). */
export function cartoesDoTexto(texto: string | null | undefined): ContatoCartao[] {
  return String(texto || '').split('\n')
    .map((l) => l.match(/^📇\s*(.+?)(?:\s·\s(.+))?$/))
    .filter(Boolean)
    .map((m) => ({ nome: m![1].trim(), telefone: normalizarTelefoneContato(m![2] || ''), email: null }))
}

/** Telefones brasileiros digitados numa mensagem (com DDD). */
export function telefonesNoTexto(texto: string | null | undefined): string[] {
  const achados = String(texto || '').match(/(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}/g) || []
  return Array.from(new Set(achados.map((t) => normalizarTelefoneContato(t)).filter(Boolean) as string[]))
}

export function formatarTelefoneExibicao(t: string): string {
  const d = t.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

/**
 * Grava no projeto os contatos que ainda não estão lá (mesmo telefone não
 * duplica). Retorna quantos entraram.
 */
export async function salvarContatosNoProjeto(
  db: SupabaseClient,
  entrada: {
    projeto_id: string
    contatos: Array<{ nome: string; telefone: string | null; email?: string | null; papel?: PapelContato; observacao?: string | null }>
    origem: 'whatsapp_cartao' | 'whatsapp_texto' | 'manual'
    wa_mensagem_id?: string | null
    criado_por?: string | null
  },
): Promise<number> {
  const validos = entrada.contatos.filter((c) => c.nome?.trim() || c.telefone)
  if (validos.length === 0) return 0
  const { data: existentes } = await db
    .from('projeto_contatos')
    .select('telefone')
    .eq('projeto_id', entrada.projeto_id)
  const jaTem = new Set((existentes || []).map((e: any) => e.telefone).filter(Boolean))
  const novos = validos
    .filter((c) => !c.telefone || !jaTem.has(c.telefone))
    .map((c) => ({
      projeto_id: entrada.projeto_id,
      nome: (c.nome || 'Contato').trim(),
      telefone: c.telefone,
      email: c.email || null,
      papel: c.papel || 'decisor',
      observacao: c.observacao || null,
      origem: entrada.origem,
      wa_mensagem_id: entrada.wa_mensagem_id || null,
      criado_por: entrada.criado_por || null,
    }))
  if (novos.length === 0) return 0
  const { error } = await db.from('projeto_contatos').insert(novos)
  if (error) {
    throw new Error(error.message.includes('projeto_contatos')
      ? 'Falta rodar a migration 124 no Supabase.'
      : error.message)
  }
  return novos.length
}
