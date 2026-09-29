import { createClient } from '@/lib/supabase/server'
import {
  addMeses, hojeBR, mesDe,
  type Categoria, type ConfigFluxo, type Fornecedor, type Lancamento, type Passivo, type VendaPendente,
} from '@/lib/financeiro/fluxo'

/**
 * Carrega tudo que a tela de fluxo de caixa precisa (Kalebe 2026-09-29).
 * Integração com o dia a dia: projetos fechados (e vendas manuais, se a
 * tabela existir) viram "vendas a programar" com os custos do orçamento.
 */

// Mesmo critério do painel da equipe (app/admin/equipe/actions.ts)
export const STATUS_FECHADOS = ['vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda']

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Valor real da venda: acordado no fechamento > consolidado > simulado. */
function valorVendaProjeto(p: any): number {
  const c = p.orcamento_consolidado || {}
  return num(c.venda_fechada?.preco_final) || num(c.pv_acordado) || num(p.pv_total) || num(c.pv_total) || num(p.pv_orcamento)
}

/**
 * Custos do orçamento ajustados ao valor real da venda.
 * - multi-UC: o orcamento_final guarda 1 UC → escala custos fixos por pv_bruto/pv_da_UC
 * - comissão acompanha o valor vendido; imposto = alíquota efetiva × (venda − kit)
 */
