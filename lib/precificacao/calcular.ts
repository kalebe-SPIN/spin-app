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
  // Lista CA (materiais elétricos complementares tributáveis — base impostável)
  itens_ca: ItemLista[]
  // Contexto
  potencia_kwp: number
  distancia_km_extra?: number
  /** Kalebe 2026-09-18: tipo do projeto pra resolver margem diferenciada
   *  via fv_matriz_margem_kwp (tipo × faixa kWp). Se não informado ou
   *  matriz vazia pra o par (tipo, faixa), cai no margem_contribuicao_perc
   *  global. Retrocompatível — callers antigos podem omitir. */
  tipo_projeto?: string
  /** Se passado, usa esse valor bruto WEG (placa+inversor+cabo+estrutura+MC4+…)
   *  em vez de recalcular com placa+inversor. Necessário pra que os
   *  complementos CC (cabo solar / estrutura / MC4) levem o fator 0,4182
   *  junto com placa+inversor — todos vêm da planilha WEG.
   *
   *  No modo ampliação o kit exclui o inversor do bruto (cliente já tem),
   *  mas placas+estrutura+cabo+MC4 continuam com o fator 0,4182 — todos
   *  seguem sendo revenda WEG (Kalebe 2026-08-29). */
  subtotal_kit_weg_bruto_override?: number
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

// Kalebe 2026-09-18: fator hardcoded era o único parâmetro comercial fora
// da tabela editável. Agora lê de kit_weg.fator_kit_weg_preco_cliente e cai
// aqui só como safety net se o param não estiver semeado.
const FATOR_KIT_WEG_FALLBACK = 0.4182

// Defaults das formas de pagamento — usados quando params não é passado
// ou quando as chaves não estão semeadas no banco. Ler ParamsPagamento pra
// entender o nome de cada chave.
const PAGTO_DEFAULTS = {
  desconto_a_vista_pix_perc: 3,
  parcelas_cartao_padrao: 12,
  juros_cartao_total_perc: 8.99,      // juros total do parcelamento
  parcelas_financiamento_padrao: 60,
  financiamento_juros_min_perc: 35,   // juros total no mínimo (min → maior parcela)
  financiamento_juros_max_perc: 85,   // juros total no máximo
}

export type FormasPagamento = PropostaCalculada['formas_pagamento']

/**
 * Deriva as formas de pagamento a partir de um valor total.
 *
 * IMPORTANTE: sempre passe o valor FINAL da proposta (já com desconto/acréscimo
 * e extras aplicados), nunca o PV bruto — senão à vista/cartão/financiado
 * apresentam parcelas do preço errado. Ver PropostaPDFTemplate.
 *
 * Kalebe 2026-09-18: `params` opcional. Se passado, lê chaves do banco:
 *   pagamento.desconto_a_vista_pix_perc
 *   pagamento.parcelas_cartao_padrao
 *   pagamento.juros_cartao_total_perc
 *   pagamento.parcelas_financiamento_padrao
 *   pagamento.financiamento_juros_min_perc
 *   pagamento.financiamento_juros_max_perc
 * Se não, usa defaults hardcoded (retrocompat).
 */
export function calcularFormasPagamento(total: number, params?: ParametrosVigentes): FormasPagamento {
  const base = Math.max(0, total || 0)
  const p = params
  const num = (chave: keyof typeof PAGTO_DEFAULTS) =>
    p ? getNum(p, chave, PAGTO_DEFAULTS[chave]) : PAGTO_DEFAULTS[chave]

  const descPixPct = num('desconto_a_vista_pix_perc')
  const parcelasCartao = num('parcelas_cartao_padrao')
  const jurosCartaoPct = num('juros_cartao_total_perc')
  const parcelasFinanciado = num('parcelas_financiamento_padrao')
  const finMinPct = num('financiamento_juros_min_perc')
  const finMaxPct = num('financiamento_juros_max_perc')

  const aVistaPix = base * (1 - descPixPct / 100)
  const valorParcelaCartao = (base * (1 + jurosCartaoPct / 100)) / parcelasCartao
  const parcelaFinMin = (base * (1 + finMinPct / 100)) / parcelasFinanciado
  const parcelaFinMax = (base * (1 + finMaxPct / 100)) / parcelasFinanciado

  return {
    a_vista_pix: { valor: aVistaPix, desconto_pct: descPixPct },
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
  }
}

/**
 * Busca valor numérico de um parâmetro vigente pela chave.
 */
export function getNum(params: ParametrosVigentes, chave: string, fallback = 0): number {
  return Number(params[chave]?.valor_numero) || fallback
}

/**
 * Resolve margem % pela matriz fv_matriz_margem_kwp (tipo_projeto × faixa kWp).
 * Kalebe 2026-09-18: fallback pra margem_contribuicao_perc global (20%) quando:
 *  - tipo_projeto não é informado
 *  - matriz não semeada
 *  - tipo não está na matriz
 *  - potência fora de todas as faixas
 *  - célula da faixa está null (Kalebe ainda não preencheu)
 */
export function resolverMargemPct(
  potenciaKwp: number,
  tipoProjeto: string | undefined,
  params: ParametrosVigentes,
): number {
  const fallback = getNum(params, 'margem_contribuicao_perc', 20)
  if (!tipoProjeto) return fallback

  const matriz = params['fv_matriz_margem_kwp']?.valor_json as
    | { faixas?: Array<{ min: number; max: number; rotulo?: string }>;
        por_tipo?: Record<string, Array<number | null>> }
    | undefined
  if (!matriz?.faixas?.length || !matriz.por_tipo) return fallback

  const idx = matriz.faixas.findIndex(
    (f) => potenciaKwp >= f.min && potenciaKwp < f.max,
  )
  if (idx === -1) return fallback

  const valores = matriz.por_tipo[tipoProjeto]
  if (!Array.isArray(valores)) return fallback

  const celula = valores[idx]
  return (celula !== null && celula !== undefined && !isNaN(Number(celula)))
    ? Number(celula)
    : fallback
}

