/**
 * Vendas fechadas no sistema → formato do fluxo de caixa (Kalebe 2026-09-30).
 * Regra única pra leitura (lib/financeiro/dados.ts) e pra sincronização
 * automática (lib/financeiro/sync-vendas.ts). Sem imports de servidor.
 */
import type { VendaPendente } from './fluxo'

// Mesmo critério do painel da equipe (app/admin/equipe/actions.ts)
export const STATUS_FECHADOS = ['vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda']

export const SELECT_PROJETO_VENDA = `
  id, cliente_razao_social, consultor_id, status, pv_total, orcamento_consolidado,
  status_atualizado_em, updated_at,
  pv_orcamento:orcamento_final->pv_total, kit:orcamento_final->kit_weg_com_fator,
  comissao:orcamento_final->comissao_vendedor, imposto:orcamento_final->impostos_simples,
  instalacao:orcamento_final->instalacao, frete:orcamento_final->frete, projeto_art:orcamento_final->projeto_art
`

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * Data da venda = a informada no fechamento (Kalebe 2026-10-06); senão a 1ª
 * entrada numa etapa de "fechado" (projeto_status_historico).
 * status_atualizado_em muda a cada etapa (vendido → homologação → execução),
 * então só serve de último recurso.
 */
export function dataFechamento(p: any, primeiroFechamento?: Map<string, string>): string {
  return String(
    p.orcamento_consolidado?.venda_fechada?.data_venda || primeiroFechamento?.get(p.id)
      || p.orcamento_consolidado?.venda_fechada?.fechada_em || p.status_atualizado_em || p.updated_at || '',
  ).slice(0, 10)
}

const dataPagamento = (p: any): string | null => {
  const d = p.orcamento_consolidado?.venda_fechada?.data_pagamento
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null
}

/** Mapa projeto → data da 1ª vez que entrou em etapa de fechado. */
export function mapaPrimeiroFechamento(historico: Array<{ projeto_id: string; created_at: string }>): Map<string, string> {
  const m = new Map<string, string>()
  for (const h of historico) {
    const atual = m.get(h.projeto_id)
    if (!atual || h.created_at < atual) m.set(h.projeto_id, h.created_at)
  }
  return m
}

/** Valor real da venda: acordado no fechamento > consolidado > simulado. */
export function valorVendaProjeto(p: any): number {
  const c = p.orcamento_consolidado || {}
  return num(c.venda_fechada?.preco_final) || num(c.pv_acordado) || num(p.pv_total) || num(c.pv_total) || num(p.pv_orcamento)
}

/**
 * Custos do orçamento ajustados ao valor real da venda.
 * - multi-UC: o orcamento_final guarda 1 UC → escala custos fixos por pv_bruto/pv_da_UC
 * - comissão acompanha o valor vendido; imposto = alíquota efetiva × (venda − kit)
 */
export function custosProjeto(p: any, valorVenda: number): VendaPendente['custos'] {
  const pvOrc = num(p.pv_orcamento)
  const c = p.orcamento_consolidado || {}
  const fatorUc = num(c.ucs_qtd) > 1 && num(c.pv_bruto) > 0 && pvOrc > 0 ? num(c.pv_bruto) / pvOrc : 1
  const kit = num(p.kit) * fatorUc
  const pvBase = pvOrc * fatorUc
  const aliq = pvOrc - num(p.kit) > 0 ? num(p.imposto) / (pvOrc - num(p.kit)) : 0
  return {
    kit,
    comissao: pvBase > 0 ? num(p.comissao) * fatorUc * (valorVenda / pvBase) : 0,
    imposto: aliq * Math.max(valorVenda - kit, 0),
    instalacao: num(p.instalacao) * fatorUc,
    frete: num(p.frete) * fatorUc,
    projeto_art: num(p.projeto_art) * fatorUc,
    custo_estimado: 0,
  }
}

/**
 * Kalebe 2026-09-30: custos da VENDA DIRETA vêm do cálculo salvo no item
 * 'venda_equipamentos' (projeto_itens.dados.calculo), não do orçamento FV.
 */
export function custosVendaDireta(calculo: any): VendaPendente['custos'] {
  return {
    kit: num(calculo?.custo_equipamentos),
    comissao: num(calculo?.comissao),
    imposto: num(calculo?.imposto),
    instalacao: 0,
    frete: num(calculo?.frete),
    projeto_art: 0,
    custo_estimado: 0,
  }
}

