/**
 * Calculadora do servico "Retirada e recolocacao de modulos fotovoltaicos".
 *
 * Formula:
 *   MO_retirada    = qtd_modulos × MO_ret × fator_telhado_atual × fator_pavimento
 *   MO_recolocacao = qtd_modulos × MO_rec × fator_telhado_apos × fator_pavimento
 *   MO_total       = (MO_ret + MO_rec) × fator_programacao
 *
 *   Deslocamento   = km × 2 (ida/volta) × dias × valor_km
 *   Diarias        = qtd_instaladores × dias × diaria
 *   Realocacao     = distancia_realocacao_m × valor_por_metro
 *
 *   Materiais      = pares_mc4 × par_mc4
 *                  + metros_mangueira × mangueira_metro
 *                  + [SE telhado diferente] suportes × valor_suporte
 *                  + [SE cabo novo] metros_cabo × valor_cabo
 *
 *   Total = MO_total + Deslocamento + Diarias + Realocacao + Materiais
 */

export type TipoTelhado = 'fibrocimento' | 'ceramico' | 'metalico' | 'zinco' | 'laje' | 'outro'
export type Pavimento = 'terreo' | 'primeiro' | 'segundo' | 'terceiro_ou_mais'
export type Programacao = 'normal' | 'feriado' | 'noite' | 'urgencia'

export type ParametrosRetiradaRecolocacao = {
  mao_obra_retirada_por_modulo: number
  mao_obra_recolocacao_por_modulo: number
  fator_telhado: Record<TipoTelhado, number>
  fator_pavimento: Record<Pavimento, number>
  fator_programacao: Record<Programacao, number>
  valor_km_rodado: number
  diaria_instalador: number
  valor_realocacao_por_metro: number
  par_mc4: number
  mangueira_corrugada_metro: number
  suporte_fixacao_unidade: number
  cabo_solar_6mm_metro: number
  metros_mangueira_por_modulo: number
  suportes_por_modulo: number
  metros_cabo_estimado_por_modulo: number
}

export type EntradasRetiradaRecolocacao = {
  qtd_modulos: number
  qtd_strings: number
  tipo_telhado_atual: TipoTelhado
  tipo_telhado_apos: TipoTelhado
  altura_telhado_m: number | null
  pavimento: Pavimento
  distancia_realocacao_m: number
  km_deslocamento: number
  programacao: Programacao
  qtd_instaladores: number
  dias_estimados: number
  reaproveita_cabeamento: boolean
  observacoes?: string
}

export type ResultadoRetiradaRecolocacao = {
  // Detalhamento
  mao_obra_retirada: number
  mao_obra_recolocacao: number
  mao_obra_total: number             // ja com fator_programacao aplicado
  deslocamento: number
  diarias: number
  realocacao_temporaria: number

  // Materiais individualizados
  materiais_mc4: number
  materiais_mangueira: number
  materiais_suportes: number         // 0 se telhado igual
  materiais_cabo: number             // 0 se reaproveita
  materiais_total: number

  // Subtotal e ajustes
  subtotal: number                   // MO + Deslocamento + Diarias + Realocacao + Materiais

  // Metadados
  telhado_diferente: boolean
  usa_cabeamento_novo: boolean
  memoria_calculo: string[]          // linhas explicando o calculo
}

