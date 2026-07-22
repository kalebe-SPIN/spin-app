/**
 * Calculadora do servico "Limpeza fotovoltaica".
 *
 * Kalebe: cobrar por qtd placas + KM + pavimentos + tipo telhado + ponto de agua.
 *
 * Formula:
 *   MO       = qtd × R$/mod × fator_telhado × fator_pavimento × fator_programacao
 *   Desloca  = km × 2 × dias × valor_km
 *   Diarias  = qtd_inst × dias × diaria
 *   Insumos  = qtd × (detergente + epi/qtd) + [SE sem agua] pipa × dias + [SE sem energia] gerador × dias
 *   Total    = MO + Desloca + Diarias + Insumos
 *   Se total < visita_minima, cobra visita_minima
 */

import type { TipoTelhado, Pavimento, Programacao } from './servico-retirada-recolocacao'

export type ParametrosLimpeza = {
  mao_obra_limpeza_por_modulo: number
  fator_telhado: Record<TipoTelhado, number>
  fator_pavimento: Record<Pavimento, number>
  fator_programacao: Record<Programacao, number>
  valor_km_rodado: number
  diaria_instalador: number
  litros_agua_por_modulo: number
  valor_caminhao_pipa_diaria: number
  usa_caminhao_pipa_se_placas_mais_que: number
  valor_detergente_por_modulo: number
  valor_epi_e_ferramentas_por_dia: number
  valor_gerador_diaria: number
  valor_minimo_visita: number
}

export type EntradasLimpeza = {
  qtd_modulos: number
  tipo_telhado: TipoTelhado
  altura_telhado_m: number | null
  pavimento: Pavimento
  km_deslocamento: number
  programacao: Programacao
  qtd_instaladores: number
  dias_estimados: number
  tem_ponto_agua: boolean       // se false, adiciona custo de caminhao pipa
  tem_ponto_energia: boolean    // se false, adiciona custo gerador (pra bomba)
  observacoes?: string
}

export type ResultadoLimpeza = {
  mao_obra: number
  deslocamento: number
  diarias: number
  insumos_detergente: number
  insumos_epi: number
  agua_pipa: number
  gerador: number
  insumos_total: number
  subtotal_calculado: number
  aplicou_visita_minima: boolean
  subtotal: number  // max(subtotal_calculado, visita_minima)
  litros_agua_estimado: number
  memoria_calculo: string[]
}

export function calcularLimpeza(
  entradas: EntradasLimpeza,
  params: ParametrosLimpeza,
): ResultadoLimpeza {
  const memoria: string[] = []

  const fT = params.fator_telhado[entradas.tipo_telhado] ?? 1.0
  const fP = params.fator_pavimento[entradas.pavimento] ?? 1.0
  const fPr = params.fator_programacao[entradas.programacao] ?? 1.0

  // 1. Mao de obra
  const mao_obra = round2(entradas.qtd_modulos * params.mao_obra_limpeza_por_modulo * fT * fP * fPr)
  memoria.push(
    `MO = ${entradas.qtd_modulos} × R$ ${params.mao_obra_limpeza_por_modulo} × ${fT} (${entradas.tipo_telhado}) × ${fP} (${entradas.pavimento}) × ${fPr} (${entradas.programacao}) = R$ ${mao_obra.toFixed(2)}`,
  )

  // 2. Deslocamento
  const deslocamento = round2(entradas.km_deslocamento * 2 * entradas.dias_estimados * params.valor_km_rodado)
  memoria.push(
    `Deslocamento = ${entradas.km_deslocamento} km × 2 × ${entradas.dias_estimados} dias × R$ ${params.valor_km_rodado}/km = R$ ${deslocamento.toFixed(2)}`,
  )

  // 3. Diarias
  const diarias = round2(entradas.qtd_instaladores * entradas.dias_estimados * params.diaria_instalador)
  memoria.push(
    `Diarias = ${entradas.qtd_instaladores} × ${entradas.dias_estimados} × R$ ${params.diaria_instalador} = R$ ${diarias.toFixed(2)}`,
  )

  // 4. Insumos
  const insumos_detergente = round2(entradas.qtd_modulos * params.valor_detergente_por_modulo)
  const insumos_epi = round2(entradas.dias_estimados * params.valor_epi_e_ferramentas_por_dia)
  memoria.push(
    `Detergente = ${entradas.qtd_modulos} × R$ ${params.valor_detergente_por_modulo} = R$ ${insumos_detergente.toFixed(2)}`,
    `EPI/ferramentas = ${entradas.dias_estimados} dias × R$ ${params.valor_epi_e_ferramentas_por_dia} = R$ ${insumos_epi.toFixed(2)}`,
  )

  // 5. Agua (pipa se sem ponto)
  const litros_agua_estimado = entradas.qtd_modulos * params.litros_agua_por_modulo
  let agua_pipa = 0
  if (!entradas.tem_ponto_agua) {
    agua_pipa = round2(params.valor_caminhao_pipa_diaria * entradas.dias_estimados)
    memoria.push(
      `Agua: SEM ponto de agua no local → caminhao pipa = ${entradas.dias_estimados} dias × R$ ${params.valor_caminhao_pipa_diaria} = R$ ${agua_pipa.toFixed(2)}`,
      `(estimativa consumo: ${litros_agua_estimado.toFixed(0)} litros pra ${entradas.qtd_modulos} modulos)`,
    )
  } else {
    memoria.push(`Agua: ponto no local disponivel — R$ 0 (usa agua do cliente, ~${litros_agua_estimado.toFixed(0)}L)`)
  }

  // 6. Gerador (se sem energia)
  let gerador = 0
  if (!entradas.tem_ponto_energia) {
    gerador = round2(params.valor_gerador_diaria * entradas.dias_estimados)
    memoria.push(
      `Energia: SEM ponto → gerador portatil = ${entradas.dias_estimados} × R$ ${params.valor_gerador_diaria} = R$ ${gerador.toFixed(2)}`,
    )
  } else {
    memoria.push(`Energia: ponto no local — R$ 0 (bomba usa energia do cliente)`)
  }

  const insumos_total = round2(insumos_detergente + insumos_epi + agua_pipa + gerador)

  // 7. Subtotal + visita minima
  const subtotal_calculado = round2(mao_obra + deslocamento + diarias + insumos_total)
  const aplicou_visita_minima = subtotal_calculado < params.valor_minimo_visita
  const subtotal = aplicou_visita_minima ? params.valor_minimo_visita : subtotal_calculado

  if (aplicou_visita_minima) {
    memoria.push(
      `\nSubtotal calculado = R$ ${subtotal_calculado.toFixed(2)}`,
      `⚠️ Abaixo da visita minima (R$ ${params.valor_minimo_visita.toFixed(2)}) — cobrando visita minima`,
      `SUBTOTAL FINAL = R$ ${subtotal.toFixed(2)}`,
    )
  } else {
    memoria.push(`\nSUBTOTAL = MO + Desloca + Diarias + Insumos = R$ ${subtotal.toFixed(2)}`)
  }

  return {
    mao_obra,
    deslocamento,
    diarias,
    insumos_detergente,
    insumos_epi,
    agua_pipa,
    gerador,
    insumos_total,
    subtotal_calculado,
    aplicou_visita_minima,
    subtotal,
    litros_agua_estimado,
    memoria_calculo: memoria,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
