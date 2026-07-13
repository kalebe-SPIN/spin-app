'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Input = {
  origem: 'qtd_placas' | 'geracao_anual' | 'geracao_media'
  qtd_placas?: number
  geracao_anual_kwh?: number
  geracao_media_kwh?: number
  potencia_wp_placa?: number   // padrão 605Wp
  hsp?: number                 // padrão 4.5h/dia (Grande Florianópolis)
  observacao?: string
}

/**
 * Salva dimensionamento sem fatura + avança pra 'fatura_analisada'.
 * Já popula os campos derivados pra dimensionador consumir.
 */
export async function salvarSemFaturaAction(projetoId: string, input: Input) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const potWpPlaca = input.potencia_wp_placa || 605
  const hsp = input.hsp || 4.5

  // Derivar consumo médio mensal alvo (kWh/mês) e potência CC (kWp)
  let qtdPlacas = 0
  let potenciaCcKwp = 0
  let consumoMedioKwh = 0
  let geracaoAnualKwh = 0

  switch (input.origem) {
    case 'qtd_placas':
      if (!input.qtd_placas || input.qtd_placas < 1) return { erro: 'Informe a quantidade de placas' }
      qtdPlacas = input.qtd_placas
      potenciaCcKwp = (qtdPlacas * potWpPlaca) / 1000
      consumoMedioKwh = potenciaCcKwp * hsp * 30 * 0.8 // 80% eficiência efetiva
      geracaoAnualKwh = consumoMedioKwh * 12
      break

    case 'geracao_anual':
      if (!input.geracao_anual_kwh || input.geracao_anual_kwh < 100) return { erro: 'Informe a geração anual em kWh' }
      geracaoAnualKwh = input.geracao_anual_kwh
      consumoMedioKwh = geracaoAnualKwh / 12
      potenciaCcKwp = geracaoAnualKwh / (hsp * 365 * 0.8)
      qtdPlacas = Math.ceil((potenciaCcKwp * 1000) / potWpPlaca)
      break

    case 'geracao_media':
      if (!input.geracao_media_kwh || input.geracao_media_kwh < 30) return { erro: 'Informe a geração média mensal em kWh' }
      consumoMedioKwh = input.geracao_media_kwh
      geracaoAnualKwh = consumoMedioKwh * 12
      potenciaCcKwp = consumoMedioKwh / (hsp * 30 * 0.8)
      qtdPlacas = Math.ceil((potenciaCcKwp * 1000) / potWpPlaca)
      break

    default:
      return { erro: 'Origem inválida' }
  }

  const { error } = await supabase
    .from('projetos')
    .update({
      origem_dimensionamento: input.origem,
      qtd_placas_estimada: qtdPlacas,
      geracao_anual_alvo_kwh: Math.round(geracaoAnualKwh),
      geracao_media_alvo_kwh: Math.round(consumoMedioKwh),
      potencia_wp_placa_estimada: potWpPlaca,
      hsp_estimado: hsp,
      observacao_sem_fatura: input.observacao?.trim() || null,
      // Grava um objeto minimal em analise_fatura pra outros passos entenderem
      analise_fatura: {
        consumo_medio_kwh: Math.round(consumoMedioKwh),
        origem: input.origem,
        estimativa: true,
      },
      status: 'fatura_analisada',
      status_atualizado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projetoId)

  if (error) return { erro: error.message }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}
