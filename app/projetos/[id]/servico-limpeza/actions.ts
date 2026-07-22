'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { EntradasLimpeza, ResultadoLimpeza } from '@/lib/precificacao/servico-limpeza'

export async function salvarServicoLimpezaAction(
  projetoId: string,
  entradas: EntradasLimpeza,
  resultado: ResultadoLimpeza,
  valorFinal: number,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { data: itemExistente } = await supabase
    .from('projeto_itens')
    .select('id')
    .eq('projeto_id', projetoId)
    .eq('tipo', 'srv_limpeza')
    .neq('status', 'removido')
    .maybeSingle()

  const payload = {
    projeto_id: projetoId,
    tipo: 'srv_limpeza' as const,
    titulo: 'Limpeza fotovoltaica',
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
