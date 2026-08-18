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

export type Sujidade = 'leve' | 'medio' | 'pesado'

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
  // ── Novos parâmetros da fórmula automática (mig 071) ─────────────────────
  min_por_placa_base?: number         // default 1 min/placa (sujidade leve)
  min_por_km?: number                 // default 1 min/km deslocamento
  min_setup_org_recolh?: number       // default 30 min setup + recolhimento
  horas_dia_trabalho?: number         // default 8h/dia
  fator_sujidade_leve?: number        // default 1.0
  fator_sujidade_medio?: number       // default 1.5
  fator_sujidade_pesado?: number      // default 2.0
  limite_placas_1_tecnico?: number    // default 200 (acima → 2 técnicos)
  pe_direito_max_1_tecnico?: number   // default 6m (acima → 2 técnicos)
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
  // ── Modo automático (opcional; quando sujidade setada, ativa auto-cálculo) ─
  sujidade?: Sujidade                       // nível de sujeira do sistema
  cliente_disponibiliza_ajudante?: boolean  // se true, força 1 técnico mesmo quando seria 2
  pe_direito_m?: number                     // altura do pé direito (se >6m → 2 técnicos)
  cidade_id?: string                        // id em cidades_distancia (fill km automático)
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

// ══════════════════════════════════════════════════════════════════════════
// MODO AUTOMÁTICO (mig 071) — decide qtd técnicos e dias sem input manual
// ══════════════════════════════════════════════════════════════════════════

/**
 * Decide quantos técnicos são necessários pra o serviço.
 *
 * Regras (Kalebe):
 *  • 1 técnico: qtd_placas ≤ limite E pavimento térreo E pé_direito ≤ limite_pe
 *  • 2 técnicos: acima de qualquer um desses limites
 *  • Se cliente_disponibiliza_ajudante = true, força 1 técnico (custo menor).
 */
export function decidirQtdTecnicos(entradas: EntradasLimpeza, p: ParametrosLimpeza): number {
  const limitePlacas = p.limite_placas_1_tecnico ?? 200
  const limitePeDireito = p.pe_direito_max_1_tecnico ?? 6

  const precisa2Tecnicos =
    entradas.qtd_modulos > limitePlacas
    || entradas.pavimento !== 'terreo'
    || (entradas.pe_direito_m != null && entradas.pe_direito_m > limitePeDireito)

  if (!precisa2Tecnicos) return 1
  if (entradas.cliente_disponibiliza_ajudante) return 1
  return 2
}

function fatorSujidade(s: Sujidade | undefined, p: ParametrosLimpeza): number {
  const leve = p.fator_sujidade_leve ?? 1.0
  const medio = p.fator_sujidade_medio ?? 1.5
  const pesado = p.fator_sujidade_pesado ?? 2.0
  if (s === 'pesado') return pesado
  if (s === 'medio') return medio
  return leve
}

/**
 * Calcula o número de dias estimados pra executar o serviço.
 *
 * Fórmula (Kalebe):
 *   tempo_min = (qtd_placas × min_por_placa × fator_sujidade)   ← limpeza
 *             + (km × 2 × min_por_km)                            ← desloc. ida+volta
 *             + min_setup                                        ← organizar + recolher
 *
 *   dias = ceil( tempo_min / (horas_dia × 60 × qtd_tecnicos) )
 *
 * Mínimo 1 dia sempre.
 */
export function calcularDiasEstimados(entradas: EntradasLimpeza, p: ParametrosLimpeza, qtdTecnicos: number): {
  dias: number
  tempo_min: number
  detalhe: string
} {
  const minPlaca = p.min_por_placa_base ?? 1
  const minKm = p.min_por_km ?? 1
  const minSetup = p.min_setup_org_recolh ?? 30
  const horasDia = p.horas_dia_trabalho ?? 8
  const fator = fatorSujidade(entradas.sujidade, p)

  const tempoLimpeza = entradas.qtd_modulos * minPlaca * fator
  const tempoDesloc = entradas.km_deslocamento * 2 * minKm
  const tempoSetup = minSetup
  const tempoTotal = tempoLimpeza + tempoDesloc + tempoSetup

  const dias = Math.max(1, Math.ceil(tempoTotal / (horasDia * 60 * qtdTecnicos)))

  const detalhe =
    `Tempo estimado = ${entradas.qtd_modulos} placas × ${minPlaca} min × ${fator} (sujidade ${entradas.sujidade || 'leve'}) `
    + `+ ${entradas.km_deslocamento} km × 2 × ${minKm} min + ${minSetup} min setup `
    + `= ${tempoTotal.toFixed(0)} min ÷ (${horasDia}h × ${qtdTecnicos} téc) = ${dias} dia${dias > 1 ? 's' : ''}`

  return { dias, tempo_min: tempoTotal, detalhe }
}

/**
 * Wrapper: dado o input do vendedor no modo automático (sujidade + cidade),
 * decide qtd técnicos e dias, injeta no `entradas` e chama `calcularLimpeza`.
 *
 * Se `entradas.sujidade` está undefined, retorna calcularLimpeza tradicional
 * (modo antigo — compat com /projetos/[id]/servico-limpeza legacy).
 */
export function calcularLimpezaAutomatico(
  entradas: EntradasLimpeza,
  params: ParametrosLimpeza,
): ResultadoLimpeza & { qtd_tecnicos_calculado?: number; dias_calculado?: number; detalhe_tempo?: string } {
  if (!entradas.sujidade) {
    return calcularLimpeza(entradas, params)
  }

  const qtdTecnicos = decidirQtdTecnicos(entradas, params)
  const { dias, detalhe } = calcularDiasEstimados(entradas, params, qtdTecnicos)

  const entradasFinais: EntradasLimpeza = {
    ...entradas,
    qtd_instaladores: qtdTecnicos,
    dias_estimados: dias,
  }

  const resultado = calcularLimpeza(entradasFinais, params)
  return {
    ...resultado,
    qtd_tecnicos_calculado: qtdTecnicos,
    dias_calculado: dias,
    detalhe_tempo: detalhe,
  }
}
