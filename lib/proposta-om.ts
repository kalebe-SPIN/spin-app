/**
 * FONTE ÚNICA dos números da proposta de trabalho (Representante Comercial O&M).
 *
 * Tela (PropostaConteudo), PDF (BaixarPropostaPdf) e Contrato
 * (contrato-representacao) leem TUDO daqui. Mudou o valor? Muda só aqui.
 *
 * ⚠️ São parâmetros comerciais da Spin — só alterar com o Kalebe confirmando.
 * Gerente: a comissão de gerência (override sobre a equipe) ainda será definida.
 */

// Base fixa
export const FIXO_MENSAL = 2000
export const MESES_GARANTIA = 3

// Garantido de início — escadinha crescente nos 3 primeiros meses.
// Premia comprometimento/entrega e sinaliza valorização. É piso pelo
// trabalho de base; depois dos 3 meses o FIXO_MENSAL segue sendo pago.
export const GARANTIA_ESCALONADA: { mes: number; valor: number }[] = [
  { mes: 1, valor: 3000 },
  { mes: 2, valor: 3500 },
  { mes: 3, valor: 4000 },
]

// Multiplicador de prospecção (cliente que o rep caçou)
export const MULTIPLICADOR_PROSPECCAO = 1.3

/** "1,3×" */
export const MULTIPLICADOR_LABEL = `${MULTIPLICADOR_PROSPECCAO.toFixed(1).replace('.', ',')}×`

// Comissão escalonada do representante (marginal por faixa, sobre faturamento recebido)
export const COMISSAO_FAIXAS: { faixa: string; pct: string }[] = [
  { faixa: 'até R$ 15.000', pct: '—' },
  { faixa: 'R$ 15.001 a 30.000', pct: '10%' },
  { faixa: 'R$ 30.001 a 50.000', pct: '14%' },
  { faixa: 'R$ 50.001 a 75.000', pct: '18%' },
  { faixa: 'acima de R$ 75.000', pct: '20%' },
]

// Projeção de ganhos (teto ~R$ 12k total no regime)
export const PROJECAO: { fase: string; faturamento: string; remuneracao: string }[] = [
  { fase: 'Meses 1 a 3', faturamento: 'em construção', remuneracao: 'R$ 3.000 a 4.000 garantidos' },
  { fase: 'Meses 4 a 6', faturamento: 'R$ 35–45 mil', remuneracao: 'R$ 4.500 a 6.000' },
  { fase: 'Regime (mês 7+)', faturamento: 'R$ 60–80 mil', remuneracao: 'R$ 8.000 a 12.000' },
]

/** Frase da faixa de regime, usada em texto corrido. */
export const REGIME_FAIXA_LABEL = 'R$ 8.000 a 12.000'

// Metas de atividade mensais.
// Cadastro só conta telhado com no mínimo MODULOS_MIN módulos.
export const MODULOS_MIN = 50
export const METAS = { telhados: 176, conversas: 66, propostas: 40 }

// Extras / bônus (inalterados nesta rodada)
export const EXTRAS: { item: string; valor: string }[] = [
  { item: 'Contrato recorrente assinado', valor: 'R$ 150 residencial · R$ 500 comercial · R$ 1.200 usina' },
  { item: 'Prêmio de upsell (termografia, laudo, reaperto)', valor: '15% a 30% do valor' },
  { item: 'Carteira própria ativa', valor: 'R$ 500 (10) · R$ 1.500 (25) · R$ 4.000 (50) · R$ 10.000 (100)' },
  { item: 'Indicação para o time de solar', valor: '0,5% do projeto fechado' },
]
