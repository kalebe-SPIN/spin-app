import { createClient } from '@/lib/supabase/server'
import {
  addMeses, hojeBR, mesDe,
  type Categoria, type ConfigFluxo, type Fornecedor, type Lancamento, type Passivo, type VendaPendente,
} from '@/lib/financeiro/fluxo'
import {
  STATUS_FECHADOS, SELECT_PROJETO_VENDA, dataFechamento, mapaPrimeiroFechamento, mapaVendaDireta, valorVendaProjeto, vendaDoProjeto, vendaManual,
} from '@/lib/financeiro/vendas-sistema'

/**
 * Carrega tudo que a tela de fluxo de caixa precisa (Kalebe 2026-09-29).
 * Integração com o dia a dia: vendas fechadas a partir do início do fluxo
 * entram sozinhas (lib/financeiro/sync-vendas.ts); as de antes do início
 * ficam em "vendas a programar" pra decisão manual.
 */

export { STATUS_FECHADOS }

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)

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
    supabase.from('fluxo_config').select('*').maybeSingle(),
    supabase.from('fluxo_lancamentos').select('*').is('cancelado_em', null).order('data_prevista').limit(20000),
    supabase.from('fluxo_passivos').select('*').order('data_contratacao', { ascending: false }),
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia, cnpj, categoria, contato_telefone, ativo').order('razao_social'),
    supabase.from('categorias_financeiras').select('id, nome, tipo').eq('ativo', true).order('nome'),
    supabase.from('fluxo_programacoes').select('origem, origem_id, situacao'),
    supabase
      .from('projetos')
      .select(SELECT_PROJETO_VENDA)
      .in('status', STATUS_FECHADOS)
      .is('excluida_em', null)
      .limit(10000),
    // Migration 107 pode não estar aplicada — sem a tabela, só ignora
    supabase.from('vendas_manuais').select('id, cliente_nome, valor_venda, custo_estimado, data_venda, vendedor_id, observacao').is('deletada_em', null).limit(10000),
    supabase.from('profiles').select('id, nome_completo'),
  ])
  // Data real da venda = 1ª entrada em etapa de fechado (não muda com as etapas seguintes)
  const [{ data: historico }, { data: itensVd }] = await Promise.all([
    supabase.from('projeto_status_historico').select('projeto_id, created_at').in('status_novo', STATUS_FECHADOS).limit(20000),
    supabase.from('projeto_itens').select('projeto_id, dados').eq('tipo', 'venda_equipamentos').neq('status', 'removido').limit(10000),
  ])
  const primeiro = mapaPrimeiroFechamento((historico || []) as any[])
  const vendaDireta = mapaVendaDireta((itensVd || []) as any[])

  if (eCfg) return { erro: eCfg.message.includes('fluxo_config') ? 'Falta rodar a migration 127 no Supabase.' : eCfg.message } as const

  const config: ConfigFluxo = {
    saldo_inicial: num(cfg?.saldo_inicial),
    data_inicio: cfg?.data_inicio || hoje.slice(0, 8) + '01',
    reserva_minima: num(cfg?.reserva_minima),
    regime_imposto: cfg?.regime_imposto === 'caixa' ? 'caixa' : 'competencia',
    kit_passa_caixa_padrao: !!(cfg as any)?.kit_passa_caixa_padrao,
  }
  const nomes = new Map((perfis || []).map((p: any) => [p.id, p.nome_completo as string]))
  const jaTratadas = new Set((programacoes || []).map((p: any) => `${p.origem}:${p.origem_id}`))

  // ─── Vendas do sistema: faturamento (competência) + pendentes de programação
  // (as fechadas a partir do início do fluxo já entraram sozinhas pelo sync)
  const faturamentoPorMes: Record<string, number> = {}
  const pendentes: VendaPendente[] = []

  for (const p of (projetos || []) as any[]) {
    const data = dataFechamento(p, primeiro)
    const valor = valorVendaProjeto(p)
    if (data) faturamentoPorMes[mesDe(data)] = (faturamentoPorMes[mesDe(data)] || 0) + valor
    if (!data || data < desde || jaTratadas.has(`projeto:${p.id}`) || valor <= 0) continue
    pendentes.push(vendaDoProjeto(p, nomes, primeiro, vendaDireta.get(p.id)))
  }

  const vendasManuais = (vendasManuaisRes as any)?.error ? [] : ((vendasManuaisRes as any)?.data || [])
  for (const v of vendasManuais) {
    const venda = vendaManual(v, nomes)
    if (venda.data_venda) faturamentoPorMes[mesDe(venda.data_venda)] = (faturamentoPorMes[mesDe(venda.data_venda)] || 0) + venda.valor_venda
    if (!venda.data_venda || venda.data_venda < desde || jaTratadas.has(`venda_manual:${v.id}`) || venda.valor_venda <= 0) continue
    pendentes.push(venda)
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
