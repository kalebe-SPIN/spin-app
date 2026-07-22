/**
 * Calculadora do servico "Revisao e manutencao de usina FV".
 *
 * Diferente da limpeza: inclui testes eletricos, termografia, relatorio.
 * Precisa ponto de energia pra alimentar ferramentas — se nao tem, gerador.
 *
 * Formula:
 *   MO base       = qtd × R$/mod × fator_telhado × fator_pavimento × fator_programacao
 *   Desloca       = km × 2 × dias × valor_km
 *   Diarias       = qtd_inst × dias × diaria
 *   Testes        = [SE termografia] qtd × R$/mod + [SE string] strings × R$
 *                 + [SE inversor] inversores × R$ + [SE relatorio] R$
 *   Insumos       = dias × EPI/dia + [SE sem energia] gerador × dias
 *   Total         = MO + Desloca + Diarias + Testes + Insumos
 *   Se total < visita_minima, cobra visita_minima
 */

import type { TipoTelhado, Pavimento, Programacao } from './servico-retirada-recolocacao'

export type ParametrosRevisao = {
  mao_obra_revisao_por_modulo: number
  fator_telhado: Record<TipoTelhado, number>
  fator_pavimento: Record<Pavimento, number>
  fator_programacao: Record<Programacao, number>
  valor_km_rodado: number
  diaria_instalador: number
  valor_termografia_por_modulo: number
  valor_teste_string_por_string: number
  valor_teste_inversor_por_inversor: number
  valor_relatorio_tecnico: number
  valor_epi_e_ferramentas_por_dia: number
  valor_gerador_diaria: number
  valor_minimo_visita: number
}

export type EntradasRevisao = {
  qtd_modulos: number
  qtd_strings: number
  qtd_inversores: number
  tipo_telhado: TipoTelhado
  altura_telhado_m: number | null
  pavimento: Pavimento
  km_deslocamento: number
  programacao: Programacao
  qtd_instaladores: number
  dias_estimados: number
  tem_ponto_energia: boolean

  // Testes opcionais
  inclui_termografia: boolean
  inclui_teste_string: boolean
  inclui_teste_inversor: boolean
  inclui_relatorio_tecnico: boolean

  observacoes?: string
}

export type ResultadoRevisao = {
  mao_obra: number
  deslocamento: number
  diarias: number
  testes_termografia: number
  testes_string: number
  testes_inversor: number
  testes_relatorio: number
  testes_total: number
  insumos_epi: number
  gerador: number
  insumos_total: number
  subtotal_calculado: number
  aplicou_visita_minima: boolean
  subtotal: number
  memoria_calculo: string[]
}

