/**
 * Motor de precificação v2 — Prompt 12 (Kalebe 2026-09-06).
 *
 * Correções estruturais em relação ao motor legado:
 *   1) Margem alvo sobre a NOTA SPIN (não sobre o PV) — protege da deflação
 *      do kit WEG (pass-through).
 *   2) Alíquota efetiva CALCULADA por projeto (varia com a fatia da nota Spin).
 *   3) Comissão efetiva REAL do representante (taxa × acelerador × origem).
 *   4) Piso R$/Wp — impede queda de preço quando o kit deflaciona.
 *   5) Multiplicadores de complexidade sobre nota Spin.
 *
 * Fórmula fechada (elimina circularidade do tributo):
 *   PV = (custo_total + aliq × kit_fornecedor + acrescimos_fixos)
 *        ÷ (1 − margem_alvo_pv − comissao_efetiva − aliq)
 *
 * Derivação: tributo incide sobre (PV − kit), logo
 *   PV = custo + m·PV + c·PV + aliq·(PV − kit)
 * Isolando: PV(1 − m − c − aliq) = custo + aliq·(-kit) → ver forma acima.
 */

import { CONFIG as CRED } from '@/lib/proposta-credenciamento'

export type Linha = 'residencial' | 'comercial' | 'usina' | 'carregador' | 'om'

export type MargemAlvoRow = {
  linha: Linha
  potencia_min_kwp: number
  potencia_max_kwp: number
  margem_alvo_nota_spin: number
  piso_reais_por_wp: number
}

export type AliquotaSimplesRow = {
  anexo: 'III' | 'V'
  faixa: number
  rbt12_min: number
  rbt12_max: number
  aliquota_nominal: number
  parcela_deduzir: number
}

export type MultiplicadorRow = {
  codigo: string
  nome: string
  tipo: 'percentual' | 'valor_fixo' | 'por_km' | 'orcar_parte'
  valor: number
}

export type OrigemLead =
  | 'base_repassada' | 'lead_spin' | 'aquecimento_1' | 'lead_verba'
  | 'aquecimento_2' | 'indicacao' | 'prospeccao' | 'resgate'

/** Multiplicadores de origem (do prompt 12). */
export const ORIGEM_MULT: Record<OrigemLead, number> = {
  base_repassada: 0.85,
  lead_spin: 1.00,
  aquecimento_1: 1.15,
  lead_verba: 1.15,
  aquecimento_2: 1.25,
  indicacao: 1.25,
  prospeccao: 1.35,
  resgate: 1.35,
}

/** Taxa base por linha, com e sem plano O&M anexado (reusa proposta de credenciamento). */
export const TAXA_BASE_POR_LINHA: Record<Linha, { sem: number; com: number }> = {
  residencial: { sem: 0.050, com: 0.055 },
  comercial:   { sem: 0.035, com: 0.040 },
  usina:       { sem: 0.025, com: 0.030 },
  carregador:  { sem: 0.080, com: 0.080 },
  om:          { sem: 0.100, com: 0.100 },
}

/**
 * Acelerador marginal por faixa de faturamento no mês.
 * Retorna o MULTIPLICADOR EFETIVO médio (não a faixa marginal).
 */
export function calcularAcelerador(volumeMensalRS: number): number {
  if (volumeMensalRS <= 0) return 1
  let acc = 0
  let prev = 0
  for (const f of CRED.FAIXAS) {
    const topo = Math.min(volumeMensalRS, f.ate)
    if (topo > prev) {
      acc += (topo - prev) * f.mult
      prev = topo
    }
    if (volumeMensalRS <= f.ate) break
  }
  return acc / volumeMensalRS
}

/**
 * Alíquota nominal do Simples Nacional pra um RBT12 e anexo.
 *   aliquota_nominal = ((RBT12 × aliq_faixa) − parcela_deduzir) ÷ RBT12
 */
