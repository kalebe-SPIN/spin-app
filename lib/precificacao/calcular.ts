/**
 * Cálculo de precificação da proposta Spin.
 *
 * Baseado na skill /mestre-em-precificacao:
 *   - Kit WEG × fator 0.4182 = preço venda WEG (não paga imposto Simples)
 *   - Lista CA + serviços + margem (20%) + comissão (5%) + impostos (6%) + frete
 *   - PV final = tudo que vai pra proposta ao cliente
 */

export type ParametrosVigentes = Record<string, {
  valor_numero: number | null
  valor_json: any
  unidade: string | null
}>

export type ItemLista = {
  descricao: string
  qtd: number
  preco_unitario?: number
  categoria?: string
}

export type Entradas = {
  // Kit
  placa: { qtd: number; preco_venda_unitario: number; modelo: string; potencia_wp: number }
  inversor: { qtd: number; preco_venda_unitario: number; modelo: string; potencia_kw: number }
  // Lista CA
  itens_ca: ItemLista[]
  // Contexto
  potencia_kwp: number
  distancia_km_extra?: number
}

export type PropostaCalculada = {
  // Componentes
  subtotal_kit_weg_bruto: number     // placas + inversor tabela WEG
  kit_weg_com_fator: number           // × 0.4182 (preço final WEG cliente)
  subtotal_lista_ca: number
  frete: number
  projeto_art: number
  instalacao: number
  base_impostavel: number             // tudo menos kit WEG
  comissao_vendedor: number
  margem: number
  impostos_simples: number

  // Totais
  pv_total: number                    // preço de venda final
  desconto_max_negociacao: number     // qual desconto pode dar sem perder margem mínima

  // Detalhamento pro PDF
  memoria_calculo: {
    fator_kit_weg_aplicado: number
    margem_pct: number
    comissao_pct: number
    impostos_pct: number
    numero_placas: number
    potencia_cc_kwp: number
  }

  // Pagamento
  formas_pagamento: {
    a_vista_pix: { valor: number; desconto_pct: number }
    parcelado_cartao: { parcelas: number; valor_parcela: number; valor_total: number }
    financiado_estimado: { parcelas: number; valor_parcela_min: number; valor_parcela_max: number }
  }
}

const FATOR_KIT_WEG = 0.4182

/**
 * Busca valor numérico de um parâmetro vigente pela chave.
 */
export function getNum(params: ParametrosVigentes, chave: string, fallback = 0): number {
  return Number(params[chave]?.valor_numero) || fallback
}

/**
 * Calcula preço final da proposta.
 */