export function calcularRevisao(
  entradas: EntradasRevisao,
  params: ParametrosRevisao,
): ResultadoRevisao {
  const memoria: string[] = []

  const fT = params.fator_telhado[entradas.tipo_telhado] ?? 1.0
  const fP = params.fator_pavimento[entradas.pavimento] ?? 1.0
  const fPr = params.fator_programacao[entradas.programacao] ?? 1.0

  // 1. MO base
  const mao_obra = round2(entradas.qtd_modulos * params.mao_obra_revisao_por_modulo * fT * fP * fPr)
  memoria.push(
    `MO base = ${entradas.qtd_modulos} × R$ ${params.mao_obra_revisao_por_modulo} × ${fT} (${entradas.tipo_telhado}) × ${fP} (${entradas.pavimento}) × ${fPr} (${entradas.programacao}) = R$ ${mao_obra.toFixed(2)}`,
  )

  // 2. Deslocamento
  const deslocamento = round2(entradas.km_deslocamento * 2 * entradas.dias_estimados * params.valor_km_rodado)
  memoria.push(
    `Deslocamento = ${entradas.km_deslocamento} × 2 × ${entradas.dias_estimados} × R$ ${params.valor_km_rodado} = R$ ${deslocamento.toFixed(2)}`,
  )

  // 3. Diarias
  const diarias = round2(entradas.qtd_instaladores * entradas.dias_estimados * params.diaria_instalador)
  memoria.push(
    `Diarias = ${entradas.qtd_instaladores} × ${entradas.dias_estimados} × R$ ${params.diaria_instalador} = R$ ${diarias.toFixed(2)}`,
  )

  // 4. Testes opcionais
  const testes_termografia = entradas.inclui_termografia
    ? round2(entradas.qtd_modulos * params.valor_termografia_por_modulo)
    : 0
  const testes_string = entradas.inclui_teste_string
    ? round2(entradas.qtd_strings * params.valor_teste_string_por_string)
    : 0
  const testes_inversor = entradas.inclui_teste_inversor
    ? round2(entradas.qtd_inversores * params.valor_teste_inversor_por_inversor)
    : 0
  const testes_relatorio = entradas.inclui_relatorio_tecnico ? params.valor_relatorio_tecnico : 0

  if (entradas.inclui_termografia) {
    memoria.push(`Termografia = ${entradas.qtd_modulos} × R$ ${params.valor_termografia_por_modulo} = R$ ${testes_termografia.toFixed(2)}`)
  }
  if (entradas.inclui_teste_string) {
    memoria.push(`Teste string = ${entradas.qtd_strings} × R$ ${params.valor_teste_string_por_string} = R$ ${testes_string.toFixed(2)}`)
  }
  if (entradas.inclui_teste_inversor) {
    memoria.push(`Teste inversor = ${entradas.qtd_inversores} × R$ ${params.valor_teste_inversor_por_inversor} = R$ ${testes_inversor.toFixed(2)}`)
  }
  if (entradas.inclui_relatorio_tecnico) {
    memoria.push(`Relatorio tecnico assinado RT = R$ ${testes_relatorio.toFixed(2)}`)
  }

  const testes_total = round2(testes_termografia + testes_string + testes_inversor + testes_relatorio)

  // 5. Insumos + gerador
  const insumos_epi = round2(entradas.dias_estimados * params.valor_epi_e_ferramentas_por_dia)
  let gerador = 0
  if (!entradas.tem_ponto_energia) {
    gerador = round2(params.valor_gerador_diaria * entradas.dias_estimados)
    memoria.push(
      `Energia: SEM ponto → gerador portatil = ${entradas.dias_estimados} × R$ ${params.valor_gerador_diaria} = R$ ${gerador.toFixed(2)}`,
      `(necessario pra multimetros, camera termica, ferramentas)`,
    )
  } else {
    memoria.push(`Energia: ponto no local — R$ 0`)
  }
  memoria.push(
    `EPI/ferramentas = ${entradas.dias_estimados} × R$ ${params.valor_epi_e_ferramentas_por_dia} = R$ ${insumos_epi.toFixed(2)}`,
  )
  const insumos_total = round2(insumos_epi + gerador)

  // 6. Subtotal + visita minima
  const subtotal_calculado = round2(mao_obra + deslocamento + diarias + testes_total + insumos_total)
  const aplicou_visita_minima = subtotal_calculado < params.valor_minimo_visita
  const subtotal = aplicou_visita_minima ? params.valor_minimo_visita : subtotal_calculado

  if (aplicou_visita_minima) {
    memoria.push(
      `\nSubtotal calculado = R$ ${subtotal_calculado.toFixed(2)}`,
      `⚠️ Abaixo da visita minima (R$ ${params.valor_minimo_visita.toFixed(2)}) — cobrando visita minima`,
      `SUBTOTAL FINAL = R$ ${subtotal.toFixed(2)}`,
    )
  } else {
    memoria.push(`\nSUBTOTAL = MO + Desloca + Diarias + Testes + Insumos = R$ ${subtotal.toFixed(2)}`)
  }

  return {
    mao_obra,
    deslocamento,
    diarias,
    testes_termografia,
    testes_string,
    testes_inversor,
    testes_relatorio,
    testes_total,
    insumos_epi,
    gerador,
    insumos_total,
    subtotal_calculado,
    aplicou_visita_minima,
    subtotal,
    memoria_calculo: memoria,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
