import type { VendaPendente } from './fluxo'

/**
 * Custos das propostas montadas no Spinzap → fluxo de caixa (Kalebe
 * 2026-10-16). Esses projetos não têm orcamento_final (a fonte dos custos da
 * proposta formal), então o fechamento guarda os custos da proposta em
 * venda_fechada.custos_proposta, lidos da memória de cálculo do histórico.
 * Sem imports de servidor.
 */

export type CustosProposta = VendaPendente['custos']

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const vazio = (): CustosProposta => ({ kit: 0, comissao: 0, imposto: 0, instalacao: 0, frete: 0, projeto_art: 0, custo_estimado: 0 })

/** Memória de cálculo da proposta (projeto_propostas_historico) → custos no valor da proposta. */
export function custosDaPropostaSpinzap(modo: string | null | undefined, m: Record<string, any> | null | undefined): CustosProposta | null {
  if (!m) return null
  const md = String(modo || '').replace(/_final$/, '')
  if (md === 'orcamento_spinzap') {
    // FV: componentes do motor (calcular.ts), guardados desde 2026-10-16
    const c = m.custos
    if (!c) return null
    return { ...vazio(), kit: num(c.kit), comissao: num(c.comissao), imposto: num(c.imposto), instalacao: num(c.instalacao), frete: num(c.frete), projeto_art: num(c.projeto_art), custo_estimado: num(c.materiais) }
  }
  if (md === 'estacao_recarga') {
    // Recarga: equipamentos (revenda), projeto, execução (mão de obra/deslocamento) e materiais
    const pv = num(m.estacao)
    const equip = num(m.equipamentos)
    return {
      ...vazio(),
      kit: equip, projeto_art: num(m.projeto), instalacao: num(m.servicos_execucao), custo_estimado: num(m.materiais),
      comissao: pv * num(m.comissao_pct) / 100,
      imposto: Math.max(pv - equip, 0) * num(m.impostos_pct) / 100,
    }
  }
  if (md === 'bess_spinzap') {
    return {
      ...vazio(),
      kit: num(m.kit_com_fator), frete: num(m.frete), projeto_art: num(m.projeto_art), instalacao: num(m.instalacao),
      custo_estimado: num(m.subtotal_lista_ca), comissao: num(m.comissao), imposto: num(m.imposto),
    }
  }
  if (md === 'tecnico_spinzap') {
    const pvCustos = num(m.pv_custos)
    return {
      ...vazio(),
      projeto_art: num(m.custo),
      comissao: pvCustos * num(m.comissao_pct) / 100,
      imposto: (pvCustos + num(m.tabela)) * num(m.imposto_pct) / 100,
    }
  }
  // O&M: as calculadoras dão o preço, não o custo — fica sem custo previsto
  return null
}

/**
 * Custos ajustados ao valor real da venda (mesma regra do projeto formal,
 * vendas-sistema.custosProjeto): comissão acompanha o valor vendido; imposto
 * = alíquota efetiva × (venda − kit); o resto fica como estava.
 */
export function custosNaVenda(c: CustosProposta, valorProposta: number, valorVenda: number): CustosProposta {
  const vp = num(valorProposta) > 0 ? num(valorProposta) : valorVenda
  const fator = vp > 0 ? valorVenda / vp : 1
  const aliq = vp - c.kit > 0 ? c.imposto / (vp - c.kit) : 0
  return { ...c, comissao: c.comissao * fator, imposto: aliq * Math.max(valorVenda - c.kit, 0) }
}