export function calcularProposta(entradas: Entradas, params: ParametrosVigentes): PropostaCalculada {
  const { placa, inversor, itens_ca, potencia_kwp, distancia_km_extra = 0 } = entradas
  const numeroPlacas = placa.qtd

  // 1. KIT WEG (não paga imposto Simples porque é revenda WEG)
  const subtotalKitBruto = (placa.preco_venda_unitario * placa.qtd) + (inversor.preco_venda_unitario * inversor.qtd)
  const kitWegComFator = subtotalKitBruto * FATOR_KIT_WEG

  // 2. LISTA CA (subtotal dos materiais complementares)
  const subtotalListaCa = itens_ca.reduce((sum, it) => sum + (it.preco_unitario || 0) * it.qtd, 0)

  // 3. FRETE (por qtd de placas + km extra)
  const freteBase = numeroPlacas <= 16
    ? getNum(params, 'frete_ate_16_placas', 300)
    : getNum(params, 'frete_acima_16_placas', 600)
  const freteKmExtra = distancia_km_extra > 0
    ? distancia_km_extra * getNum(params, 'frete_km_extra_fora_raio', 2.8)
    : 0
  const frete = freteBase + freteKmExtra

  // 4. PROJETO + ART
  let projetoArt = 0
  if (potencia_kwp <= 30) {
    projetoArt = getNum(params, 'projeto_valor_fixo_ate_30kwp', 400)
  } else {
    const base = getNum(params, 'projeto_valor_fixo_ate_30kwp', 400)
    const extra = (potencia_kwp - 30) * getNum(params, 'projeto_rs_por_kwp_acima_30kwp', 30)
    projetoArt = base + extra
  }

  // 5. INSTALAÇÃO (por faixa de placas)
  const tabelaInstalacao = params['tabela_instalacao_rs_placa']?.valor_json || []
  let rsPorPlaca = 80
  for (const faixa of tabelaInstalacao) {
    if (numeroPlacas >= faixa.placas_min && numeroPlacas <= faixa.placas_max) {
      rsPorPlaca = faixa.rs_por_placa
      break
    }
  }
  const instalacao = numeroPlacas * rsPorPlaca

  // 6. BASE IMPOSTAVEL (tudo menos kit WEG)
  const baseImpostavel = subtotalListaCa + frete + projetoArt + instalacao

  // 7. MARGEM (sobre PV — método invertido: PV = custo / (1 - margem%))
  const margemPct = getNum(params, 'margem_contribuicao_perc', 20)
  const comissaoPct = getNum(params, 'comissao_vendedor_perc', 5)
  const impostosPct = getNum(params, 'aliquota_simples_perc', 6)

  // Custo total antes de acréscimos
  const custoTotal = kitWegComFator + baseImpostavel

  // PV = custo / (1 - (margem + comissao + impostos)/100)
  const percentualsAcrescimos = (margemPct + comissaoPct + impostosPct) / 100
  const pvTotal = custoTotal / (1 - percentualsAcrescimos)

  const margem = pvTotal * (margemPct / 100)
  const comissaoVendedor = pvTotal * (comissaoPct / 100)
  const impostosSimples = baseImpostavel > 0
    ? (pvTotal - kitWegComFator) * (impostosPct / 100)
    : 0

  // Margem mínima aceita — pra calcular desconto máximo
  const margemMinima = getNum(params, 'margem_minima_negociacao_perc', 15)
  const pvMinimo = custoTotal / (1 - (margemMinima + comissaoPct + impostosPct) / 100)
  const descontoMaxNegociacao = pvTotal - pvMinimo

  // Pagamento
  const aVistaPix = pvTotal * 0.97 // 3% desconto à vista PIX
  const parcelasCartao = 12
  const valorParcelaCartao = pvTotal * 1.0899 / parcelasCartao // ~8.99% de juros total 12x
  const parcelasFinanciado = 60
  const parcelaFinMin = pvTotal * 1.35 / parcelasFinanciado
  const parcelaFinMax = pvTotal * 1.85 / parcelasFinanciado

  return {
    subtotal_kit_weg_bruto: subtotalKitBruto,
    kit_weg_com_fator: kitWegComFator,
    subtotal_lista_ca: subtotalListaCa,
    frete,
    projeto_art: projetoArt,
    instalacao,
    base_impostavel: baseImpostavel,
    comissao_vendedor: comissaoVendedor,
    margem,
    impostos_simples: impostosSimples,
    pv_total: pvTotal,
    desconto_max_negociacao: descontoMaxNegociacao,
    memoria_calculo: {
      fator_kit_weg_aplicado: FATOR_KIT_WEG,
      margem_pct: margemPct,
      comissao_pct: comissaoPct,
      impostos_pct: impostosPct,
      numero_placas: numeroPlacas,
      potencia_cc_kwp: potencia_kwp,
    },
    formas_pagamento: {
      a_vista_pix: { valor: aVistaPix, desconto_pct: 3 },
      parcelado_cartao: {
        parcelas: parcelasCartao,
        valor_parcela: valorParcelaCartao,
        valor_total: valorParcelaCartao * parcelasCartao,
      },
      financiado_estimado: {
        parcelas: parcelasFinanciado,
        valor_parcela_min: parcelaFinMin,
        valor_parcela_max: parcelaFinMax,
      },
    },
  }
}

/**
 * Converte lista de rows do banco em Record<chave, valor>.
 */
export function paramsToRecord(rows: any[]): ParametrosVigentes {
  const rec: ParametrosVigentes = {}
  for (const r of rows) {
    rec[r.chave] = {
      valor_numero: r.valor_numero,
      valor_json: r.valor_json,
      unidade: r.unidade,
    }
  }
  return rec
}
