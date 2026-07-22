/**
 * Calculadora do servico "Instalacao de modulos fotovoltaicos em projeto".
 *
 * Contexto: cliente ja tem placas + inversor comprados. Spin faz so a
 * mao de obra + materiais consumiveis (MC4, mangueira, suportes, cabo,
 * parafusos) e opcionalmente assina o RT/ART.
 *
 * Formula:
 *   MO         = qtd × R$/mod × fator_telhado × fator_pavimento × fator_programacao
 *   Desloca    = km × 2 × dias × valor_km
 *   Diarias    = qtd_inst × dias × diaria
 *   Materiais  = pares_mc4 × par_mc4 + metros_mangueira × R$/m
 *              + qtd × suportes/mod × R$/suporte + parafusos × R$/parafuso
 *              + [SE precisa cabo novo] metros × R$/m
 *   Extras     = [SE assina RT] valor_art + [SE padrao novo] valor_padrao
 *
 *   Total = MO + Desloca + Diarias + Materiais + Extras
 */

import type { TipoTelhado, Pavimento, Programacao } from './servico-retirada-recolocacao'

export type ParametrosInstalacaoPlacas = {
  mao_obra_instalacao_por_modulo: number
  fator_telhado: Record<TipoTelhado, number>
  fator_pavimento: Record<Pavimento, number>
  fator_programacao: Record<Programacao, number>
  valor_km_rodado: number
  diaria_instalador: number
  par_mc4: number
  mangueira_corrugada_metro: number
  suporte_fixacao_unidade: number
  cabo_solar_6mm_metro: number
  parafuso_fixacao_unidade: number
  valor_art_rt: number
  valor_padrao_novo_upgrade: number
  metros_mangueira_por_modulo: number
  suportes_por_modulo: number
  parafusos_por_modulo: number
  metros_cabo_estimado_por_modulo: number
}

export type EntradasInstalacaoPlacas = {
  qtd_modulos: number
  qtd_strings: number
  tipo_telhado: TipoTelhado
  altura_telhado_m: number | null
  pavimento: Pavimento
  km_deslocamento: number
  programacao: Programacao
  qtd_instaladores: number
  dias_estimados: number
  precisa_cabo_novo: boolean
  spin_assina_rt: boolean
  precisa_padrao_novo: boolean
  observacoes?: string
}

export type ResultadoInstalacaoPlacas = {
  mao_obra: number
  deslocamento: number
  diarias: number
  materiais_mc4: number
  materiais_mangueira: number
  materiais_suportes: number
  materiais_parafusos: number
  materiais_cabo: number
  materiais_total: number
  extras_art: number
  extras_padrao: number
  extras_total: number
  subtotal: number
  memoria_calculo: string[]
}

