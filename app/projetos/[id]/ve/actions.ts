'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type VeRecargaSelecionada = {
  wallbox: {
    id: string
    codigo_weg: string
    modelo: string
    potencia_kw: number
    preco_unitario: number
  }
  qtd: number
  acessorios: Array<{
    id: string
    codigo_weg: string
    modelo: string
    qtd: number
    preco_unitario: number
  }>
  preco_wallbox_total: number       // wallbox × qtd
  preco_acessorios_total: number    // soma acessórios
  preco_bruto: number               // wallbox_total + acessórios
  margem_pct: number                // margem SPIN aplicada
  preco_final_cliente: number       // com margem aplicada
}

/**
 * Salva a estação de recarga VE selecionada + atualiza valor_estimado
 * do projeto_item ve_recarga (destrava a proposta consolidada).
 *
 * Kalebe pediu 2026-08-25: acesso ao catálogo WEG (linha WEMOB) +
 * precificação padrão SPIN pra fechar orçamento de estação VE.
 */
export async function salvarVeRecargaAction(
  projetoId: string,
  selecao: VeRecargaSelecionada,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  if (!selecao?.wallbox?.id) return { sucesso: false, erro: 'Wallbox inválido' }
  if (selecao.qtd <= 0) return { sucesso: false, erro: 'Quantidade inválida' }
  if (selecao.preco_final_cliente <= 0) return { sucesso: false, erro: 'Preço inválido' }

  // 1. Grava seleção no projeto
  const { error: errProj } = await supabase
    .from('projetos')
    .update({ ve_recarga_selecionada: selecao })
    .eq('id', projetoId)
  if (errProj) return { sucesso: false, erro: errProj.message }

  // 2. Atualiza projeto_itens do tipo ve_recarga com o total
  await supabase
    .from('projeto_itens')
    .update({ valor_estimado: selecao.preco_final_cliente })
    .eq('projeto_id', projetoId)
    .eq('tipo', 've_recarga')
    .neq('status', 'removido')

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}
