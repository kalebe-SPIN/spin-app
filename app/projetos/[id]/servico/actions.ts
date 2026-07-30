'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getInfoTipo, type TipoItem } from '@/lib/tipos-projeto'

export type SubitemEscopo = { item: string; qtd: number }

export type EntradasServicoGenerico = {
  tipo: TipoItem
  descricao: string
  subitens: SubitemEscopo[]
  observacoes?: string
}

/**
 * Detalhamento interno de custo — visão SPIN (admin/gestor/vendedor).
 * Cliente NUNCA vê essa estrutura.
 * Vendedor/consultor vê só as chaves de custo bruto (mao_de_obra, materiais, deslocamento).
 * Margem/comissão/impostos só admin/gestor vê (regra de precificação dupla-visão).
 */
export type DetalhamentoInterno = {
  mao_de_obra?: number
  materiais?: number
  deslocamento?: number
  margem?: number
  comissao?: number
  impostos?: number
}

export async function salvarServicoGenericoAction(
  projetoId: string,
  entradas: EntradasServicoGenerico,
  valorCliente: number,
  detalhamentoInterno: DetalhamentoInterno = {},
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const info = getInfoTipo(entradas.tipo)
  if (!info) return { erro: `Tipo de item desconhecido: ${entradas.tipo}` }

  if (valorCliente < 0) return { erro: 'Valor não pode ser negativo' }
  if (!entradas.descricao?.trim()) return { erro: 'Descrição do serviço é obrigatória' }

  // Verifica se já existe item desse tipo no projeto (1 item por tipo, conforme padrão dos outros forms)
  const { data: itemExistente } = await supabase
    .from('projeto_itens')
    .select('id')
    .eq('projeto_id', projetoId)
    .eq('tipo', entradas.tipo)
    .neq('status', 'removido')
    .maybeSingle()

  const payload = {
    projeto_id: projetoId,
    tipo: entradas.tipo,
    titulo: info.label,
    dados: {
      // Formato dupla-visão (regra decidida 2026-07-30):
      //   - nome_secao, icone, descricao, quantidades, valor_cliente: visíveis pro cliente
      //   - detalhamento_interno: só admin/gestor vê tudo; vendedor vê parte
      nome_secao: info.label,
      icone: info.emoji,
      descricao: entradas.descricao.trim(),
      quantidades: entradas.subitens.filter(s => s.item.trim()),
      valor_cliente: valorCliente,
      detalhamento_interno: detalhamentoInterno,
      observacoes: entradas.observacoes?.trim() || undefined,
      // Meta pra rastreamento:
      _entradas: entradas,
      _salvo_por: user.id,
    },
    valor_estimado: valorCliente,
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
