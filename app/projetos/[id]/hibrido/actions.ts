'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SaidaDimensionamentoHibrido } from '@/lib/hibrido/dimensionamento'
import { gerarItensListaCaHibrida } from '@/lib/hibrido/lista-ca-hibrida'

// ═══════════════════════════════════════════════════════════════
// Salva o levantamento por listagem + resposta do Mestre da Elétrica
// ═══════════════════════════════════════════════════════════════
export async function salvarLevantamentoListagemAction(input: {
  projetoId: string
  itemId: string | null
  itens: Array<{
    nome: string
    potenciaW: number
    tipoCarga: string
    quantidade: number
    horasUsoDia?: number
    ehCargaCritica: boolean
  }>
  resumoLevantamento: {
    potenciaInstaladaW: number
    potenciaCargaCriticaW: number
    percIndutiva: number
    percResistiva: number
    percCapacitiva: number
    consumoEstimadoMensalKwh: number
  }
  respostaMestre?: {
    potenciaEfetivaSugeridaKw: number
    cargaCriticaSugeridaKw: number
    autonomiaSugeridaHoras: number
    composicao: { indutiva: number; resistiva: number; capacitiva: number }
    fatorSimultaneidade: number
    observacoes: string[]
    alertaPicoPartida?: string
    resumoTexto: string
  }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  // Se já existe análise pro item, atualiza; senão insere
  const filtroExistente = input.itemId
    ? supabase.from('projeto_hibrido_analise').select('id').eq('item_id', input.itemId).maybeSingle()
    : supabase.from('projeto_hibrido_analise').select('id').eq('projeto_id', input.projetoId).is('item_id', null).maybeSingle()

  const { data: existente } = await filtroExistente

  const payload = {
    projeto_id: input.projetoId,
    item_id: input.itemId,
    metodo_demanda: 'levantamento_listagem',
    demanda_media_kw: input.respostaMestre?.potenciaEfetivaSugeridaKw ?? null,
    demanda_pico_kw: input.resumoLevantamento.potenciaInstaladaW / 1000,
    demanda_carga_critica_kw: input.respostaMestre?.cargaCriticaSugeridaKw
      ?? input.resumoLevantamento.potenciaCargaCriticaW / 1000,
    autonomia_desejada_horas: input.respostaMestre?.autonomiaSugeridaHoras ?? 4,
    cargas_criticas: input.itens,
    resumo_analise_ia: input.respostaMestre?.resumoTexto ?? null,
    pontos_criticos_ia: input.respostaMestre?.observacoes.map((obs) => ({
      titulo: 'Consideração do Mestre',
      detalhe: obs,
      severidade: 'info',
    })) ?? [],
    recomendacao_ia: input.respostaMestre?.alertaPicoPartida ?? null,
    criado_por: user.id,
    updated_at: new Date().toISOString(),
  }

  const { error } = existente
    ? await supabase.from('projeto_hibrido_analise').update(payload).eq('id', existente.id)
    : await supabase.from('projeto_hibrido_analise').insert(payload)

  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${input.projetoId}`)
  return { sucesso: true }
}

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
