/**
 * Plano de caixa de uma venda do sistema (Kalebe 2026-09-30): recebimentos
 * pela condição acordada + custos PREVISTOS do orçamento. Regra única usada
 * pela programação manual (ModalProgramarVenda) e pela automática
 * (lib/financeiro/sync-vendas.ts). Sem imports de servidor.
 */
import {
  addMeses, arred, dividirEmParcelas, mesDe, vencimentoDas,
  type Direcao, type Grupo, type VendaPendente,
} from './fluxo'

export type ModeloRecebimento = 'avista' | 'entrada_saldo' | 'parcelado' | 'financiamento' | 'livre'

export type LinhaPlano = {
  direcao: Direcao
  grupo: Grupo
  descricao: string
  valor: number
  data: string
  forma_pagamento?: string | null
  parcela_num?: number | null
  parcelas_total?: number | null
  detalhes?: Record<string, any>
}

export const MODELOS_RECEBIMENTO: Array<{ valor: ModeloRecebimento; rotulo: string }> = [
  { valor: 'avista', rotulo: 'À vista' },
  { valor: 'entrada_saldo', rotulo: 'Entrada + saldo parcelado' },
  { valor: 'financiamento', rotulo: 'Financiamento bancário (liberação única)' },
  { valor: 'livre', rotulo: 'Livre (montar parcela a parcela)' },
  { valor: 'parcelado', rotulo: 'Parcelado (cartão / boleto)' },
]

/** Lê a condição que o vendedor escolheu no "Fechar venda". */
export function modeloDoVendedor(cond: string | null, parcelas: number | null): { modelo: ModeloRecebimento; n: number; forma: string } {
  const c = (cond || '').toLowerCase()
  const cartao = c.match(/(\d+)\s*[×x]\s*no cart/)
  if (cartao) return { modelo: 'parcelado', n: Number(cartao[1]), forma: 'Cartão de crédito' }
  if (c.includes('financiamento')) return { modelo: 'financiamento', n: 1, forma: 'Financiamento bancário' }
  if (c.includes('entrada')) return { modelo: 'entrada_saldo', n: Math.max(1, (parcelas || 2) - 1), forma: 'PIX' }
  if (c.includes('vista')) return { modelo: 'avista', n: 1, forma: 'PIX' }
  return { modelo: 'livre', n: Math.max(1, parcelas || 1), forma: '' }
}

export type ParametrosPlano = {
  cliente: string
  baseReceber: number            // valor da venda − kit (quando o kit é faturado direto)
  modelo: ModeloRecebimento
  data1: string                  // entrada / 1ª parcela / à vista
  entrada?: number | null        // entrada_saldo: vazio = 50%
  n: number                      // parcelas (saldo ou parcelado)
  dataSaldo?: string             // entrada_saldo: 1º vencimento do saldo
  forma?: string | null
}

export function gerarRecebimentos(p: ParametrosPlano): LinhaPlano[] {
  const f = p.forma || null
  const cli = p.cliente
  const n = Math.max(1, Math.floor(p.n || 1))
  const rec = (descricao: string, valor: number, data: string, extra: Partial<LinhaPlano> = {}): LinhaPlano =>
    ({ direcao: 'entrada', grupo: 'receita_vendas', descricao, valor: arred(valor), data, forma_pagamento: f, ...extra })

  if (p.modelo === 'avista' || p.modelo === 'financiamento') {
    return [rec(`${p.modelo === 'financiamento' ? 'Liberação do financiamento' : 'Recebimento à vista'} — ${cli}`, p.baseReceber, p.data1,
      p.modelo === 'financiamento' ? { forma_pagamento: 'Financiamento bancário' } : {})]
  }
  if (p.modelo === 'entrada_saldo') {
    const ent = p.entrada ? Math.min(p.entrada, p.baseReceber) : arred(p.baseReceber / 2)
    const saldo = dividirEmParcelas(p.baseReceber - ent, n)
    const dataSaldo = p.dataSaldo || addMeses(p.data1, 1)
    return [
      rec(`Entrada — ${cli}`, ent, p.data1),
      ...saldo.map((v, i) => rec(`Saldo ${i + 1}/${saldo.length} — ${cli}`, v, addMeses(dataSaldo, i), { parcela_num: i + 1, parcelas_total: saldo.length })),
    ]
  }
  if (p.modelo === 'parcelado') {
    return dividirEmParcelas(p.baseReceber, n).map((v, i) =>
      rec(`Parcela ${i + 1}/${n} — ${cli}`, v, addMeses(p.data1, i), { parcela_num: i + 1, parcelas_total: n }))
  }
  return [rec(`Recebimento — ${cli}`, p.baseReceber, p.data1)]
}

