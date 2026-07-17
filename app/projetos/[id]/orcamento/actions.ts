'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { mudarEtapaProjetoAction } from '@/app/projetos/[id]/etapa/actions'

/**
 * Salva orçamento gerado. Também dispara transição de status → 'orcamento_gerado'
 * via mudarEtapaProjetoAction (registra histórico + automações).
 */
export async function salvarOrcamentoAction(projetoId: string, proposta: any, urlPdf?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const patch: any = { orcamento_final: proposta }
  if (urlPdf) patch.url_pdf_proposta = urlPdf

  const { error } = await supabase.from('projetos').update(patch).eq('id', projetoId)
  if (error) return { sucesso: false, erro: error.message }

  // Dispara transição de status com auditoria + automações
  await mudarEtapaProjetoAction(projetoId, 'orcamento_gerado', 'Orçamento gerado pelo consultor')

  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

/**
 * Marca proposta como enviada ao cliente → status vira 'proposta_enviada'
 * → automaticamente cai na coluna "Negócio → Negociando" no kanban CRM.
 * Também dispara Bianca criando follow-up em 3 dias.
 */
export async function marcarPropostaEnviadaAction(projetoId: string, observacoes?: string) {
  const res = await mudarEtapaProjetoAction(
    projetoId,
    'proposta_enviada',
    observacoes || 'Proposta enviada ao cliente',
  )
  return 'erro' in res && res.erro
    ? { sucesso: false, erro: res.erro }
    : { sucesso: true }
}

/**
 * Marca proposta como aceita → status vira 'vendido' → cria homologação
 * automática com 6 etapas + notifica admin/eletrotécnico.
 */
export async function marcarPropostaAceitaAction(projetoId: string, observacoes?: string) {
  const res = await mudarEtapaProjetoAction(
    projetoId,
    'vendido',
    observacoes || 'Cliente aceitou a proposta — venda fechada',
  )
  return 'erro' in res && res.erro
    ? { sucesso: false, erro: res.erro }
    : { sucesso: true }
}
