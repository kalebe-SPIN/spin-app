import type { createAdminClient } from '@/lib/supabase/admin'
import type { EntradaPropostaRapida } from '@/app/inbox/proposta-actions'
import type { OrcamentoLead } from './orcamento-lead'

/**
 * O que foi montado no "Montar proposta" do FV (Kalebe 2026-10-16): fica no
 * item principal do projeto (projeto_itens.dados.entrada_spinzap) pra reabrir
 * a proposta enviada, editar e fechar a venda com os mesmos números.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Tipos de item do fotovoltaico */
export const TIPOS_ITEM_FV = ['fv_ongrid', 'fv_hibrido', 'fv_zero_grid', 'fv_offgrid']

export type EntradaFvSalva = {
  entrada: EntradaPropostaRapida
  /** Rótulos dos itens extras (a tela mostra o nome) */
  extras: Array<{ produto_id: string; rotulo: string; qtd: number }>
  pv_total: number
  salvo_em: string
}

async function itemFv(admin: Admin, projetoId: string) {
  const { data } = await admin.from('projeto_itens').select('id, dados')
    .eq('projeto_id', projetoId).in('tipo', TIPOS_ITEM_FV).neq('status', 'removido').order('ordem').limit(1).maybeSingle()
  return data as { id: string; dados: Record<string, any> | null } | null
}

export async function salvarEntradaFv(admin: Admin, projetoId: string, e: EntradaPropostaRapida, o: OrcamentoLead) {
  const item = await itemFv(admin, projetoId)
  if (!item) return
  const salva: EntradaFvSalva = {
    entrada: e,
    extras: o.extras.map((x) => ({ produto_id: x.produto_id, rotulo: x.descricao, qtd: x.qtd })),
    pv_total: o.pv_total,
    salvo_em: new Date().toISOString(),
  }
  await admin.from('projeto_itens').update({
    dados: { ...(item.dados || {}), entrada_spinzap: salva },
    // Valor do sistema (sem as seções, que viram itens próprios)
    valor_estimado: Math.round((o.pv_sistema ?? o.pv_total) * 100) / 100,
    updated_at: new Date().toISOString(),
  }).eq('id', item.id)
}

/** Entrada salva do FV (null = proposta de antes de guardar a entrada) */
export async function entradaFvDoProjeto(admin: Admin, projetoId: string | null): Promise<EntradaFvSalva | null> {
  if (!projetoId) return null
  return ((await itemFv(admin, projetoId))?.dados?.entrada_spinzap as EntradaFvSalva) || null
}
