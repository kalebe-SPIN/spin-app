/**
 * Motor de remuneração do CREDENCIAMENTO SPIN — parceiro de vendas.
 *
 * Portado 1:1 da landing page de credenciamento (spin-credenciamento) para
 * manter os números idênticos entre a página pública de captação e a proposta
 * individual que o candidato vê dentro do app.
 *
 * Diferença para a proposta "Consultor Comercial" tradicional:
 *   - comissão com ACELERADOR de volume (faixas marginais 1,0→1,4)
 *   - multiplicador de ORIGEM (prospecção própria 1,35 × lead SPIN 1,0)
 *   - anuidade de carteira MARGINAL por MRR acumulado
 *   - Semana de Fechamento (recuperações) + Sistema de Níveis
 */

export type LinhaCred = 'residencial' | 'comercial' | 'usina'

export const CONFIG = {
  /** Comissão base por linha, sem/com plano de O&M anexado. */
  TAXA: {
    residencial: { sem: 0.05, com: 0.055 },
    comercial: { sem: 0.035, com: 0.04 },
    usina: { sem: 0.025, com: 0.03 },
  } as Record<LinhaCred, { sem: number; com: number }>,

  /** Acelerador de volume — MARGINAL por faixa de faturamento no mês. */
  FAIXAS: [
    { ate: 50000, mult: 1.0 },
    { ate: 100000, mult: 1.1 },
    { ate: 200000, mult: 1.2 },
    { ate: 400000, mult: 1.3 },
    { ate: Infinity, mult: 1.4 },
  ],

  /** Origem do negócio: prospecção própria rende mais que lead entregue. */
  ORIGEM: { prospeccao: 1.35, lead_spin: 1.0 },

  /** Bônus de anexação do plano = múltiplo da mensalidade. */
  BONUS_ANEXACAO: { residencial: 3.0, comercial: 2.0, usina: 1.5 } as Record<LinhaCred, number>,

  /** Mensalidade representativa por linha (para bônus de anexação). */
  MENSALIDADE: { residencial: 79, comercial: 485, usina: 2442 } as Record<LinhaCred, number>,

  /** Anuidade da carteira — MARGINAL por MRR acumulado. */
  ANUIDADE: [
    { ate: 2000, pct: 0.12 },
    { ate: 5000, pct: 0.14 },
    { ate: 10000, pct: 0.16 },
    { ate: Infinity, pct: 0.18 },
  ],

  /** MRR acumulado projetado ao fim de cada ano. */
  MRR_ANO: { 1: 1444, 2: 4500, 3: 9200, 4: 16500, 5: 23500 } as Record<number, number>,

  /** Ticket médio por linha. */
  TICKET: { residencial: 32000, comercial: 190000, usina: 620000 } as Record<LinhaCred, number>,

  /** Verba de apoio = 1% do volume, piso 1.000, teto 5.000. */
  VERBA: { pct: 0.01, piso: 1000, teto: 5000 },

  /** Fixo mensal vinculado à meta de atividade. */
  RETIRADA_MENSAL: 2000,

  // ---- Semana de Fechamento ----
  /** Taxa reduzida (~25% menor): leads de outros consultores, condição facilitada. */
  TAXA_CAMPANHA: { residencial: 0.04, comercial: 0.03, usina: 0.023 } as Record<LinhaCred, number>,
  BONUS_RECUPERACAO: { residencial: 250, comercial: 900, usina: 2500 } as Record<LinhaCred, number>,
  /** Meta da semana — não cumulativo (vale o maior atingido). */
  META_SEMANA: [
    { recuperacoes: 3, bonus: 500 },
    { recuperacoes: 5, bonus: 1200 },
  ],
  /** Recuperação = lead de outro consultor → mesmo multiplicador de prospecção. */
  ORIGEM_RESGATE: 1.35,
} as const

const LINHAS: LinhaCred[] = ['residencial', 'comercial', 'usina']

/** Soma marginal por faixa: Σ (fatia da faixa × campo). */
function marginal(valor: number, faixas: ReadonlyArray<{ ate: number; mult?: number; pct?: number }>, campo: 'mult' | 'pct'): number {
  let acc = 0
  let prev = 0
  for (const f of faixas) {
    const topo = Math.min(valor, f.ate)
    if (topo > prev) {
      acc += (topo - prev) * (f[campo] as number)
      prev = topo
    }
    if (valor <= f.ate) break
  }
  return acc
}

/** Multiplicador acelerador efetivo para um volume. */
export function acelerador(V: number): number {
  return V > 0 ? marginal(V, CONFIG.FAIXAS, 'mult') / V : 1
}

/** Anuidade mensal a partir do MRR acumulado (percentual marginal). */
export function anuidadeMensal(mrr: number): number {
  return marginal(mrr, CONFIG.ANUIDADE, 'pct')
}

export type SimuladorState = {
  volume: number
  res: number // % mix residencial
  com: number // % mix comercial
  usi: number // % mix usina
  prosp: number // % prospecção própria (resto = lead SPIN)
  anex: number // % de anexação de plano
  ano: number // 1..5 (para a carteira)
  recup: number // recuperações na Semana de Fechamento
}