export function calcularRetiradaRecolocacao(
  entradas: EntradasRetiradaRecolocacao,
  params: ParametrosRetiradaRecolocacao,
): ResultadoRetiradaRecolocacao {
  const memoria: string[] = []
  const telhado_diferente = entradas.tipo_telhado_atual !== entradas.tipo_telhado_apos
  const usa_cabeamento_novo = !entradas.reaproveita_cabeamento

  // Fatores
  const fatorTelhadoAtual = params.fator_telhado[entradas.tipo_telhado_atual] ?? 1.0
  const fatorTelhadoApos = params.fator_telhado[entradas.tipo_telhado_apos] ?? 1.0
  const fatorPavimento = params.fator_pavimento[entradas.pavimento] ?? 1.0
  const fatorProgramacao = params.fator_programacao[entradas.programacao] ?? 1.0

  // 1. Mao de obra
  const mao_obra_retirada = round2(
    entradas.qtd_modulos * params.mao_obra_retirada_por_modulo * fatorTelhadoAtual * fatorPavimento,
  )
  const mao_obra_recolocacao = round2(
    entradas.qtd_modulos * params.mao_obra_recolocacao_por_modulo * fatorTelhadoApos * fatorPavimento,
  )
  const mao_obra_total = round2((mao_obra_retirada + mao_obra_recolocacao) * fatorProgramacao)

  memoria.push(
    `MO retirada = ${entradas.qtd_modulos} × ${params.mao_obra_retirada_por_modulo} × ${fatorTelhadoAtual} (${entradas.tipo_telhado_atual}) × ${fatorPavimento} (${entradas.pavimento}) = R$ ${mao_obra_retirada.toFixed(2)}`,
    `MO recolocacao = ${entradas.qtd_modulos} × ${params.mao_obra_recolocacao_por_modulo} × ${fatorTelhadoApos} (${entradas.tipo_telhado_apos}) × ${fatorPavimento} = R$ ${mao_obra_recolocacao.toFixed(2)}`,
    `MO total (× fator programacao ${fatorProgramacao} = ${entradas.programacao}) = R$ ${mao_obra_total.toFixed(2)}`,
  )

  // 2. Deslocamento (ida + volta × dias)
  const deslocamento = round2(entradas.km_deslocamento * 2 * entradas.dias_estimados * params.valor_km_rodado)
  memoria.push(
    `Deslocamento = ${entradas.km_deslocamento} km × 2 (ida/volta) × ${entradas.dias_estimados} dias × R$ ${params.valor_km_rodado}/km = R$ ${deslocamento.toFixed(2)}`,
  )

  // 3. Diarias dos instaladores
  const diarias = round2(entradas.qtd_instaladores * entradas.dias_estimados * params.diaria_instalador)
  memoria.push(
    `Diarias = ${entradas.qtd_instaladores} instaladores × ${entradas.dias_estimados} dias × R$ ${params.diaria_instalador}/dia = R$ ${diarias.toFixed(2)}`,
  )

  // 4. Realocacao temporaria (distancia interna dos modulos)
  const realocacao_temporaria = round2(entradas.distancia_realocacao_m * params.valor_realocacao_por_metro)
  memoria.push(
    `Realocacao temporaria = ${entradas.distancia_realocacao_m} m × R$ ${params.valor_realocacao_por_metro}/m = R$ ${realocacao_temporaria.toFixed(2)}`,
  )

  // 5. Materiais
  const materiais_mc4 = round2(entradas.qtd_strings * params.par_mc4)
  const metrosMangueira = entradas.qtd_modulos * params.metros_mangueira_por_modulo
  const materiais_mangueira = round2(metrosMangueira * params.mangueira_corrugada_metro)

  const materiais_suportes = telhado_diferente
    ? round2(entradas.qtd_modulos * params.suportes_por_modulo * params.suporte_fixacao_unidade)
    : 0

  const metrosCabo = entradas.qtd_modulos * params.metros_cabo_estimado_por_modulo
  const materiais_cabo = usa_cabeamento_novo
    ? round2(metrosCabo * params.cabo_solar_6mm_metro)
    : 0

  const materiais_total = round2(materiais_mc4 + materiais_mangueira + materiais_suportes + materiais_cabo)

  memoria.push(
    `MC4 = ${entradas.qtd_strings} strings × R$ ${params.par_mc4}/par = R$ ${materiais_mc4.toFixed(2)}`,
    `Mangueira corrugada = ${metrosMangueira} m × R$ ${params.mangueira_corrugada_metro}/m = R$ ${materiais_mangueira.toFixed(2)}`,
  )
  if (telhado_diferente) {
    memoria.push(
      `Suportes NOVOS (telhado ${entradas.tipo_telhado_atual} -> ${entradas.tipo_telhado_apos}) = ${entradas.qtd_modulos} × ${params.suportes_por_modulo} × R$ ${params.suporte_fixacao_unidade} = R$ ${materiais_suportes.toFixed(2)}`,
    )
  } else {
    memoria.push(`Suportes: telhado igual — reaproveita, R$ 0`)
  }
  if (usa_cabeamento_novo) {
    memoria.push(
      `Cabo solar NOVO = ${metrosCabo} m × R$ ${params.cabo_solar_6mm_metro}/m = R$ ${materiais_cabo.toFixed(2)}`,
    )
  } else {
    memoria.push(`Cabeamento: reaproveitado, R$ 0`)
  }
  memoria.push(`Materiais total = R$ ${materiais_total.toFixed(2)}`)

  // Subtotal
  const subtotal = round2(mao_obra_total + deslocamento + diarias + realocacao_temporaria + materiais_total)
  memoria.push(`\nSUBTOTAL = MO + Deslocamento + Diarias + Realocacao + Materiais = R$ ${subtotal.toFixed(2)}`)

  return {
    mao_obra_retirada,
    mao_obra_recolocacao,
    mao_obra_total,
    deslocamento,
    diarias,
    realocacao_temporaria,
    materiais_mc4,
    materiais_mangueira,
    materiais_suportes,
    materiais_cabo,
    materiais_total,
    subtotal,
    telhado_diferente,
    usa_cabeamento_novo,
    memoria_calculo: memoria,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const OPCOES_TELHADO: Array<{ id: TipoTelhado; label: string }> = [
  { id: 'fibrocimento', label: 'Fibrocimento' },
  { id: 'ceramico', label: 'Cerâmico' },
  { id: 'metalico', label: 'Metálico' },
  { id: 'zinco', label: 'Zinco' },
  { id: 'laje', label: 'Laje' },
  { id: 'outro', label: 'Outro' },
]

export const OPCOES_PAVIMENTO: Array<{ id: Pavimento; label: string }> = [
  { id: 'terreo', label: 'Térreo' },
  { id: 'primeiro', label: '1º pavimento' },
  { id: 'segundo', label: '2º pavimento' },
  { id: 'terceiro_ou_mais', label: '3º pavimento ou mais' },
]

export const OPCOES_PROGRAMACAO: Array<{ id: Programacao; label: string; hint?: string }> = [
  { id: 'normal', label: 'Horário normal (dia útil)' },
  { id: 'feriado', label: 'Feriado', hint: '+50%' },
  { id: 'noite', label: 'Período noturno', hint: '+40%' },
  { id: 'urgencia', label: 'Urgência (executar rápido)', hint: '+50%' },
]