function custosProjeto(p: any, valorVenda: number): VendaPendente['custos'] {
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

export async function carregarFluxo() {
  const supabase = createClient()
  const hoje = hojeBR()
  const desde = addMeses(hoje, -12)   // vendas dos últimos 12 meses podem ser programadas

  const [
    { data: cfg, error: eCfg },
    { data: lancs },
    { data: passivos },
    { data: fornecedores },
    { data: categorias },
    { data: programacoes },
    { data: projetos },
    vendasManuaisRes,
    { data: perfis },
  ] = await Promise.all([
    supabase.from('fluxo_config').select('saldo_inicial, data_inicio, reserva_minima, regime_imposto').maybeSingle(),
    supabase.from('fluxo_lancamentos').select('*').is('cancelado_em', null).order('data_prevista').limit(20000),
    supabase.from('fluxo_passivos').select('*').order('data_contratacao', { ascending: false }),
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia, cnpj, categoria, contato_telefone, ativo').order('razao_social'),
    supabase.from('categorias_financeiras').select('id, nome, tipo').eq('ativo', true).order('nome'),
    supabase.from('fluxo_programacoes').select('origem, origem_id, situacao'),
    supabase
      .from('projetos')
      .select(`
        id, cliente_razao_social, consultor_id, status, pv_total, orcamento_consolidado,
        status_atualizado_em, updated_at,
        pv_orcamento:orcamento_final->pv_total, kit:orcamento_final->kit_weg_com_fator,
        comissao:orcamento_final->comissao_vendedor, imposto:orcamento_final->impostos_simples,
        instalacao:orcamento_final->instalacao, frete:orcamento_final->frete, projeto_art:orcamento_final->projeto_art
      `)
      .in('status', STATUS_FECHADOS)
      .is('excluida_em', null)
      .limit(10000),
    // Migration 107 pode não estar aplicada — sem a tabela, só ignora
    supabase.from('vendas_manuais').select('id, cliente_nome, valor_venda, custo_estimado, data_venda, vendedor_id, observacao').is('deletada_em', null).limit(10000),
    supabase.from('profiles').select('id, nome_completo'),
  ])

  if (eCfg) return { erro: eCfg.message.includes('fluxo_config') ? 'Falta rodar a migration 127 no Supabase.' : eCfg.message } as const

  const config: ConfigFluxo = {
    saldo_inicial: num(cfg?.saldo_inicial),
    data_inicio: cfg?.data_inicio || hoje.slice(0, 8) + '01',
    reserva_minima: num(cfg?.reserva_minima),
    regime_imposto: cfg?.regime_imposto === 'caixa' ? 'caixa' : 'competencia',
  }
  const nomes = new Map((perfis || []).map((p: any) => [p.id, p.nome_completo as string]))
  const jaTratadas = new Set((programacoes || []).map((p: any) => `${p.origem}:${p.origem_id}`))

  // ─── Vendas do sistema: faturamento (competência) + pendentes de programação
  const faturamentoPorMes: Record<string, number> = {}
  const pendentes: VendaPendente[] = []

  for (const p of (projetos || []) as any[]) {
    const data = String(p.status_atualizado_em || p.updated_at || '').slice(0, 10)
    const valor = valorVendaProjeto(p)
    if (data) faturamentoPorMes[mesDe(data)] = (faturamentoPorMes[mesDe(data)] || 0) + valor
    if (!data || data < desde || jaTratadas.has(`projeto:${p.id}`) || valor <= 0) continue
    const vf = p.orcamento_consolidado?.venda_fechada || {}
    pendentes.push({
      origem: 'projeto',
      origem_id: p.id,
      projeto_id: p.id,
      cliente: p.cliente_razao_social || 'Cliente sem nome',
      data_venda: data,
      valor_venda: valor,
      condicao_vendedor: vf.condicao_pagamento || null,
      parcelas_vendedor: vf.parcelas || null,
      observacoes_vendedor: vf.observacoes || null,
      custos: custosProjeto(p, valor),
      vendedor_nome: nomes.get(p.consultor_id) || null,
    })
  }

  const vendasManuais = (vendasManuaisRes as any)?.error ? [] : ((vendasManuaisRes as any)?.data || [])
  for (const v of vendasManuais) {
    const data = String(v.data_venda || '').slice(0, 10)
    const valor = num(v.valor_venda)
    if (data) faturamentoPorMes[mesDe(data)] = (faturamentoPorMes[mesDe(data)] || 0) + valor
    if (!data || data < desde || jaTratadas.has(`venda_manual:${v.id}`) || valor <= 0) continue
    pendentes.push({
      origem: 'venda_manual',
      origem_id: v.id,
      projeto_id: null,
      cliente: v.cliente_nome || 'Cliente',
      data_venda: data,
      valor_venda: valor,
      condicao_vendedor: null,
      parcelas_vendedor: null,
      observacoes_vendedor: v.observacao || null,
      custos: { kit: 0, comissao: 0, imposto: 0, instalacao: 0, frete: 0, projeto_art: 0, custo_estimado: num(v.custo_estimado) },
      vendedor_nome: nomes.get(v.vendedor_id) || null,
    })
  }
  pendentes.sort((a, b) => b.data_venda.localeCompare(a.data_venda))

  // Projetos pra vincular custo (select do cadastro) — A→Z
  const projetosLista = ((projetos || []) as any[])
    .map((p) => ({ id: p.id, nome: p.cliente_razao_social || 'Sem nome' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const equipe = (perfis || [])
    .map((p: any) => ({ id: p.id, nome: p.nome_completo || 'Sem nome' }))
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return {
    config,
    lancamentos: ((lancs || []) as any[]).map((l) => ({
      ...l,
      valor_previsto: num(l.valor_previsto),
      valor_realizado: l.valor_realizado === null ? null : num(l.valor_realizado),
    })) as Lancamento[],
    passivos: ((passivos || []) as any[]).map((p) => ({
      ...p, valor_contratado: num(p.valor_contratado), valor_parcela: p.valor_parcela === null ? null : num(p.valor_parcela),
    })) as Passivo[],
    fornecedores: (fornecedores || []) as Fornecedor[],
    categorias: (categorias || []) as Categoria[],
    pendentes,
    faturamentoPorMes,
    projetosLista,
    equipe,
  } as const
}

export type DadosFluxo = Exclude<Awaited<ReturnType<typeof carregarFluxo>>, { erro: string }>