export function vendaDoProjeto(
  p: any,
  nomes: Map<string, string>,
  primeiroFechamento?: Map<string, string>,
  calculoVendaDireta?: any,
): VendaPendente {
  const valor = calculoVendaDireta ? (num(calculoVendaDireta.pv_total) || valorVendaProjeto(p)) : valorVendaProjeto(p)
  const vf = p.orcamento_consolidado?.venda_fechada || {}

  // Kalebe 2026-10-01: venda de equipamentos JUNTO com orçamento solar no mesmo
  // projeto → soma as duas partes. Preço final acordado no fechamento vale pelo
  // negócio inteiro; sem ele, solar + equipamentos. O custo dos equipamentos
  // vendidos sempre passa pelo caixa (entra como "custo da venda"); o kit
  // solar segue a regra do projeto (kit_passa_caixa).
  if (calculoVendaDireta && num(p.pv_orcamento) > 0) {
    const pvEquip = num(calculoVendaDireta.pv_total)
    const acordado = num(vf.preco_final)
    const valorSolar = acordado > 0 ? Math.max(acordado - pvEquip, 0) : valorVendaProjeto(p)
    const cSolar = custosProjeto(p, valorSolar)
    const cEquip = custosVendaDireta(calculoVendaDireta)
    return {
      origem: 'projeto', origem_id: p.id, projeto_id: p.id,
      cliente: p.cliente_razao_social || 'Cliente sem nome',
      data_venda: dataFechamento(p, primeiroFechamento),
      data_pagamento: dataPagamento(p),
      valor_venda: acordado > 0 ? acordado : valorSolar + pvEquip,
      condicao_vendedor: vf.condicao_pagamento || null,
      parcelas_vendedor: vf.parcelas || null,
      observacoes_vendedor: vf.observacoes || null,
      custos: {
        kit: cSolar.kit,
        comissao: cSolar.comissao + cEquip.comissao,
        imposto: cSolar.imposto + cEquip.imposto,
        instalacao: cSolar.instalacao,
        frete: cSolar.frete + cEquip.frete,
        projeto_art: cSolar.projeto_art,
        custo_estimado: cEquip.kit,
      },
      vendedor_nome: nomes.get(p.consultor_id) || null,
    }
  }

  if (calculoVendaDireta) {
    return {
      origem: 'projeto', origem_id: p.id, projeto_id: p.id,
      cliente: p.cliente_razao_social || 'Cliente sem nome',
      data_venda: dataFechamento(p, primeiroFechamento),
      data_pagamento: dataPagamento(p),
      valor_venda: valor,
      condicao_vendedor: vf.condicao_pagamento || null,
      parcelas_vendedor: vf.parcelas || null,
      observacoes_vendedor: vf.observacoes || null,
      custos: custosVendaDireta(calculoVendaDireta),
      vendedor_nome: nomes.get(p.consultor_id) || null,
      kit_sempre_caixa: true,
    }
  }
  return {
    origem: 'projeto',
    origem_id: p.id,
    projeto_id: p.id,
    cliente: p.cliente_razao_social || 'Cliente sem nome',
    data_venda: dataFechamento(p, primeiroFechamento),
      data_pagamento: dataPagamento(p),
    valor_venda: valor,
    condicao_vendedor: vf.condicao_pagamento || null,
    parcelas_vendedor: vf.parcelas || null,
    observacoes_vendedor: vf.observacoes || null,
    custos: custosProjeto(p, valor),
    vendedor_nome: nomes.get(p.consultor_id) || null,
  }
}

/** projeto_id → calculo da venda direta (itens 'venda_equipamentos'). */
export function mapaVendaDireta(itens: Array<{ projeto_id: string; dados: any }>): Map<string, any> {
  const m = new Map<string, any>()
  for (const i of itens) if (i?.dados?.calculo) m.set(i.projeto_id, i.dados.calculo)
  return m
}

export function vendaManual(v: any, nomes: Map<string, string>): VendaPendente {
  return {
    origem: 'venda_manual',
    origem_id: v.id,
    projeto_id: null,
    cliente: v.cliente_nome || 'Cliente',
    data_venda: String(v.data_venda || '').slice(0, 10),
    data_pagamento: v.data_pagamento ? String(v.data_pagamento).slice(0, 10) : null,
    valor_venda: num(v.valor_venda),
    condicao_vendedor: null,
    parcelas_vendedor: null,
    observacoes_vendedor: v.observacao || null,
    custos: { kit: 0, comissao: 0, imposto: 0, instalacao: 0, frete: 0, projeto_art: 0, custo_estimado: num(v.custo_estimado) },
    vendedor_nome: nomes.get(v.vendedor_id) || null,
  }
}
