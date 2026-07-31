/**
 * Adaptador Orçamento Rápido — Solar (on-grid, híbrido, zero-grid, off-grid).
 * MVP: modos consumo_kwh e qtd_placas.
 * Fase 2: fatura (OCR), valor_mensal.
 */

import {
  type AdaptadorOrcamento,
  type ModoEntrada,
  type ParametrosOrcamento,
  type ResultadoOrcamento,
  type TipoRede,
  TIPOS_REDE_INFO,
  fatorSolPorCidade,
  fmtBRL,
} from './tipos'

/**
 * Entrada Solar sempre carrega tipo_rede + cidade opcional.
 * Cidade obrigatória quando modo != 'fatura' (regra Kalebe 2026-07-31 —
 * fatura já traz cidade implícita; nos outros modos, sem cidade não dá
 * pra estimar irradiação correta).
 */
type BaseSolar = { tipo_rede: TipoRede; cidade?: string }
export type EntradaSolar =
  | (BaseSolar & { modo: 'consumo_kwh'; consumo_kwh: number })
  | (BaseSolar & { modo: 'qtd_placas'; qtd_placas: number })
  | (BaseSolar & { modo: 'valor_mensal'; valor_mensal: number })
  | (BaseSolar & { modo: 'fatura'; fatura_url?: string; consumo_extraido?: number })

/**
 * Calcula kWp necessário a partir do consumo mensal em kWh.
 * Fórmula: kWp = consumo_mensal / (horas_sol_dia × 30 dias × 0.85 fator perda)
 * horas_sol_dia agora vem da CIDADE quando informada (FATOR_SOL_POR_CIDADE),
 * senão cai no fallback params.fator_dimensionamento_sc.
 */
function kwpDeConsumo(consumo_kwh_mes: number, params: ParametrosOrcamento, cidade?: string): number {
  const horas_sol = fatorSolPorCidade(cidade, params.fator_dimensionamento_sc)
  const geracao_kwh_por_kwp_mes = horas_sol * 30 * 0.85
  return consumo_kwh_mes / geracao_kwh_por_kwp_mes
}

/**
 * Calcula kWp a partir de qtd de placas.
 */
function kwpDeQtdPlacas(qtd: number, params: ParametrosOrcamento): number {
  return (qtd * params.potencia_padrao_modulo_wp) / 1000
}

/**
 * Calcula qtd de placas a partir de kWp (arredonda pra cima).
 */
function qtdPlacasDeKwp(kwp: number, params: ParametrosOrcamento): number {
  return Math.ceil((kwp * 1000) / params.potencia_padrao_modulo_wp)
}