export function calcularAliquotaSimples(
  rbt12: number,
  anexo: 'III' | 'V',
  faixas: AliquotaSimplesRow[],
): { aliquota_nominal: number; faixa: number; aliq_faixa_tabela: number; parcela_deduzir: number } {
  const relevantes = faixas.filter(f => f.anexo === anexo).sort((a, b) => a.faixa - b.faixa)
  const f = relevantes.find(x => rbt12 >= x.rbt12_min && rbt12 <= x.rbt12_max) || relevantes[0]
  if (!f || rbt12 <= 0) return { aliquota_nominal: 0, faixa: 0, aliq_faixa_tabela: 0, parcela_deduzir: 0 }
  const nominal = Math.max(0, (rbt12 * f.aliquota_nominal - f.parcela_deduzir) / rbt12)
  return {
    aliquota_nominal: nominal,
    faixa: f.faixa,
    aliq_faixa_tabela: f.aliquota_nominal,
    parcela_deduzir: f.parcela_deduzir,
  }
}

/** Escolhe a linha do projeto pela potência CC. */
export function inferirLinha(potenciaKwp: number): Linha {
  if (potenciaKwp <= 20) return 'residencial'
  if (potenciaKwp <= 200) return 'comercial'
  return 'usina'
}

/** Puxa a margem alvo aplicável pra linha + potência. */
export function acharMargemAlvo(
  linha: Linha,
  potenciaKwp: number,
  margens: MargemAlvoRow[],
): MargemAlvoRow | undefined {
  return margens.find(m =>
    m.linha === linha && potenciaKwp >= m.potencia_min_kwp && potenciaKwp < m.potencia_max_kwp
  ) || margens.find(m => m.linha === linha) // fallback qualquer da linha
}

export type EntradasV2 = {
  linha: Linha
  potencia_wp: number  // total do sistema, pra piso R$/Wp
  potencia_kwp: number
  origem_lead: OrigemLead
  volume_mensal_consultor: number
  /** Se true, cliente vai levar plano O&M junto — usa taxa "com" */
  plano_om_anexado: boolean
  kit_fornecedor: number       // pass-through (WEG direto ao cliente)
  lista_ca: number
  frete: number
  projeto_art: number
  instalacao: number
  extras: number
  /** Códigos dos multiplicadores marcados (checkboxes na UI) + distancia_km */
  multiplicadores_ativos: string[]
  distancia_km_extra?: number
  /** Config da empresa */
  rbt12: number
  anexo: 'III' | 'V'
  comissao_modo: 'variavel_real' | 'referencia_fixa_7'
  /** Tabelas versionadas do banco */
  margens_alvo: MargemAlvoRow[]
  aliquotas_simples: AliquotaSimplesRow[]
  multiplicadores: MultiplicadorRow[]
}

export type ResultadoV2 = {
  pv_total: number
  nota_spin: number
  margem_spin: number
  fatia_spin: number
  reais_por_wp: number
  piso_aplicado: boolean
  desconto_max: number
  // decomposição de comissão
  comissao_taxa_base: number
  comissao_acelerador: number
  comissao_origem: number
  comissao_efetiva: number
  comissao_valor: number
  // decomposição de imposto
  aliquota_nominal: number
  aliquota_efetiva: number
  imposto_valor: number
  // custos
  custo_total: number
  multiplicadores_valor: number
  // margens efetivas
  margem_sobre_pv: number
  margem_sobre_nota_spin: number
  // alertas/notas
  alertas: string[]
  memoria: {
    linha: Linha
    margem_alvo_nota_spin: number
    piso_reais_por_wp: number
    origem_mult: number
    multiplicadores_aplicados: Array<{ codigo: string; valor: number }>
    iteracoes_fixed_point: number
  }
}

