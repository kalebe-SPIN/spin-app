import type { ParametrosVigentes } from './calcular'

/**
 * Precificação da VENDA DIRETA de equipamentos (Kalebe 2026-09-29).
 *
 * Só equipamentos, entregues ao consumidor final — sem projeto/ART, sem mão
 * de obra de instalação, sem lista CA.
 *
 *   custo_equip = Σ(preço planilha × qtd) × venda_direta_fator
 *               + Σ(custo digitado × qtd)   ← itens sem preço na planilha marcados como "custo"
 *   base        = custo_equip + frete (digitado por proposta)
 *   PV cheio    = base / (1 − (margem + comissão + imposto) / 100)
 *   PV final    = PV cheio − cupom (só admin aplica)
 *   comissão e imposto = % sobre o PV FINAL; margem = PV final − base − comissão − imposto
 *
 * Diferença pra proposta FV: a Spin emite a nota de TUDO, então o imposto
 * incide sobre o PV inteiro (na FV o kit é faturado pela WEG direto ao
 * cliente e o imposto só pega a nota Spin).
 *
 * Kalebe 2026-09-30: parâmetros PRÓPRIOS da venda direta (grupo
 * 'venda_direta' — fator, imposto, cartão). Sem a migration 128 cai nos
 * parâmetros da proposta FV, como antes.
 *
 * Pagamento: PIX e boleto à vista pelo PV final; cartão com a taxa do
 * parcelamento por conta do cliente. Sem desconto PIX e sem financiamento.
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

/** Cupom aplicado na proposta (snapshot — vale mesmo se o cupom mudar depois). */
export type CupomAplicado = {
  id: string
  codigo: string
  tipo: 'percentual' | 'valor'
  valor: number
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
  margem_pct: number              // margem-alvo (parâmetro)
  comissao_pct: number
  imposto_pct: number
  pv_cheio: number                // antes do cupom
  cupom: CupomAplicado | null
  desconto_cupom: number
  margem: number                  // em R$, depois do cupom
  margem_efetiva_pct: number      // margem / PV final
  comissao: number
  imposto: number
  pv_total: number                // PV final (com cupom)
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

/** Parâmetros editáveis na tela /admin/precificacao/venda-direta (ordem da fórmula). */
export const PARAMETROS_VENDA_DIRETA: Array<{ chave: string; rotulo: string; ajuda: string; casas: number }> = [
  { chave: 'venda_direta_fator', rotulo: 'Fator sobre a tabela WEG', ajuda: 'Custo do equipamento = preço de tabela × fator.', casas: 4 },
  { chave: 'venda_direta_margem_perc', rotulo: 'Margem da empresa', ajuda: '% do preço de venda que fica pra Spin (antes de cupom).', casas: 2 },
  { chave: 'venda_direta_comissao_perc', rotulo: 'Comissão do vendedor', ajuda: '% sobre o valor final (já com desconto).', casas: 2 },
  { chave: 'venda_direta_imposto_perc', rotulo: 'Imposto sobre a venda', ajuda: '% sobre o valor final — a Spin fatura tudo.', casas: 2 },
  { chave: 'venda_direta_parcelas_cartao', rotulo: 'Parcelas no cartão', ajuda: 'Quantidade exibida na proposta.', casas: 0 },
  { chave: 'venda_direta_taxa_cartao_perc', rotulo: 'Taxa do cartão', ajuda: 'Total do parcelamento, por conta do cliente.', casas: 2 },
  { chave: 'venda_direta_margem_minima_cupom_perc', rotulo: 'Margem mínima com cupom', ajuda: 'Cupom que deixar a margem abaixo disso é recusado.', casas: 2 },
]

/**
 * Lê o 1º parâmetro existente da lista (próprio da venda direta → da FV →
 * padrão). Diferente do getNum, ZERO é valor válido (comissão 0% é 0%).
 */
function param(params: ParametrosVigentes, chaves: string[], padrao: number): number {
  for (const c of chaves) {
    const v = params[c]?.valor_numero
    if (v !== null && v !== undefined && Number.isFinite(Number(v))) return Number(v)
  }
  return padrao
}

export const fatorVendaDireta = (params: ParametrosVigentes) =>
  param(params, ['venda_direta_fator', 'fator_kit_weg_preco_cliente'], FATOR_FALLBACK)
export const margemMinimaCupom = (params: ParametrosVigentes) =>
  param(params, ['venda_direta_margem_minima_cupom_perc'], 0)

export function calcularPagamentoVendaDireta(pvTotal: number, params: ParametrosVigentes): PagamentoVendaDireta {
  const parcelas = Math.max(1, param(params, ['venda_direta_parcelas_cartao', 'parcelas_cartao_padrao'], 12))
  const taxaPct = param(params, ['venda_direta_taxa_cartao_perc', 'juros_cartao_total_perc'], 8.99)
  const cartaoTotal = pvTotal * (1 + taxaPct / 100)
  return {
    a_vista: pvTotal,
    cartao_parcelas: parcelas,
    cartao_taxa_pct: taxaPct,
    cartao_total: cartaoTotal,
    cartao_parcela: parcelas > 0 ? cartaoTotal / parcelas : cartaoTotal,
  }
}

/** Desconto em R$ de um cupom sobre o PV cheio (nunca passa do próprio PV). */
export function descontoDoCupom(cupom: CupomAplicado | null | undefined, pvCheio: number): number {
  if (!cupom || !(pvCheio > 0)) return 0
  const d = cupom.tipo === 'percentual' ? pvCheio * (Number(cupom.valor) / 100) : Number(cupom.valor)
  return Math.round(Math.min(Math.max(d, 0), pvCheio) * 100) / 100
}

export function calcularVendaDireta(
  entrada: { itens: ItemVendaDireta[]; frete: number; cupom?: CupomAplicado | null },
  params: ParametrosVigentes,
): CalculoVendaDireta {
  const itens = entrada.itens.filter((i) => Number(i.qtd) > 0)
  const doTabela = itens.filter((i) => i.base_preco !== 'custo')
  const subtotalTabela = doTabela.reduce((s, i) => s + Number(i.preco_tabela || 0) * Number(i.qtd || 0), 0)
  const custoDireto = itens.filter((i) => i.base_preco === 'custo')
    .reduce((s, i) => s + Number(i.preco_tabela || 0) * Number(i.qtd || 0), 0)
  const fator = fatorVendaDireta(params)
  const custoEquip = subtotalTabela * fator + custoDireto
  const frete = Math.max(0, Number(entrada.frete) || 0)
  const base = custoEquip + frete

  const margemPct = param(params, ['venda_direta_margem_perc'], 18)
  const comissaoPct = param(params, ['venda_direta_comissao_perc'], 3)
  const impostoPct = param(params, ['venda_direta_imposto_perc', 'aliquota_simples_perc'], 15)
  const somaPct = (margemPct + comissaoPct + impostoPct) / 100
  const pvCheio = base > 0 && somaPct < 1 ? base / (1 - somaPct) : 0

  // Cupom: desconto sai do PV; comissão e imposto acompanham o valor com desconto
  const cupom = entrada.cupom || null
  const desconto = descontoDoCupom(cupom, pvCheio)
  const pvTotal = pvCheio - desconto
  const comissao = pvTotal * (comissaoPct / 100)
  const imposto = pvTotal * (impostoPct / 100)
  const margem = pvTotal - base - comissao - imposto

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
    pv_cheio: pvCheio,
    cupom,
    desconto_cupom: desconto,
    margem,
    margem_efetiva_pct: pvTotal > 0 ? (margem / pvTotal) * 100 : 0,
    comissao,
    imposto,
    pv_total: pvTotal,
    qtd_itens: itens.reduce((s, i) => s + Number(i.qtd || 0), 0),
    pagamento: calcularPagamentoVendaDireta(pvTotal, params),
  }
}

/** Trava: cupom não pode deixar a margem abaixo da mínima configurada. */
export function erroTravaCupom(calc: CalculoVendaDireta, params: ParametrosVigentes): string | null {
  if (!calc.cupom || calc.desconto_cupom <= 0) return null
  const minima = margemMinimaCupom(params)
  if (calc.margem_efetiva_pct + 1e-9 >= minima) return null
  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `Cupom ${calc.cupom.codigo} deixa a margem em ${fmt(calc.margem_efetiva_pct)}% — abaixo da mínima de ${fmt(minima)}%.`
}
