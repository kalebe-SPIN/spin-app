/**
 * Valores da proposta unificada CONSULTOR COMERCIAL — Linha Completa.
 * Vende sistemas FV + carregadores e anexa plano de O&M (carteira recorrente).
 * Números conforme definidos pelo Kalebe na proposta.
 */
export type LinhaKey = 'residencial' | 'comercial' | 'industrial' | 'carregador'

export const LINHAS: Record<LinhaKey, {
  label: string
  ticket: string
  pctSem: number      // comissão sem plano
  pctCom: number      // comissão com plano anexado
  bonusMult: number   // bônus de anexação = múltiplo da mensalidade
}> = {
  residencial: { label: 'Sistema residencial', ticket: 'R$ 25–45 mil',      pctSem: 0.050, pctCom: 0.055, bonusMult: 3 },
  comercial:   { label: 'Sistema comercial',   ticket: 'R$ 120–350 mil',    pctSem: 0.035, pctCom: 0.040, bonusMult: 2 },
  industrial:  { label: 'Industrial / usina',  ticket: 'R$ 400 mil – 1,5 mi', pctSem: 0.025, pctCom: 0.030, bonusMult: 1.5 },
  carregador:  { label: 'Carregador (VE)',     ticket: 'R$ 10–25 mil',      pctSem: 0.080, pctCom: 0.080, bonusMult: 0 },
}

/** Anuidade de carteira: 12% sobre tudo que o cliente paga no plano. */
export const CARTEIRA_PCT = 0.12

/** Preços de referência do plano de O&M (mensalidade). */
export const PLANOS_OM = {
  residencial: [
    { faixa: 'até 12 módulos', essencial: 45, completo: 79 },
    { faixa: '13 a 25 módulos', essencial: 59, completo: 105 },
  ],
  comercial: [
    { faixa: '150 módulos', mensalidade: 485 },
    { faixa: '400 módulos', mensalidade: 1102 },
    { faixa: '1.000 módulos', mensalidade: 2442 },
  ],
}

/** Cálculo do que o consultor recebe numa venda, com e sem plano anexado. */
export function calcularVenda(linha: LinhaKey, valorSistema: number, mensalidadePlano: number) {
  const L = LINHAS[linha]
  const v = Math.max(0, valorSistema || 0)
  const m = Math.max(0, mensalidadePlano || 0)

  const comissaoSem = v * L.pctSem
  const comissaoCom = v * L.pctCom
  const bonus = m * L.bonusMult
  const carteiraMes = m * CARTEIRA_PCT

  return {
    comissaoSem,
    comissaoCom,
    bonus,
    recebeVendaSem: comissaoSem,
    recebeVendaCom: comissaoCom + bonus,
    carteiraMes,
  }
}