/** Calcula os acréscimos dos multiplicadores selecionados. */
function calcularMultiplicadores(
  ativos: string[],
  multiplicadores: MultiplicadorRow[],
  distanciaKmExtra: number,
): { pctSobreNotaSpin: number; valorFixo: number; aplicados: Array<{ codigo: string; valor: number }> } {
  let pct = 0
  let valorFixo = 0
  const aplicados: Array<{ codigo: string; valor: number }> = []
  for (const codigo of ativos) {
    const m = multiplicadores.find(x => x.codigo === codigo)
    if (!m) continue
    if (m.tipo === 'percentual') {
      pct += m.valor
      aplicados.push({ codigo: m.codigo, valor: m.valor })
    } else if (m.tipo === 'valor_fixo') {
      valorFixo += m.valor
      aplicados.push({ codigo: m.codigo, valor: m.valor })
    } else if (m.tipo === 'por_km' && distanciaKmExtra > 0) {
      const v = distanciaKmExtra * m.valor
      valorFixo += v
      aplicados.push({ codigo: m.codigo, valor: v })
    }
    // 'orcar_parte' não entra na conta — sinaliza pra vendedor cobrar à parte
  }
  return { pctSobreNotaSpin: pct, valorFixo, aplicados }
}

/**
 * Motor v2. Chamado por /orcamento quando `precificacao_v2 = 1`.
 * Resolve o PV por iteração de ponto fixo (fatia_spin depende de PV).
 */