/**
 * Calcula preço final da proposta.
 */
export function calcularProposta(entradas: Entradas, params: ParametrosVigentes): PropostaCalculada {
  const { placa, inversor, itens_ca, potencia_kwp, distancia_km_extra = 0,
    subtotal_kit_weg_bruto_override } = entradas
  const numeroPlacas = placa.qtd

  // 1. KIT WEG (não paga imposto Simples porque é revenda WEG)
  //    Inclui placa+inversor+cabo+estrutura+MC4 quando o override é passado.
  //    O fator 0,4182 vale em todos os modos — inclusive ampliação, onde o
  //    inversor sai do bruto mas placa+estrutura+cabo+MC4 seguem sendo
  //    revenda WEG (Kalebe 2026-08-29).
  const subtotalKitBrutoCalc = (placa.preco_venda_unitario * placa.qtd) + (inversor.preco_venda_unitario * inversor.qtd)
  const subtotalKitBruto = subtotal_kit_weg_bruto_override && subtotal_kit_weg_bruto_override > 0
    ? subtotal_kit_weg_bruto_override
    : subtotalKitBrutoCalc
  // Kalebe 2026-09-18: agora lê do banco (chave semeada na mig 004). Se o
  // param não estiver semeado, cai no fallback 0,4182.
  const fatorKitWeg = getNum(params, 'fator_kit_weg_preco_cliente', FATOR_KIT_WEG_FALLBACK)
  const kitWegComFator = subtotalKitBruto * fatorKitWeg

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

  // 4. PROJETO + ART (mesmo cálculo pra ampliação ou sistema completo —
  //    Kalebe 2026-08-28: 'não muda os valores, só quero que sejam
  //    adicionados na precificação' — antes o modo ampliação não zerava
  //    esses campos, comportamento agora idêntico ao normal.)
  let projetoArt = 0
  if (potencia_kwp <= 30) {
    projetoArt = getNum(params, 'projeto_valor_fixo_ate_30kwp', 400)
  } else {
    const base = getNum(params, 'projeto_valor_fixo_ate_30kwp', 400)
    const extra = (potencia_kwp - 30) * getNum(params, 'projeto_rs_por_kwp_acima_30kwp', 30)
    projetoArt = base + extra
  }

  // 5. INSTALAÇÃO (mesma tabela por faixa de placas nos dois modos)
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

  // 7. MARGEM + COMISSÃO + IMPOSTOS (método invertido).
  //    Kalebe 2026-09-02: imposto Simples agora incide SÓ sobre a "nota Spin"
  //    (PV − kit WEG), com alíquota 15%. Antes era 6% sobre o PV total —
  //    ajuste proporcional que dava ~15% sobre a nota, mas menos preciso.
  //    Motivo: a nota fiscal dos equipamentos WEG é emitida pelo fornecedor
  //    direto ao cliente (não passa pela Spin), então só a diferença (Lista
  //    CA + serviços + margem + comissão) entra na tributação da Spin.
  //
  //    Álgebra do método invertido:
  //      PV = kit + baseImp + margem·PV + comissao·PV + imposto·(PV − kit)
  //      PV(1 − (m+c+i)/100) = kit·(1 − i/100) + baseImp
  //      PV = [kit·(1 − i/100) + baseImp] / (1 − (m+c+i)/100)
  // Kalebe 2026-09-18: margem varia por (tipo_projeto, potencia_kwp) via
  // matriz fv_matriz_margem_kwp. Fallback = margem_contribuicao_perc global.
  const margemPct = resolverMargemPct(potencia_kwp, entradas.tipo_projeto, params)
  const comissaoPct = getNum(params, 'comissao_vendedor_perc', 5)
  const impostosPct = getNum(params, 'aliquota_simples_perc', 15)

  const custoTotal = kitWegComFator + baseImpostavel
  const percentualsAcrescimos = (margemPct + comissaoPct + impostosPct) / 100
  const pvTotal = (kitWegComFator * (1 - impostosPct / 100) + baseImpostavel) / (1 - percentualsAcrescimos)

  const margem = pvTotal * (margemPct / 100)
  const comissaoVendedor = pvTotal * (comissaoPct / 100)
  // Imposto = 15% sobre a nota Spin (PV − kit WEG). Fica coerente com a
  // nova fórmula do PV — antes era exibido isso mas embutido diferente.
  const impostosSimples = (pvTotal - kitWegComFator) * (impostosPct / 100)

  // Margem mínima aceita — pra calcular desconto máximo (mesma fórmula nova)
  const margemMinima = getNum(params, 'margem_minima_negociacao_perc', 15)
  const pvMinimo = (kitWegComFator * (1 - impostosPct / 100) + baseImpostavel)
    / (1 - (margemMinima + comissaoPct + impostosPct) / 100)
  const descontoMaxNegociacao = pvTotal - pvMinimo

  // Pagamento — base padrão é o pvTotal; a camada de apresentação (PDF/WhatsApp)
  // recalcula com calcularFormasPagamento(pvFinal) quando há desconto/acréscimo/extras.

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
      fator_kit_weg_aplicado: fatorKitWeg,
      margem_pct: margemPct,
      comissao_pct: comissaoPct,
      impostos_pct: impostosPct,
      numero_placas: numeroPlacas,
      potencia_cc_kwp: potencia_kwp,
    },
    formas_pagamento: calcularFormasPagamento(pvTotal, params),
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
