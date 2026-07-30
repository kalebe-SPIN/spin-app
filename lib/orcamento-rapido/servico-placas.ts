/**
 * Adaptador Orçamento Rápido — Serviços que cobram por qtd de placas.
 * MVP: srv_limpeza (usa faixa marginal simplificada baseada no MÓDULO SERVIÇOS spec).
 * Fase 2: manutenção, retirada+recolocação, instalação de placas com estimativa própria.
 */

import type { TipoItem } from '@/lib/tipos-projeto'
import {
  type AdaptadorOrcamento,
  type ModoEntrada,
  type ParametrosOrcamento,
  type ResultadoOrcamento,
  fmtBRL,
} from './tipos'

export type EntradaServicoPlacas = {
  modo: 'qtd_placas'
  qtd_placas: number
}

/**
 * Preço marginal de limpeza (do 00-CONTEXTO.md do Módulo Serviços).
 * Cada faixa incide SÓ sobre os módulos dentro dela.
 */
const FAIXAS_LIMPEZA = [
  { min: 1,    max: 25,   preco_por_modulo: 28.00 },
  { min: 26,   max: 150,  preco_por_modulo: 17.50 },
  { min: 151,  max: 400,  preco_por_modulo: 15.50 },
  { min: 401,  max: 1000, preco_por_modulo: 13.00 },
  { min: 1001, max: 3000, preco_por_modulo: 10.50 },
  { min: 3001, max: Infinity, preco_por_modulo: 9.00 },
]

const MINIMO_RESIDENCIAL_ROTA = 300
const MINIMO_RESIDENCIAL_AVULSO = 380

function calcularPrecoMarginalLimpeza(qtd: number): number {
  let restante = qtd
  let total = 0
  for (const faixa of FAIXAS_LIMPEZA) {
    if (restante <= 0) break
    const modulosNaFaixa = Math.min(restante, faixa.max - faixa.min + 1)
    total += modulosNaFaixa * faixa.preco_por_modulo
    restante -= modulosNaFaixa
  }
  return total
}

export const adaptadorServicoPlacas: AdaptadorOrcamento<EntradaServicoPlacas> = {
  tipoItem: 'srv_limpeza' as TipoItem, // fase 2: expandir pra manutencao/retirada/instalacao
  label: 'Limpeza fotovoltaica',
  emoji: '🧹',
  modosSuportados: ['qtd_placas'],

  descricaoModo(_modo: ModoEntrada) {
    return 'Digite quantas placas serão limpas'
  },
  placeholderModo(_modo: ModoEntrada) {
    return 'Ex: 32'
  },
  unidadeModo(_modo: ModoEntrada) {
    return 'placas'
  },

  calcular(entrada, _params) {
    const qtd = Math.max(1, entrada.qtd_placas)
    const marginal = calcularPrecoMarginalLimpeza(qtd)
    const valor_estimado = Math.max(marginal, MINIMO_RESIDENCIAL_AVULSO)
    const minimo_aplicado = marginal < MINIMO_RESIDENCIAL_AVULSO

    return {
      valor_estimado,
      resumo: `Limpeza de ${qtd} placas`,
      detalhes: [
        { label: 'Quantidade de placas', valor: `${qtd}` },
        { label: 'Preço marginal calculado', valor: `R$ ${fmtBRL(marginal)}` },
        ...(minimo_aplicado
          ? [{ label: 'Mínimo avulso aplicado', valor: `R$ ${fmtBRL(MINIMO_RESIDENCIAL_AVULSO)}` }]
          : []),
        { label: 'Modalidade', valor: 'Avulso (fora de rota)' },
      ],
      estimativa_tecnica: {
        qtd_placas: qtd,
        valor_marginal: marginal,
        minimo_aplicado,
        preco_em_rota: Math.max(marginal, MINIMO_RESIDENCIAL_ROTA),
      },
      observacao_padrao: '*Se combinar com outro serviço em 15 km na mesma semana, preço em rota é menor (mínimo R$ 300).*',
    }
  },

  formatarWhatsApp(entrada, resultado, empresa, valorFinal) {
    const tec = resultado.estimativa_tecnica as { qtd_placas: number; preco_em_rota: number }
    return `Oi! Sou o ${empresa.consultor} da ${empresa.nome} 👋

Passei o valor da limpeza do seu sistema fotovoltaico:

🧹 *${tec.qtd_placas} placas*
💰 *Investimento:* R$ ${fmtBRL(valorFinal)}

${resultado.observacao_padrao}

Posso agendar? 🌞`
  },
}