export function calcularPropostaV2(entrada: EntradasV2): ResultadoV2 {
  const alertas: string[] = []

  // 1) Margem alvo pela faixa
  const margemRow = acharMargemAlvo(entrada.linha, entrada.potencia_kwp, entrada.margens_alvo)
  if (!margemRow) {
    alertas.push(`Sem margem alvo cadastrada pra linha ${entrada.linha}. Usando 40% default.`)
  }
  const margem_alvo_nota_spin = margemRow?.margem_alvo_nota_spin ?? 0.40
  const piso_reais_por_wp = margemRow?.piso_reais_por_wp ?? 0

  // 2) Multiplicadores
  const mult = calcularMultiplicadores(
    entrada.multiplicadores_ativos, entrada.multiplicadores, entrada.distancia_km_extra || 0
  )

  // 3) Alíquota nominal
  const aliq = calcularAliquotaSimples(entrada.rbt12, entrada.anexo, entrada.aliquotas_simples)
  const aliquota_nominal = aliq.aliquota_nominal

  // 4) Comissão efetiva
  let comissao_efetiva: number
  let comissao_taxa_base = 0
  let comissao_acelerador = 1
  let comissao_origem = 1
  if (entrada.comissao_modo === 'referencia_fixa_7') {
    comissao_efetiva = 0.07
  } else {
    const taxaLinha = TAXA_BASE_POR_LINHA[entrada.linha]
    comissao_taxa_base = entrada.plano_om_anexado ? taxaLinha.com : taxaLinha.sem
    comissao_acelerador = calcularAcelerador(entrada.volume_mensal_consultor)
    comissao_origem = ORIGEM_MULT[entrada.origem_lead] ?? 1
    comissao_efetiva = comissao_taxa_base * comissao_acelerador * comissao_origem
  }

  // 5) Custo total (sem multiplicadores de valor fixo — esses somam ao acrescimo)
  const custo_direto_spin = entrada.lista_ca + entrada.frete + entrada.projeto_art + entrada.instalacao + entrada.extras
  const custo_total = custo_direto_spin + entrada.kit_fornecedor

  // 6) Iteração de ponto fixo pra achar PV com margem sobre nota SPIN.
  //    fatia_spin depende do PV; PV depende da margem_alvo_pv que depende de fatia_spin.
  //    Inicializa com estimativa (custo - kit) / custo. Converge em 3-4 passos.
  let fatia_spin = custo_total > 0 ? (custo_total - entrada.kit_fornecedor) / custo_total : 0.5
  let pv = 0
  let iteracoes = 0
  const acrescimos_fixos = mult.valorFixo
  for (let i = 0; i < 20; i++) {
    // margem alvo convertida pra base PV
    const margem_alvo_pv = margem_alvo_nota_spin * fatia_spin
    // aplica também os % dos multiplicadores sobre nota SPIN
    const pct_mult_sobre_pv = mult.pctSobreNotaSpin * fatia_spin
    const divisor = 1 - margem_alvo_pv - comissao_efetiva - aliquota_nominal - pct_mult_sobre_pv
    if (divisor <= 0.01) {
      alertas.push('Divisor negativo/zero — margem + comissão + imposto + multiplicadores excedem 100%. Revisar parâmetros.')
      pv = custo_total * 2
      break
    }
    const numerador = custo_total + aliquota_nominal * entrada.kit_fornecedor + acrescimos_fixos
    const pv_novo = numerador / divisor
    const delta = Math.abs(pv_novo - pv)
    pv = pv_novo
    iteracoes = i + 1
    if (delta < 0.01) break
    fatia_spin = pv > 0 ? (pv - entrada.kit_fornecedor) / pv : fatia_spin
  }

  // 7) Piso R$/Wp
  const reais_por_wp_calc = entrada.potencia_wp > 0 ? pv / entrada.potencia_wp : 0
  let piso_aplicado = false
  if (piso_reais_por_wp > 0 && reais_por_wp_calc < piso_reais_por_wp) {
    pv = piso_reais_por_wp * entrada.potencia_wp
    piso_aplicado = true
    fatia_spin = pv > 0 ? (pv - entrada.kit_fornecedor) / pv : fatia_spin
    alertas.push(`Piso R$/Wp aplicado (${piso_reais_por_wp.toFixed(2)}/Wp).`)
  }

  // 8) Componentes finais
  const nota_spin = pv - entrada.kit_fornecedor
  const aliquota_efetiva = pv > 0 ? aliquota_nominal * (nota_spin / pv) : 0
  const imposto_valor = nota_spin * aliquota_nominal
  const comissao_valor = pv * comissao_efetiva
  const margem_spin = nota_spin - custo_direto_spin - imposto_valor - comissao_valor - mult.valorFixo
  const margem_sobre_pv = pv > 0 ? margem_spin / pv : 0
  const margem_sobre_nota_spin = nota_spin > 0 ? margem_spin / nota_spin : 0

  // 9) Desconto máximo (margem mínima = alvo − 8 p.p., ou piso R$/Wp)
  const margem_min_nota = Math.max(0, margem_alvo_nota_spin - 0.08)
  const margem_min_pv_estim = margem_min_nota * fatia_spin
  const divisor_min = 1 - margem_min_pv_estim - comissao_efetiva - aliquota_nominal
  const pv_min_por_margem = divisor_min > 0.01
    ? (custo_total + aliquota_nominal * entrada.kit_fornecedor + acrescimos_fixos) / divisor_min
    : pv
  const pv_min_por_piso = piso_reais_por_wp > 0 ? piso_reais_por_wp * entrada.potencia_wp : 0
  const pv_minimo = Math.max(pv_min_por_margem, pv_min_por_piso)
  const desconto_max = Math.max(0, pv - pv_minimo)

  // 10) Alertas de coerência
  if (fatia_spin < 0.25 || fatia_spin > 0.60) {
    alertas.push(`Fatia SPIN (${(fatia_spin * 100).toFixed(1)}%) fora da faixa 25-60% — kit mal cadastrado ou anomalia. Confira antes de emitir.`)
  }

  return {
    pv_total: pv,
    nota_spin,
    margem_spin,
    fatia_spin,
    reais_por_wp: entrada.potencia_wp > 0 ? pv / entrada.potencia_wp : 0,
    piso_aplicado,
    desconto_max,
    comissao_taxa_base,
    comissao_acelerador,
    comissao_origem,
    comissao_efetiva,
    comissao_valor,
    aliquota_nominal,
    aliquota_efetiva,
    imposto_valor,
    custo_total,
    multiplicadores_valor: mult.valorFixo,
    margem_sobre_pv,
    margem_sobre_nota_spin,
    alertas,
    memoria: {
      linha: entrada.linha,
      margem_alvo_nota_spin,
      piso_reais_por_wp,
      origem_mult: comissao_origem,
      multiplicadores_aplicados: mult.aplicados,
      iteracoes_fixed_point: iteracoes,
    },
  }
}