export const adaptadorSolar: AdaptadorOrcamento<EntradaSolar> = {
  tipoItem: ['fv_ongrid', 'fv_hibrido', 'fv_zero_grid', 'fv_offgrid'],
  label: 'Solar fotovoltaico',
  emoji: '☀️',
  modosSuportados: ['consumo_kwh', 'qtd_placas', 'valor_mensal', 'fatura'],

  descricaoModo(modo) {
    switch (modo) {
      case 'consumo_kwh':  return 'Digite o consumo médio mensal em kWh'
      case 'qtd_placas':   return 'Digite quantas placas o cliente quer'
      case 'valor_mensal': return 'Digite o valor médio da conta de luz'
      case 'fatura':       return 'Anexe a fatura de energia (PDF ou imagem)'
      default:             return ''
    }
  },

  placeholderModo(modo) {
    switch (modo) {
      case 'consumo_kwh':  return 'Ex: 400'
      case 'qtd_placas':   return 'Ex: 10'
      case 'valor_mensal': return 'Ex: 500,00'
      case 'fatura':       return ''
      default:             return ''
    }
  },

  unidadeModo(modo) {
    switch (modo) {
      case 'consumo_kwh':  return 'kWh/mês'
      case 'qtd_placas':   return 'placas'
      case 'valor_mensal': return 'R$/mês'
      case 'fatura':       return 'arquivo'
      default:             return ''
    }
  },

  calcular(entrada, params) {
    let kwp = 0
    let qtd_placas = 0
    let baseHint = ''
    const cidade = entrada.cidade

    if (entrada.modo === 'consumo_kwh') {
      kwp = kwpDeConsumo(entrada.consumo_kwh, params, cidade)
      qtd_placas = qtdPlacasDeKwp(kwp, params)
      baseHint = `Baseado em ${entrada.consumo_kwh} kWh/mês${cidade ? ` · cidade: ${cidade}` : ''}`
    } else if (entrada.modo === 'qtd_placas') {
      qtd_placas = entrada.qtd_placas
      kwp = kwpDeQtdPlacas(entrada.qtd_placas, params)
      baseHint = `Baseado em ${entrada.qtd_placas} placas × ${params.potencia_padrao_modulo_wp}Wp`
    } else if (entrada.modo === 'valor_mensal') {
      const consumo = entrada.valor_mensal / params.preco_medio_kwh_celesc
      kwp = kwpDeConsumo(consumo, params, cidade)
      qtd_placas = qtdPlacasDeKwp(kwp, params)
      baseHint = `Baseado em R$ ${fmtBRL(entrada.valor_mensal)}/mês (≈ ${consumo.toFixed(0)} kWh)${cidade ? ` · ${cidade}` : ''}`
    } else if (entrada.modo === 'fatura' && entrada.consumo_extraido) {
      kwp = kwpDeConsumo(entrada.consumo_extraido, params, cidade)
      qtd_placas = qtdPlacasDeKwp(kwp, params)
      baseHint = `Consumo extraído da fatura: ${entrada.consumo_extraido} kWh/mês`
    }

    // Recalcula kWp real a partir da qtd de placas arredondada
    const kwpReal = kwpDeQtdPlacas(qtd_placas, params)
    // ⚠️ Estimativa síncrona ainda usa R$/kWp fixo (params.preco_medio_kwp_instalado).
    // Sempre que possível, o CALLER deve usar montarKitOrcamentoRapido() (Server Action)
    // que busca placa+inversor REAIS do catálogo Supabase e devolve valor mais fiel.
    const valor_estimado = Math.round(kwpReal * params.preco_medio_kwp_instalado)
    const infoRede = TIPOS_REDE_INFO[entrada.tipo_rede]

    return {
      valor_estimado,
      resumo: `Sistema solar ${kwpReal.toFixed(2).replace('.', ',')} kWp · ${qtd_placas} placas · ${infoRede.label}`,
      detalhes: [
        { label: 'Potência estimada', valor: `${kwpReal.toFixed(2).replace('.', ',')} kWp` },
        { label: 'Quantidade de placas', valor: `${qtd_placas} × ${params.potencia_padrao_modulo_wp}Wp (estimativa)` },
        { label: 'Tipo de rede', valor: infoRede.label },
        ...(cidade ? [{ label: 'Cidade', valor: cidade }] : []),
        { label: 'Base do cálculo', valor: baseHint },
      ],
      estimativa_tecnica: {
        kwp: kwpReal,
        qtd_placas,
        potencia_modulo_wp: params.potencia_padrao_modulo_wp,
        tipo_rede: entrada.tipo_rede,
        cidade: cidade || null,
      },
      observacao_padrao: '*Estimativa preliminar sujeita a análise técnica no local. Placas e inversor definitivos vêm do estoque disponível — proposta oficial após visita.*',
    }
  },

  formatarWhatsApp(entrada, resultado, empresa, valorFinal) {
    const tec = resultado.estimativa_tecnica as {
      kwp: number; qtd_placas: number; tipo_rede: TipoRede; cidade: string | null
    }
    const infoRede = TIPOS_REDE_INFO[tec.tipo_rede]
    return `Oi! Sou o ${empresa.consultor} da ${empresa.nome} 👋

Fiz uma estimativa rápida do seu sistema solar:

☀️ *Sistema:* ${tec.kwp.toFixed(2).replace('.', ',')} kWp
🔋 *Kit:* ${tec.qtd_placas} placas + inversor
⚡ *Rede:* ${infoRede.label}
${tec.cidade ? `📍 *Cidade:* ${tec.cidade}\n` : ''}💰 *Investimento estimado:* R$ ${fmtBRL(valorFinal)}

${resultado.observacao_padrao}

Podemos agendar uma visita técnica pra confirmar tudo e preparar a proposta oficial? 🙌`
  },
}
