'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SaidaDimensionamentoHibrido } from '@/lib/hibrido/dimensionamento'
import { gerarItensListaCaHibrida } from '@/lib/hibrido/lista-ca-hibrida'

export async function salvarDimensionamentoHibridoAction(
  projetoId: string,
  itemId: string | null,
  saida: SaidaDimensionamentoHibrido,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { error } = await supabase.from('projeto_hibrido_dimensionamento').insert({
    projeto_id: projetoId,
    item_id: itemId,
    inversor_modelo: saida.inversor.modelo,
    inversor_potencia_kw: saida.inversor.potencia_kw,
    inversor_qtd: saida.qtdInversores,
    usa_paralelismo: saida.usaParalelismo,
    bateria_modelo: saida.bateria.modelo,
    bateria_capacidade_kwh: saida.bateria.capacidade_kwh,
    bateria_qtd: saida.qtdBaterias,
    capacidade_total_kwh: saida.capacidadeBateriaTotalKwh,
    autonomia_calculada_horas: saida.autonomiaRealHoras,
    qtd_multimedidor: saida.qtdMultimedidor,
    qtd_caixa_juncao_jbw: saida.qtdCaixasJuncao,
    usa_controlador_paralelismo: saida.usaControladorParalelismo,
    observacoes: saida.resumo,
  })

  if (error) return { erro: error.message }

  // Gera lista CA adicional (cabos comunicação, HEPR EPS, disjuntor extra, etc)
  // e salva na coluna dedicada projetos.lista_ca_hibrida_confirmada
  const itensListaCaHibrida = gerarItensListaCaHibrida(saida)
  const { error: erroLista } = await supabase
    .from('projetos')
    .update({ lista_ca_hibrida_confirmada: itensListaCaHibrida })
    .eq('id', projetoId)

  if (erroLista) {
    console.error('[salvarDimensionamentoHibrido] lista CA:', erroLista)
    // não bloqueia — dimensionamento já foi salvo
  }

  // Atualiza status do item se veio itemId
  if (itemId) {
    await supabase
      .from('projeto_itens')
      .update({ status: 'concluido' })
      .eq('id', itemId)
  }

  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true, qtdItensListaCa: itensListaCaHibrida.length }
}
