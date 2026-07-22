'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { EntradasRetiradaRecolocacao, ResultadoRetiradaRecolocacao } from '@/lib/precificacao/servico-retirada-recolocacao'

export async function salvarServicoRetiradaAction(
  projetoId: string,
  entradas: EntradasRetiradaRecolocacao,
  resultado: ResultadoRetiradaRecolocacao,
  valorFinal: number,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  // Verifica se ja tem esse item no projeto
  const { data: itemExistente } = await supabase
    .from('projeto_itens')
    .select('id')
    .eq('projeto_id', projetoId)
    .eq('tipo', 'srv_retirada_recolocacao')
    .neq('status', 'removido')
    .maybeSingle()

  const payload = {
    projeto_id: projetoId,
    tipo: 'srv_retirada_recolocacao' as const,
    titulo: 'Retirada e recolocação de módulos',
    dados: {
      entradas,
      resultado_calculado: resultado,
      valor_final_com_ajuste: valorFinal,
    },
    valor_estimado: valorFinal,
    status: 'concluido' as const,
  }

  if (itemExistente) {
    const { error } = await supabase
      .from('projeto_itens')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', itemExistente.id)
    if (error) return { erro: error.message }
  } else {
    const { error } = await supabase.from('projeto_itens').insert(payload)
    if (error) return { erro: error.message }
  }

  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
