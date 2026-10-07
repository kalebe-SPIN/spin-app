import { createAdminClient } from '@/lib/supabase/admin'
import { traduzirErroAnthropic } from '@/lib/bianca/erros'

/**
 * Erros da IA (Anthropic) fora do chat da Bianca (Kalebe 2026-10-07: "Your
 * credit balance is too low" aparecia cru na tela da fatura, e a Laís
 * parava de responder clientes sem ninguém saber). Tradução: lib/bianca/erros.
 */

/** Texto pt-BR pra tela (mensagem + o que fazer). */
export function mensagemErroIA(e: any): string {
  const t = traduzirErroAnthropic(e)
  return [t.mensagem, t.acao].filter(Boolean).join(' ')
}

/** true = erro reconhecido da IA (crédito, chave, limite, instabilidade). */
export const erroConhecidoIA = (e: any) => traduzirErroAnthropic(e).codigo !== 'desconhecido'

/**
 * Sem crédito ou chave recusada: tudo que usa IA para (Laís, Bianca,
 * leituras). Avisa os admins (sino + WhatsApp), no máximo 1× a cada 6 h.
 */
export async function avisarFalhaIA(e: any, onde: string): Promise<void> {
  const t = traduzirErroAnthropic(e)
  const chaveRecusada = t.codigo === 'chave_invalida' && (Number(e?.status) === 401 || /authentication_error/i.test(t.tecnico || ''))
  if (t.codigo !== 'sem_creditos' && !chaveRecusada) return
  try {
    const admin = createAdminClient()
    const titulo = t.codigo === 'sem_creditos' ? 'IA sem crédito' : 'Chave da IA recusada'
    const desde = new Date(Date.now() - 6 * 3600_000).toISOString()
    const { count } = await admin.from('avisos_internos').select('id', { count: 'exact', head: true })
      .eq('titulo', titulo).gte('criado_em', desde)
    if (count) return
    const mensagem = t.codigo === 'sem_creditos'
      ? `Os créditos da IA (Anthropic) acabaram — a Laís, a Bianca, a leitura de fatura e de comprovantes estão paradas. Recarregue em console.anthropic.com → Plans & Billing (dá pra ligar a recarga automática). Falhou em: ${onde}.`
      : `A chave da IA (Anthropic) foi recusada — a Laís, a Bianca e as leituras automáticas estão paradas. Atualize a chave em /admin/whatsapp/config. Falhou em: ${onde}.`
    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin').eq('ativo', true)
    const { avisarUsuario } = await import('@/lib/agentes/diretorio')
    for (const a of (admins || []) as Array<{ id: string }>) {
      await avisarUsuario({ destinatario_id: a.id, agente: 'bianca', titulo, urgente: true, mensagem }).catch(() => {})
    }
  } catch (err) {
    console.error('[ia/erros] aviso', err)
  }
}
