import { createAdminClient } from '@/lib/supabase/admin'
import { ordemEtapa, type Etapa } from './comum'

/**
 * Etapa do atendimento acompanha o projeto (Kalebe 2026-10-09): proposta
 * enviada → Negócio em andamento; venda fechada → Fechado; perdido → Perdido.
 * Vale pras conversas do contato ligado ao projeto (ou ao cliente dele).
 * `soAvancar`: não volta etapa (ex.: visita já agendada não volta pra negócio).
 */
export async function moverEtapaPeloProjeto(projetoId: string, etapa: Etapa, opcoes: { soAvancar?: boolean } = {}): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data: p } = await admin.from('projetos').select('cliente_id').eq('id', projetoId).maybeSingle()
    let q = admin.from('wa_contatos').select('id')
    q = p?.cliente_id ? q.or(`projeto_id.eq.${projetoId},cliente_id.eq.${p.cliente_id}`) : q.eq('projeto_id', projetoId)
    const { data: contatos } = await q
    const ids = ((contatos || []) as Array<{ id: string }>).map((c) => c.id)
    if (!ids.length) return 0
    const { data: convs, error } = await admin.from('wa_conversas').select('id, etapa').in('contato_id', ids).is('encerrada_em', null)
    if (error) return 0   // migration 145 ainda não rodou
    const alvo = ((convs || []) as Array<{ id: string; etapa: string }>)
      .filter((c) => c.etapa !== etapa && (!opcoes.soAvancar || ordemEtapa(c.etapa) < ordemEtapa(etapa)))
      .map((c) => c.id)
    if (!alvo.length) return 0
    await admin.from('wa_conversas').update({ etapa, etapa_em: new Date().toISOString() }).in('id', alvo)
    return alvo.length
  } catch (e) {
    console.error('[spinzap/etapas]', e)
    return 0
  }
}
