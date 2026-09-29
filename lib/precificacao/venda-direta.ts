import { getNum, type ParametrosVigentes } from './calcular'

/**
 * Precificação da VENDA DIRETA de equipamentos (Kalebe 2026-09-29).
 *
 * Só equipamentos da planilha WEG, entregues ao consumidor final — sem
 * projeto/ART, sem mão de obra de instalação, sem lista CA.
 *
 *   custo_equip = Σ(preço planilha × qtd) × fator_kit_weg_preco_cliente
 *               + Σ(custo digitado × qtd)   ← itens sem preço na planilha marcados como "custo"
 *   base        = custo_equip + frete (digitado por proposta)
 *   PV          = base / (1 − (margem + comissão + imposto) / 100)
 *
 * Diferença pra proposta FV: a Spin emite a nota de TUDO, então o imposto
 * incide sobre o PV inteiro (na FV o kit é faturado pela WEG direto ao
 * cliente e o imposto só pega a nota Spin).
 *
 * Pagamento (Kalebe 2026-09-29): PIX e boleto à vista pelo PV; cartão com a
 * taxa do parcelamento por conta do cliente (mesmos parâmetros de cartão da
 * proposta normal). Sem desconto PIX e sem financiamento.
 */

export type ItemVendaDireta = {
  produto_id: string | null
  modelo: string
  fabricante: string | null
  descricao: string | null
  categoria: string | null
  qtd: number
  preco_tabela: number        // preço unitário (planilha WEG antes do fator, ou custo — ver base_preco)
  /**
   * Kalebe 2026-09-29: produto sem preço na planilha (ex.: WEMOB) — o admin
   * digita o preço só nesta proposta e diz, item a item, se é tabela WEG
   * (multiplica pelo fator) ou custo da Spin (entra direto, sem fator).
   */
  preco_manual?: boolean
  base_preco?: 'tabela' | 'custo'
}

/** Custo do item pra Spin: tabela × fator, ou o custo digitado direto. */
export function custoDoItem(i: ItemVendaDireta, fator: number): number {
  const bruto = Number(i.preco_tabela || 0) * Number(i.qtd || 0)
  return i.base_preco === 'custo' ? bruto : bruto * fator
}

export type CalculoVendaDireta = {
  subtotal_tabela: number
  fator_aplicado: number
  custo_direto: number            // itens com preço digitado como custo (sem fator)
  custo_equipamentos: number
  frete: number
  base_custo: number
  margem_pct: number
  comissao_pct: number
  imposto_pct: number
  margem: number
  comissao: number
  imposto: number
  pv_total: number
  qtd_itens: number
  pagamento: PagamentoVendaDireta
}

export type PagamentoVendaDireta = {
  a_vista: number                     // PIX ou boleto à vista
  cartao_parcelas: number
  cartao_taxa_pct: number
  cartao_total: number
  cartao_parcela: number
}

const FATOR_FALLBACK = 0.4182

export function calcularPagamentoVendaDireta(pvTotal: number, params: ParametrosVigentes): PagamentoVendaDireta {
  const parcelas = getNum(params, 'parcelas_cartao_padrao', 12)
  const taxaPct = getNum(params, 'juros_cartao_total_perc', 8.99)
  const cartaoTotal = pvTotal * (1 + taxaPct / 100)
  return {
    a_vista: pvTotal,
    cartao_parcelas: parcelas,
    cartao_taxa_pct: taxaPct,
    cartao_total: cartaoTotal,
    cartao_parcela: parcelas > 0 ? cartaoTotal / parcelas : cartaoTotal,
  }
}

export function calcularVendaDireta(
  entrada: { itens: ItemVendaDireta[]; frete: number },
  params: ParametrosVigentes,
): CalculoVendaDireta {
  const itens = entrada.itens.filter((i) => Number(i.qtd) > 0)
  const doTabela = itens.filter((i) => i.base_preco !== 'custo')
  const subtotalTabela = doTabela.reduce((s, i) => s + Number(i.preco_tabela || 0) * Number(i.qtd || 0), 0)
  const custoDireto = itens.filter((i) => i.base_preco === 'custo')
    .reduce((s, i) => s + Number(i.preco_tabela || 0) * Number(i.qtd || 0), 0)
  const fator = getNum(params, 'fator_kit_weg_preco_cliente', FATOR_FALLBACK)
  const custoEquip = subtotalTabela * fator + custoDireto
  const frete = Math.max(0, Number(entrada.frete) || 0)
  const base = custoEquip + frete

  const margemPct = getNum(params, 'venda_direta_margem_perc', 18)
  const comissaoPct = getNum(params, 'venda_direta_comissao_perc', 3)
  const impostoPct = getNum(params, 'aliquota_simples_perc', 15)
  const somaPct = (margemPct + comissaoPct + impostoPct) / 100
  const pvTotal = base > 0 && somaPct < 1 ? base / (1 - somaPct) : 0

  return {
    subtotal_tabela: subtotalTabela,
    fator_aplicado: fator,
    custo_direto: custoDireto,
    custo_equipamentos: custoEquip,
    frete,
    base_custo: base,
    margem_pct: margemPct,
    comissao_pct: comissaoPct,
    imposto_pct: impostoPct,
    margem: pvTotal * (margemPct / 100),
    comissao: pvTotal * (comissaoPct / 100),
    imposto: pvTotal * (impostoPct / 100),
    pv_total: pvTotal,
    qtd_itens: itens.reduce((s, i) => s + Number(i.qtd || 0), 0),
    pagamento: calcularPagamentoVendaDireta(pvTotal, params),
  }
}