export function calcularInstalacaoPlacas(
  entradas: EntradasInstalacaoPlacas,
  params: ParametrosInstalacaoPlacas,
): ResultadoInstalacaoPlacas {
  const memoria: string[] = []

  const fatorTelhado = params.fator_telhado[entradas.tipo_telhado] ?? 1.0
  const fatorPavimento = params.fator_pavimento[entradas.pavimento] ?? 1.0
  const fatorProgramacao = params.fator_programacao[entradas.programacao] ?? 1.0

  // 1. Mao de obra
  const mao_obra = round2(
    entradas.qtd_modulos
    * params.mao_obra_instalacao_por_modulo
    * fatorTelhado
    * fatorPavimento
    * fatorProgramacao,
  )
  memoria.push(
    `MO = ${entradas.qtd_modulos} × R$ ${params.mao_obra_instalacao_por_modulo} × ${fatorTelhado} (${entradas.tipo_telhado}) × ${fatorPavimento} (${entradas.pavimento}) × ${fatorProgramacao} (${entradas.programacao}) = R$ ${mao_obra.toFixed(2)}`,
  )

  // 2. Deslocamento
  const deslocamento = round2(entradas.km_deslocamento * 2 * entradas.dias_estimados * params.valor_km_rodado)
  memoria.push(
    `Deslocamento = ${entradas.km_deslocamento} km × 2 × ${entradas.dias_estimados} dias × R$ ${params.valor_km_rodado}/km = R$ ${deslocamento.toFixed(2)}`,
  )

  // 3. Diarias
  const diarias = round2(entradas.qtd_instaladores * entradas.dias_estimados * params.diaria_instalador)
  memoria.push(
    `Diarias = ${entradas.qtd_instaladores} inst × ${entradas.dias_estimados} dias × R$ ${params.diaria_instalador} = R$ ${diarias.toFixed(2)}`,
  )

  // 4. Materiais
  const materiais_mc4 = round2(entradas.qtd_strings * params.par_mc4)
  const metrosMangueira = entradas.qtd_modulos * params.metros_mangueira_por_modulo
  const materiais_mangueira = round2(metrosMangueira * params.mangueira_corrugada_metro)
  const materiais_suportes = round2(entradas.qtd_modulos * params.suportes_por_modulo * params.suporte_fixacao_unidade)
  const materiais_parafusos = round2(entradas.qtd_modulos * params.parafusos_por_modulo * params.parafuso_fixacao_unidade)

  const metrosCabo = entradas.qtd_modulos * params.metros_cabo_estimado_por_modulo
  const materiais_cabo = entradas.precisa_cabo_novo ? round2(metrosCabo * params.cabo_solar_6mm_metro) : 0

  const materiais_total = round2(
    materiais_mc4 + materiais_mangueira + materiais_suportes + materiais_parafusos + materiais_cabo,
  )

  memoria.push(
    `MC4 = ${entradas.qtd_strings} × R$ ${params.par_mc4} = R$ ${materiais_mc4.toFixed(2)}`,
    `Mangueira = ${metrosMangueira} m × R$ ${params.mangueira_corrugada_metro} = R$ ${materiais_mangueira.toFixed(2)}`,
    `Suportes = ${entradas.qtd_modulos} × ${params.suportes_por_modulo} × R$ ${params.suporte_fixacao_unidade} = R$ ${materiais_suportes.toFixed(2)}`,
    `Parafusos = ${entradas.qtd_modulos} × ${params.parafusos_por_modulo} × R$ ${params.parafuso_fixacao_unidade} = R$ ${materiais_parafusos.toFixed(2)}`,
  )
  if (entradas.precisa_cabo_novo) {
    memoria.push(`Cabo NOVO = ${metrosCabo} m × R$ ${params.cabo_solar_6mm_metro} = R$ ${materiais_cabo.toFixed(2)}`)
  } else {
    memoria.push(`Cabo: reaproveita, R$ 0`)
  }
  memoria.push(`Materiais total = R$ ${materiais_total.toFixed(2)}`)

  // 5. Extras (opcionais)
  const extras_art = entradas.spin_assina_rt ? params.valor_art_rt : 0
  const extras_padrao = entradas.precisa_padrao_novo ? params.valor_padrao_novo_upgrade : 0
  const extras_total = round2(extras_art + extras_padrao)

  if (entradas.spin_assina_rt) {
    memoria.push(`Extras: ART/RT Spin assina = R$ ${extras_art.toFixed(2)}`)
  }
  if (entradas.precisa_padrao_novo) {
    memoria.push(`Extras: Padrao de entrada NOVO = R$ ${extras_padrao.toFixed(2)}`)
  }

  const subtotal = round2(mao_obra + deslocamento + diarias + materiais_total + extras_total)
  memoria.push(`\nSUBTOTAL = MO + Desloca + Diarias + Materiais + Extras = R$ ${subtotal.toFixed(2)}`)

  return {
    mao_obra,
    deslocamento,
    diarias,
    materiais_mc4,
    materiais_mangueira,
    materiais_suportes,
    materiais_parafusos,
    materiais_cabo,
    materiais_total,
    extras_art,
    extras_padrao,
    extras_total,
    subtotal,
    memoria_calculo: memoria,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