export type SimuladorResult = {
  comissao: number
  bonus: number
  anuidade: number
  retirada: number
  total: number
  verba: number
  recorrente: number
  recupTotal: number
  recupBonus: number
  recup: number
}

/** Núcleo do simulador — idêntico à landing page. */
export function simular(s: SimuladorState): SimuladorResult {
  const { volume, res, com, usi, prosp, anex, ano, recup = 0 } = s
  const origMult = (prosp / 100) * CONFIG.ORIGEM.prospeccao + (1 - prosp / 100) * CONFIG.ORIGEM.lead_spin
  const mix: Record<LinhaCred, number> = { residencial: res / 100, comercial: com / 100, usina: usi / 100 }

  // Volume das recuperações (mix × tickets médios) — soma ao volume p/ faixa
  const recupVolume = recup * LINHAS.reduce((a, k) => a + mix[k] * CONFIG.TICKET[k], 0)
  const accMain = acelerador(volume + recupVolume) // recuperação eleva a faixa da comissão regular
  const accRecup = acelerador(volume) // recuperação usa a faixa do volume regular

  // taxa blended por linha, com anexação
  let taxa = 0
  for (const k of LINHAS) taxa += mix[k] * ((anex / 100) * CONFIG.TAXA[k].com + (1 - anex / 100) * CONFIG.TAXA[k].sem)
  const comissao = volume * taxa * accMain * origMult

  // bônus de anexação
  let bonus = 0
  for (const k of LINHAS) bonus += ((volume * mix[k]) / CONFIG.TICKET[k]) * (anex / 100) * CONFIG.MENSALIDADE[k] * CONFIG.BONUS_ANEXACAO[k]

  const anuidade = anuidadeMensal(CONFIG.MRR_ANO[ano] || 0)
  const retirada = CONFIG.RETIRADA_MENSAL

  // Semana de Fechamento
  let recupComissao = 0
  let recupBonus = 0
  for (const k of LINHAS) {
    const n = recup * mix[k]
    recupComissao += n * CONFIG.TICKET[k] * CONFIG.TAXA_CAMPANHA[k] * accRecup * CONFIG.ORIGEM_RESGATE
    recupBonus += n * CONFIG.BONUS_RECUPERACAO[k]
  }
  let metaBonus = 0 // não cumulativo — usa o maior atingido
  for (const m of CONFIG.META_SEMANA) if (recup >= m.recuperacoes) metaBonus = m.bonus
  const recupTotal = recup > 0 ? recupComissao + recupBonus + metaBonus : 0

  const total = comissao + bonus + anuidade + retirada + recupTotal
  const verba = Math.max(CONFIG.VERBA.piso, Math.min(CONFIG.VERBA.teto, volume * CONFIG.VERBA.pct))

  return {
    comissao,
    bonus,
    anuidade,
    retirada,
    total,
    verba,
    recorrente: anuidade,
    recupTotal,
    recupBonus: recupBonus + metaBonus,
    recup,
  }
}

/**
 * Sistema de Níveis do credenciamento (ADENDO 01 — copy oficial do Kalebe).
 * NÃO alterar critérios/privilégios sem confirmação: são parâmetros comerciais.
 */
export const NIVEIS = [
  {
    nome: 'Credenciado',
    criterio: 'Entrada',
    privilegios: ['Tabela base', 'Zona definida', 'Cota de leads'],
    destaque: false,
  },
  {
    nome: 'Sênior',
    criterio: '12 meses · 3 vezes Fechador do Mês · carteira de R$ 5.000/mês',
    privilegios: ['+3% na tabela', 'Assento no comitê de preço', 'Zona preferencial'],
    destaque: false,
  },
  {
    nome: 'Master',
    criterio: '24 meses · carteira de R$ 15.000/mês · 1 credenciado formado por você',
    privilegios: [
      '+5% na tabela',
      '1% sobre a produção de quem você forma',
      'Voz no roadmap do produto',
      'Participação em negociação com fornecedor',
    ],
    destaque: true,
  },
] as const

/** Prêmios rotativos do Fechador do Mês (quem mais recupera na Semana de Fechamento). */
export const FECHADOR_DO_MES = [
  'Prioridade nº 1 na fila de leads — recebe antes de todo mundo',
  'Verba de marketing 30% maior',
  'Autonomia de desconto até 5% sem pedir aprovação',
  'Escolha de um município na próxima revisão de zona',
  'Abre a reunião mensal contando como fez',
] as const

/** Bônus de recuperação por linha (Semana de Fechamento) — para exibição. */
export const BONUS_RECUPERACAO_LABEL: { linha: string; valor: string }[] = [
  { linha: 'Residencial', valor: 'R$ 250' },
  { linha: 'Comercial', valor: 'R$ 900' },
  { linha: 'Usina', valor: 'R$ 2.500' },
]

export const META_SEMANA_LABEL: { meta: string; bonus: string }[] = [
  { meta: '3 recuperações na semana', bonus: '+ R$ 500' },
  { meta: '5 recuperações na semana', bonus: '+ R$ 1.200' },
]
