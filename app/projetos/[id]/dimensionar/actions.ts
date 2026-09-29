'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { AjustesEnergia } from '@/lib/dimensionamento/meta-energia'

/**
 * Adicional de energia (% ou kWh/mês) e opção escolhida pro kit
 * ("necessidade real" × "com geração excedente") — Kalebe 2026-09-29.
 * Fica em projetos.projeto_tecnico.dimensionamento_energia (jsonb já
 * existente; preserva as outras chaves).
 */
export async function salvarAjustesEnergiaAction(
  projetoId: string,
  ajustes: Partial<AjustesEnergia>,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: projeto } = await supabase
    .from('projetos').select('projeto_tecnico').eq('id', projetoId).maybeSingle()
  if (!projeto) return { erro: 'Projeto não encontrado' }

  const atual = (projeto.projeto_tecnico as any) || {}
  const anterior = atual.dimensionamento_energia || {}
  const novo = {
    ...anterior,
    ...(ajustes.adicional_tipo ? { adicional_tipo: ajustes.adicional_tipo === 'absoluto' ? 'absoluto' : 'percentual' } : {}),
    ...(ajustes.adicional_valor !== undefined ? { adicional_valor: Math.max(0, Number(ajustes.adicional_valor) || 0) } : {}),
    ...(ajustes.opcao ? { opcao: ajustes.opcao === 'excedente' ? 'excedente' : 'real' } : {}),
    atualizado_em: new Date().toISOString(),
    atualizado_por: user.id,
  }

  const { error } = await supabase
    .from('projetos')
    .update({ projeto_tecnico: { ...atual, dimensionamento_energia: novo } })
    .eq('id', projetoId)
  if (error) return { erro: error.message }

  revalidatePath(`/projetos/${projetoId}/dimensionar`)
  revalidatePath(`/projetos/${projetoId}/kit`)
  return { sucesso: true }
}