/** Custos do orçamento como PREVISTO. Imposto: competência (DAS do mês seguinte) ou caixa (por recebimento). */
export function gerarCustos(entrada: {
  venda: VendaPendente
  kitPassa: boolean
  data1: string
  regime: 'competencia' | 'caixa'
  recebimentos: Array<{ valor: number; data: string }>
}): LinhaPlano[] {
  const { venda, data1 } = entrada
  const c = venda.custos
  const cli = venda.cliente
  const out: LinhaPlano[] = []
  const saida = (grupo: Grupo, descricao: string, valor: number, data: string, detalhes?: Record<string, any>) => {
    if (valor > 0.004) out.push({ direcao: 'saida', grupo, descricao, valor: arred(valor), data, ...(detalhes ? { detalhes } : {}) })
  }
  if (entrada.kitPassa) saida('fornecedores', `${venda.kit_sempre_caixa ? 'Equipamentos (fornecedor)' : 'Kit fotovoltaico (distribuidor)'} — ${cli}`, c.kit, data1)
  saida('comissoes', `Comissão${venda.vendedor_nome ? ` ${venda.vendedor_nome}` : ''} — ${cli}`, c.comissao, data1,
    venda.vendedor_nome ? { vendedor: venda.vendedor_nome } : undefined)
  saida('custos_projeto', `Instalação / mão de obra — ${cli}`, c.instalacao, data1)
  saida('custos_projeto', `Frete — ${cli}`, c.frete, data1)
  saida('custos_projeto', `Projeto e ART — ${cli}`, c.projeto_art, data1)
  saida('custos_projeto', `Custo da venda — ${cli}`, c.custo_estimado, data1)
  if (c.imposto > 0.004) {
    if (entrada.regime === 'competencia') {
      saida('impostos', `DAS (Simples) sobre a venda — ${cli}`, c.imposto, vencimentoDas(data1),
        { tipo_imposto: 'DAS — Simples Nacional', competencia: mesDe(data1) })
    } else {
      const total = entrada.recebimentos.reduce((s, r) => s + r.valor, 0) || 1
      const porMes = new Map<string, number>()
      for (const r of entrada.recebimentos) porMes.set(mesDe(r.data), (porMes.get(mesDe(r.data)) || 0) + c.imposto * r.valor / total)
      for (const [mes, v] of Array.from(porMes.entries()).sort()) {
        saida('impostos', `DAS (Simples) ${mes.split('-').reverse().join('/')} — ${cli}`, v, vencimentoDas(mes + '-01'),
          { tipo_imposto: 'DAS — Simples Nacional', competencia: mes })
      }
    }
  }
  return out
}

/**
 * Plano AUTOMÁTICO (sem ninguém clicar): condição do vendedor quando dá pra
 * ler; "Outra"/sem condição → à vista na data do fechamento. Kit segue o
 * padrão do fluxo (config). Tudo editável depois na lista de lançamentos.
 */
export function planoAutomatico(venda: VendaPendente, cfg: { regime_imposto: 'competencia' | 'caixa'; kit_passa_caixa_padrao: boolean }) {
  const m = modeloDoVendedor(venda.condicao_vendedor, venda.parcelas_vendedor)
  const modelo: ModeloRecebimento = m.modelo === 'livre' ? 'avista' : m.modelo
  // Venda direta: Spin fatura tudo → equipamentos sempre pelo caixa
  let kitPassa = venda.custos.kit > 0 ? (venda.kit_sempre_caixa ? true : cfg.kit_passa_caixa_padrao) : false
  // Kit do orçamento maior que a venda (orçamento desatualizado?) → não desconta; conferir
  const kitIncoerente = !kitPassa && venda.custos.kit >= venda.valor_venda
  if (kitIncoerente) kitPassa = false
  const baseReceber = arred(Math.max(venda.valor_venda - (kitPassa || kitIncoerente ? 0 : venda.custos.kit), 0))
  // Kalebe 2026-10-06: recebimentos a partir da data de pagamento informada no
  // fechamento; custos (comissão, instalação…) seguem a data da venda
  const dataReceber = venda.data_pagamento || venda.data_venda
  const recebimentos = gerarRecebimentos({
    cliente: venda.cliente, baseReceber, modelo, data1: dataReceber, n: m.n,
    dataSaldo: addMeses(dataReceber, 1), forma: m.forma || null,
  })
  const custos = gerarCustos({ venda, kitPassa, data1: venda.data_venda, regime: cfg.regime_imposto, recebimentos })
  return {
    kitPassa,
    linhas: [...recebimentos, ...custos],
    condicao: {
      automatica: true, modelo, parcelas: m.n, forma: m.forma, regime_imposto: cfg.regime_imposto,
      condicao_vendedor: venda.condicao_vendedor, observacoes_vendedor: venda.observacoes_vendedor,
      // "Outra"/sem condição (lançado à vista) ou kit incoerente com o valor: conferir
      revisar: m.modelo === 'livre' || kitIncoerente,
      assinatura: assinaturaVenda(venda),
    },
  }
}

/**
 * O que, se mudar, refaz o previsto automático da venda (Kalebe 2026-10-06:
 * venda alterada depois de fechada — valor, datas, condição ou custos).
 */
export function assinaturaVenda(v: VendaPendente): string {
  const c = v.custos
  const custos = arred(c.kit + c.comissao + c.imposto + c.instalacao + c.frete + c.projeto_art + c.custo_estimado)
  return [arred(v.valor_venda), v.data_venda, v.data_pagamento || '', v.condicao_vendedor || '', v.parcelas_vendedor || '', custos].join('|')
}
