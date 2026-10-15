import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Pendências abertas da agenda por conversa (Kalebe 2026-10-15): na lista do
 * Spinzap, cada conversa mostra um ícone por tipo — tarefa, follow-up,
 * lembrete ao cliente e evento — pra ver o status sem abrir uma por uma.
 * Três consultas pra lista inteira (itens abertos que têm conversa).
 */

type Admin = ReturnType<typeof createAdminClient>

export type TipoPendencia = 'tarefa' | 'followup' | 'lembrete' | 'evento'
export type PendenciaConversa = {
  tipo: TipoPendencia
  titulo: string
  /** ISO (follow-up, lembrete, evento) ou YYYY-MM-DD (tarefa) */
  quando: string
  atrasada: boolean
  responsavel: string | null
}

const primeiroNome = (x: any) => String(x?.nome_completo || '').split(' ')[0] || null
const curto = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

export async function pendenciasDasConversas(admin: Admin, ids: Set<string>): Promise<Map<string, PendenciaConversa[]>> {
  const mapa = new Map<string, PendenciaConversa[]>()
  if (!ids.size) return mapa
  const hoje = hojeSP()
  const agora = Date.now()
  const inicioHoje = new Date(`${hoje}T00:00:00-03:00`).toISOString()
  const [t, f, e] = await Promise.all([
    admin.from('agenda_tarefas').select('wa_conversa_id, titulo, data_prazo, usuario:usuario_id(nome_completo)')
      .not('wa_conversa_id', 'is', null).in('status', ['pendente', 'em_andamento']).limit(2000),
    admin.from('wa_followups').select('conversa_id, executar_em, modo, mensagem, cancelar_se_responder, responsavel:responsavel_id(nome_completo)')
      .eq('status', 'agendado').limit(2000),
    admin.from('agenda_eventos').select('wa_conversa_id, titulo, data_hora_inicio, status, usuario:usuario_id(nome_completo)')
      .not('wa_conversa_id', 'is', null).gte('data_hora_inicio', inicioHoje).limit(2000),
  ])
  const add = (conversa: string | null, p: PendenciaConversa) => {
    if (!conversa || !ids.has(conversa)) return
    const l = mapa.get(conversa)
    if (l) l.push(p); else mapa.set(conversa, [p])
  }
  for (const x of (t.data || []) as any[]) {
    add(x.wa_conversa_id, {
      tipo: 'tarefa', titulo: curto(String(x.titulo || 'Tarefa')), quando: x.data_prazo || hoje,
      atrasada: !!x.data_prazo && x.data_prazo < hoje, responsavel: primeiroNome(x.usuario),
    })
  }
  for (const x of (f.data || []) as any[]) {
    // Lembrete ao cliente = follow-up que não cancela se o cliente responder
    const lembrete = x.cancelar_se_responder === false
    const msg = String(x.mensagem || '')
    const assunto = lembrete ? (msg.match(/^Lembrete ao cliente do compromisso: (.+?) — /)?.[1] || msg) : msg
    add(x.conversa_id, {
      tipo: lembrete ? 'lembrete' : 'followup',
      titulo: curto(lembrete ? assunto : x.modo === 'texto_exato' ? `"${msg}"` : `Bianca escreve: ${msg}`),
      quando: x.executar_em,
      // Passou da hora e não saiu (janela fechada, falha) — precisa de atenção
      atrasada: new Date(x.executar_em).getTime() < agora - 10 * 60_000,
      responsavel: primeiroNome(x.responsavel),
    })
  }
  for (const x of (e.data || []) as any[]) {
    if (['cancelado', 'realizado', 'adiado'].includes(String(x.status || ''))) continue
    add(x.wa_conversa_id, { tipo: 'evento', titulo: curto(String(x.titulo || 'Evento')), quando: x.data_hora_inicio, atrasada: false, responsavel: primeiroNome(x.usuario) })
  }
  // Mais próxima primeiro
  for (const l of Array.from(mapa.values())) l.sort((a, b) => String(a.quando).localeCompare(String(b.quando)))
  return mapa
}
