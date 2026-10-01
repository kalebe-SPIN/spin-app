import type { createClient } from '@/lib/supabase/server'

/**
 * Versões de proposta emitidas (projeto_propostas_historico). Kalebe
 * 2026-10-01: cada versão pode ser editada, atualizada com os valores atuais
 * ou excluída (mig 132). A numeração é estável — conta TODAS as emissões,
 * inclusive as excluídas — pra "v3" continuar sendo a v3 que o cliente recebeu.
 */

export type VersaoProposta = {
  id: string
  numero: number
  url_pdf: string
  arquivo_expirado_em: string | null
  pv_total: number | null
  desconto_pct: number | null
  desconto_valor: number | null
  desconto_motivo: string | null
  potencia_cc_kwp: number | null
  gerado_em: string
  autor: string | null
  atualizado_em: string | null
  excluida_em: string | null
}

const BASE = 'id, url_pdf, arquivo_expirado_em, pv_total, desconto_pct, desconto_valor, desconto_motivo, potencia_cc_kwp, gerado_em, gerado_por_profile:gerado_por(nome_completo)'

export async function carregarHistoricoPropostas(
  supabase: ReturnType<typeof createClient>,
  projetoId: string,
): Promise<{ versoes: VersaoProposta[]; migracaoPendente: boolean }> {
  let migracaoPendente = false
  let { data, error } = await supabase
    .from('projeto_propostas_historico')
    .select(`${BASE}, atualizado_em, excluida_em`)
    .eq('projeto_id', projetoId)
    .order('gerado_em', { ascending: true })
  if (error) {
    // Sem a migration 132 as colunas novas não existem — lista do jeito antigo
    migracaoPendente = true
    ;({ data } = await supabase
      .from('projeto_propostas_historico')
      .select(BASE)
      .eq('projeto_id', projetoId)
      .order('gerado_em', { ascending: true }) as any)
  }

  const versoes = ((data || []) as any[]).map((h, idx) => ({
    id: h.id,
    numero: idx + 1,
    url_pdf: h.url_pdf,
    arquivo_expirado_em: h.arquivo_expirado_em || null,
    pv_total: h.pv_total != null ? Number(h.pv_total) : null,
    desconto_pct: h.desconto_pct != null ? Number(h.desconto_pct) : null,
    desconto_valor: h.desconto_valor != null ? Number(h.desconto_valor) : null,
    desconto_motivo: h.desconto_motivo || null,
    potencia_cc_kwp: h.potencia_cc_kwp != null ? Number(h.potencia_cc_kwp) : null,
    gerado_em: h.gerado_em,
    autor: h.gerado_por_profile?.nome_completo || null,
    atualizado_em: h.atualizado_em || null,
    excluida_em: h.excluida_em || null,
  }))
  // Mais recente primeiro na tela
  return { versoes: versoes.reverse(), migracaoPendente }
}
