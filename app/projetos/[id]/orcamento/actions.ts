'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { mudarEtapaProjetoAction } from '@/app/projetos/[id]/etapa/actions'

/**
 * Define o valor_estimado de um projeto_item manualmente. Usado quando
 * o consultor já cotou fora do sistema e só quer registrar o total pra
 * fechar a proposta consolidada — não precisa passar pelo fluxo de
 * cálculo automático (kit → lista CA → orçamento com margens).
 */
export async function definirValorItemManualAction(
  itemId: string,
  valor: number,
  projetoId: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (!isFinite(valor) || valor <= 0) return { erro: 'Valor inválido' }

  const { error } = await supabase
    .from('projeto_itens')
    .update({ valor_estimado: valor })
    .eq('id', itemId)
    .eq('projeto_id', projetoId)

  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

/**
 * Remove um projeto_item da proposta consolidada. Não apaga o kit/orçamento
 * relacionado — só marca como 'removido' pra sair da conta e da tela.
 */
export async function excluirProjetoItemAction(
  itemId: string,
  projetoId: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { error } = await supabase
    .from('projeto_itens')
    .update({ status: 'removido' })
    .eq('id', itemId)
    .eq('projeto_id', projetoId)

  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

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
  if ('erro' in res && res.erro) return { sucesso: false, erro: res.erro }

  // Kalebe 2026-08-29: ao aceitar, exclui automaticamente as outras
  // propostas em andamento do mesmo cliente. Preserva as que já estão
  // em pós-venda pra não apagar histórico contratual.
  let excluidas = 0
  try {
    const { excluirOutrasPropostasDoClienteAction } = await import('@/app/projetos/actions')
    const r = await excluirOutrasPropostasDoClienteAction(projetoId)
    if ('excluidas' in r && typeof r.excluidas === 'number') excluidas = r.excluidas
  } catch (e: any) {
    console.error('[marcarPropostaAceitaAction] falha auto-exclusão:', e?.message)
  }
  return { sucesso: true, outras_excluidas: excluidas }
}

/**
 * Kalebe 2026-09-02: aplica desconto do admin no fechamento da proposta.
 * Aceita percentual (0-100) OU valor absoluto (R$). Se pct preenchido,
 * tem prioridade. Zero em ambos limpa o desconto.
 * Requer role admin.
 */
export async function aplicarDescontoAdminAction(
  projetoId: string,
  entrada: { pct?: number | null; valor?: number | null; motivo?: string | null },
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Só admin pode aplicar desconto' }

  const pct = entrada.pct != null && !Number.isNaN(entrada.pct) ? Number(entrada.pct) : null
  const valor = entrada.valor != null && !Number.isNaN(entrada.valor) ? Number(entrada.valor) : null
  if (pct != null && (pct < 0 || pct > 100)) {
    return { erro: 'Percentual deve ficar entre 0 e 100' }
  }
  if (valor != null && valor < 0) return { erro: 'Valor não pode ser negativo' }

  const zerando = (pct === null || pct === 0) && (valor === null || valor === 0)

  const { error } = await supabase
    .from('projetos')
    .update({
      desconto_admin_pct: zerando ? null : pct,
      desconto_admin_valor: zerando ? null : valor,
      desconto_admin_motivo: zerando ? null : (entrada.motivo || null),
      desconto_admin_por: zerando ? null : user.id,
      desconto_admin_em: zerando ? null : new Date().toISOString(),
    })
    .eq('id', projetoId)
  if (error) return { erro: error.message }

  revalidatePath(`/projetos/${projetoId}/orcamento`)
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
