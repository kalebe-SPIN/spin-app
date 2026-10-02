'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import {
  addMeses, arred, dividirEmParcelas, GRUPOS,
  type Direcao, type Grupo,
} from '@/lib/financeiro/fluxo'
import type { LinhaPlano } from '@/lib/financeiro/plano-venda'
import { carregarProjetosEServicos, type OpcaoProjeto, type OpcaoServico } from '@/lib/financeiro/opcoes-lancamento'
import type { VendaPendente } from '@/lib/financeiro/fluxo'
import {
  STATUS_FECHADOS, SELECT_PROJETO_VENDA, mapaPrimeiroFechamento, vendaDoProjeto, vendaManual,
} from '@/lib/financeiro/vendas-sistema'

/**
 * Fluxo de caixa (Kalebe 2026-09-29). Tudo PREVISTO nasce aqui; o valor
 * efetivamente pago/recebido entra no "Efetivar". Só admin.
 */

type R<T = {}> = ({ sucesso: true } & T) | { erro: string }

async function admin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ok: false as const }
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, ok: p?.role === 'admin' }
}

const erroTabela = (m: string) =>
  /fluxo_(lancamentos|passivos|programacoes|config)/.test(m) ? 'Falta rodar a migration 127 no Supabase.' : m

function revalidar() {
  revalidatePath('/financeiro/fluxo-caixa')
  revalidatePath('/financeiro')
}

/**
 * Admin mexeu à mão num lançamento de venda automática → a venda vira
 * "manual" e a sincronização não refaz mais (senão desfaria a correção).
 */
async function congelarProgramacao(supabase: ReturnType<typeof createClient>, programacaoId: string | null | undefined) {
  if (!programacaoId) return
  const { data: prog } = await supabase.from('fluxo_programacoes').select('condicao').eq('id', programacaoId).maybeSingle()
  const cond: any = prog?.condicao || {}
  if (!cond.automatica) return
  await supabase.from('fluxo_programacoes')
    .update({ condicao: { ...cond, automatica: false, ajustada_manualmente_em: new Date().toISOString() } })
    .eq('id', programacaoId)
}

// ─── Lançamento manual (cadastro dinâmico) ──────────────────────────────────

export type EntradaLancamento = {
  id?: string
  direcao: Direcao
  grupo: Grupo
  categoria_id?: string | null
  descricao: string
  valor_previsto: number
  data_prevista: string
  forma_pagamento?: string | null
  fornecedor_id?: string | null
  projeto_id?: string | null
  detalhes?: Record<string, any>
  observacoes?: string | null
  repeticao?: 'unica' | 'parcelado' | 'recorrente'
  vezes?: number
  /** Já pago/recebido (só lançamento único) */
  realizado?: { valor: number; data: string } | null
  /** Edição: aplica valor/dados também aos próximos EM ABERTO da mesma série */
  aplicar_serie?: boolean
}

export async function salvarLancamentoAction(e: EntradaLancamento): Promise<R<{ criados: number }>> {
  const { supabase, user, ok } = await admin()
  if (!ok || !user) return { erro: 'Só o admin mexe no fluxo de caixa' }
  if (!e.descricao?.trim()) return { erro: 'Descreva o lançamento' }
  if (!(e.valor_previsto > 0)) return { erro: 'Valor previsto tem que ser maior que zero' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data_prevista || '')) return { erro: 'Data prevista inválida' }
  if (!GRUPOS[e.grupo]) return { erro: 'Tipo de lançamento inválido' }

  const base = {
    direcao: e.direcao,
    grupo: e.grupo,
    categoria_id: e.categoria_id || null,
    descricao: e.descricao.trim(),
    forma_pagamento: e.forma_pagamento || null,
    fornecedor_id: e.fornecedor_id || null,
    projeto_id: e.projeto_id || null,
    detalhes: e.detalhes || {},
    observacoes: e.observacoes?.trim() || null,
  }

  // Edição: este lançamento (e, se pedido, os próximos em aberto da série)
  if (e.id) {
    const { data: antes } = await supabase.from('fluxo_lancamentos')
      .select('lote_id, data_prevista, descricao, programacao_id').eq('id', e.id).maybeSingle()
    await congelarProgramacao(supabase, antes?.programacao_id)
    const agora = new Date().toISOString()
    const { error } = await supabase.from('fluxo_lancamentos').update({
      ...base,
      valor_previsto: arred(e.valor_previsto),
      data_prevista: e.data_prevista,
      atualizado_em: agora,
    }).eq('id', e.id)
    if (error) return { erro: erroTabela(error.message) }

    let alterados = 0
    if (e.aplicar_serie && antes?.lote_id) {
      const { descricao: _d, ...semDescricao } = base
      const { data: serie } = await supabase.from('fluxo_lancamentos')
        .update({ ...semDescricao, valor_previsto: arred(e.valor_previsto), atualizado_em: agora })
        .eq('lote_id', antes.lote_id).neq('id', e.id)
        .gt('data_prevista', antes.data_prevista)
        .is('data_realizada', null).is('cancelado_em', null)
        .select('id')
      alterados = serie?.length || 0
      // Recorrência (mesma descrição em todas) acompanha a descrição nova
      if (antes.descricao && antes.descricao !== base.descricao) {
        await supabase.from('fluxo_lancamentos').update({ descricao: base.descricao })
          .eq('lote_id', antes.lote_id).eq('descricao', antes.descricao)
          .gt('data_prevista', antes.data_prevista).is('data_realizada', null).is('cancelado_em', null)
      }
    }
    revalidar()
    return { sucesso: true, criados: alterados }
  }

  const vezes = Math.max(1, Math.min(120, Math.floor(e.vezes || 1)))
  const rep = e.repeticao || 'unica'
  const lote = rep === 'unica' ? null : randomUUID()
  const valores = rep === 'parcelado' ? dividirEmParcelas(e.valor_previsto, vezes)
    : rep === 'recorrente' ? Array(vezes).fill(arred(e.valor_previsto))
    : [arred(e.valor_previsto)]

  const linhas = valores.map((v, i) => ({
    ...base,
    descricao: valores.length > 1 && rep === 'parcelado' ? `${base.descricao} (${i + 1}/${valores.length})` : base.descricao,
    valor_previsto: v,
    data_prevista: addMeses(e.data_prevista, i),
    parcela_num: valores.length > 1 ? i + 1 : null,
    parcelas_total: valores.length > 1 ? valores.length : null,
    lote_id: lote,
    origem: 'manual',
    criado_por: user.id,
    ...(rep === 'unica' && e.realizado && e.realizado.valor >= 0 && e.realizado.data
      ? { valor_realizado: arred(e.realizado.valor), data_realizada: e.realizado.data }
      : {}),
  }))

  const { error } = await supabase.from('fluxo_lancamentos').insert(linhas)
  if (error) return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true, criados: linhas.length }
}

/**
 * Kalebe 2026-10-01: atalho "Registrar saída" no menu Financeiro (qualquer
 * tela) — carrega só o que o formulário de lançamento precisa.
 */
export async function dadosLancamentoRapidoAction(): Promise<R<{
  fornecedores: any[]; categorias: any[]
  projetos: OpcaoProjeto[]; servicos: OpcaoServico[]; equipe: Array<{ id: string; nome: string }>
}>> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const [{ data: fornecedores }, { data: categorias, error }, { projetos, servicos }, { data: perfis }] = await Promise.all([
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia, cnpj, categoria, contato_telefone, ativo').order('razao_social'),
    supabase.from('categorias_financeiras').select('id, nome, tipo').eq('ativo', true).order('nome'),
    // Kalebe 2026-10-02: custo/despesa ligado a qualquer projeto ativo + serviço do projeto
    carregarProjetosEServicos(supabase),
    supabase.from('profiles').select('id, nome_completo').eq('ativo', true).neq('role', 'candidato'),
  ])
  if (error) return { erro: erroTabela(error.message) }
  const aZ = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR')
  return {
    sucesso: true,
    fornecedores: fornecedores || [],
    categorias: categorias || [],
    projetos,
    servicos,
    equipe: ((perfis || []) as any[]).map((p) => ({ id: p.id, nome: p.nome_completo || 'Sem nome' })).sort(aZ),
  }
}

/**
 * Kalebe 2026-10-02: abre o comprovante (foto/PDF) de um lançamento — bucket
 * privado 'comprovantes', link assinado de 5 minutos, só admin.
 */
export async function urlComprovanteAction(caminho: string): Promise<R<{ url: string }>> {
  const { ok } = await admin()
  if (!ok) return { erro: 'Só o admin vê comprovantes' }
  if (!/^[\w-]+(\/[\w.-]+)+$/.test(caminho || '')) return { erro: 'Comprovante inválido' }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient().storage.from('comprovantes').createSignedUrl(caminho, 300)
  if (error || !data?.signedUrl) return { erro: error?.message || 'Comprovante não encontrado' }
  return { sucesso: true, url: data.signedUrl }
}

/** Efetivar = registrar o valor EFETIVAMENTE pago/recebido e a data. */
export async function efetivarLancamentoAction(id: string, valor: number, data: string, forma?: string | null): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  if (!(valor >= 0)) return { erro: 'Valor inválido' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return { erro: 'Data inválida' }
  const { error } = await supabase.from('fluxo_lancamentos').update({
    valor_realizado: arred(valor),
    data_realizada: data,
    ...(forma ? { forma_pagamento: forma } : {}),
    atualizado_em: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true }
}

export async function desfazerEfetivacaoAction(id: string): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const { error } = await supabase.from('fluxo_lancamentos')
    .update({ valor_realizado: null, data_realizada: null, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true }
}

/** Cancela (some do fluxo, fica no banco). `restantesDoLote`: também as parcelas seguintes em aberto. */
export async function cancelarLancamentoAction(id: string, restantesDoLote = false): Promise<R<{ cancelados: number }>> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const agora = new Date().toISOString()
  const { data: l } = await supabase.from('fluxo_lancamentos').select('id, lote_id, data_prevista, programacao_id').eq('id', id).maybeSingle()
  if (!l) return { erro: 'Lançamento não encontrado' }
  await congelarProgramacao(supabase, l.programacao_id)
  let q = supabase.from('fluxo_lancamentos').update({ cancelado_em: agora })
  q = restantesDoLote && l.lote_id
    ? q.eq('lote_id', l.lote_id).gte('data_prevista', l.data_prevista).is('data_realizada', null)
    : q.eq('id', id)
  const { data, error } = await q.select('id')
  if (error) return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true, cancelados: data?.length || 0 }
}

// ─── Passivo bancário ───────────────────────────────────────────────────────

export type EntradaPassivo = {
  banco: string
  modalidade: string
  numero_contrato?: string | null
  valor_contratado: number
  data_contratacao: string
  taxa_juros_mes?: number | null
  parcelas_total: number
  valor_parcela?: number | null      // vazio = valor ÷ parcelas
  primeiro_vencimento: string
  lancar_captacao: boolean           // entrada do dinheiro captado no caixa
  observacoes?: string | null
  /** Dívidas (Kalebe 2026-09-30): valor de face e valor negociado a pagar */
  valor_face?: number | null
  valor_negociado?: number | null
}

export async function salvarPassivoAction(e: EntradaPassivo): Promise<R<{ id: string }>> {
  const { supabase, user, ok } = await admin()
  if (!ok || !user) return { erro: 'Só o admin mexe no fluxo de caixa' }
  if (!e.banco?.trim()) return { erro: 'Informe o banco / instituição' }
  if (!(e.valor_contratado > 0)) return { erro: 'Valor contratado tem que ser maior que zero' }
  const n = Math.max(1, Math.min(420, Math.floor(e.parcelas_total || 1)))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.primeiro_vencimento || '')) return { erro: 'Informe o 1º vencimento' }

  const negociado = e.valor_negociado && e.valor_negociado > 0 ? arred(e.valor_negociado) : null
  const face = e.valor_face && e.valor_face > 0 ? arred(e.valor_face) : null
  const { data: p, error } = await supabase.from('fluxo_passivos').insert({
    banco: e.banco.trim(),
    modalidade: e.modalidade,
    numero_contrato: e.numero_contrato?.trim() || null,
    valor_contratado: arred(e.valor_contratado),
    data_contratacao: e.data_contratacao,
    taxa_juros_mes: e.taxa_juros_mes ?? null,
    parcelas_total: n,
    valor_parcela: e.valor_parcela ? arred(e.valor_parcela) : null,
    primeiro_vencimento: e.primeiro_vencimento,
    observacoes: e.observacoes?.trim() || null,
    criado_por: user.id,
    // Só manda as colunas novas quando preenchidas (não quebra antes da migration 130)
    ...(face ? { valor_face: face } : {}),
    ...(negociado ? { valor_negociado: negociado } : {}),
  }).select('id').single()
  if (error || !p) return { erro: erroTabela(error?.message || 'Falha ao salvar contrato') }

  // Parcela do contrato > valor negociado ÷ n > valor contratado ÷ n
  const parcelas = e.valor_parcela && e.valor_parcela > 0
    ? Array(n).fill(arred(e.valor_parcela))
    : dividirEmParcelas(negociado ?? e.valor_contratado, n)
  const nome = `${e.banco.trim()}${e.numero_contrato ? ` · ${e.numero_contrato.trim()}` : ''}`
  const linhas: any[] = parcelas.map((v, i) => ({
    direcao: 'saida', grupo: 'passivo_bancario', origem: 'passivo', passivo_id: p.id,
    descricao: `Parcela ${i + 1}/${n} — ${nome}`,
    valor_previsto: v, data_prevista: addMeses(e.primeiro_vencimento, i),
    parcela_num: i + 1, parcelas_total: n, lote_id: p.id,
    detalhes: { modalidade: e.modalidade }, criado_por: user.id,
  }))
  if (e.lancar_captacao) {
    linhas.unshift({
      direcao: 'entrada', grupo: 'passivo_bancario', origem: 'passivo', passivo_id: p.id,
      descricao: `Captação — ${nome}`,
      valor_previsto: arred(e.valor_contratado), data_prevista: e.data_contratacao,
      lote_id: p.id, detalhes: { modalidade: e.modalidade, captacao: true }, criado_por: user.id,
    })
  }
  const { error: e2 } = await supabase.from('fluxo_lancamentos').insert(linhas)
  if (e2) {
    await supabase.from('fluxo_passivos').delete().eq('id', p.id)
    return { erro: erroTabela(e2.message) }
  }
  revalidar()
  return { sucesso: true, id: p.id }
}

/**
 * Renegociação (Kalebe 2026-09-30): as parcelas EM ABERTO saem (canceladas,
 * ficam no histórico) e entram as novas pelo valor negociado. Desconto =
 * saldo em aberto − valor negociado. Parcelas já pagas não mudam.
 */
export async function renegociarPassivoAction(e: {
  passivo_id: string
  valor_negociado: number
  parcelas_total: number
  valor_parcela?: number | null
  primeiro_vencimento: string
  motivo?: string | null
}): Promise<R<{ desconto: number }>> {
  const { supabase, user, ok } = await admin()
  if (!ok || !user) return { erro: 'Só o admin mexe no fluxo de caixa' }
  if (!(e.valor_negociado > 0)) return { erro: 'Informe o valor negociado' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.primeiro_vencimento || '')) return { erro: 'Informe o 1º vencimento' }
  const n = Math.max(1, Math.min(420, Math.floor(e.parcelas_total || 1)))

  const { data: p } = await supabase.from('fluxo_passivos').select('*').eq('id', e.passivo_id).maybeSingle()
  if (!p) return { erro: 'Contrato não encontrado' }
  if (!('renegociacoes' in p)) return { erro: 'Falta rodar a migration 130 no Supabase.' }
  const { data: abertas } = await supabase.from('fluxo_lancamentos')
    .select('id, valor_previsto').eq('passivo_id', e.passivo_id).eq('direcao', 'saida')
    .is('data_realizada', null).is('cancelado_em', null)
  const saldoAnterior = arred((abertas || []).reduce((s: number, l: any) => s + Number(l.valor_previsto || 0), 0))
  const agora = new Date().toISOString()

  if ((abertas || []).length) {
    const { error: eCanc } = await supabase.from('fluxo_lancamentos')
      .update({ cancelado_em: agora, observacoes: 'Substituída na renegociação' })
      .in('id', (abertas || []).map((l: any) => l.id))
    if (eCanc) return { erro: erroTabela(eCanc.message) }
  }

  const negociado = arred(e.valor_negociado)
  const valores = e.valor_parcela && e.valor_parcela > 0 ? Array(n).fill(arred(e.valor_parcela)) : dividirEmParcelas(negociado, n)
  const lote = randomUUID()
  const nome = `${p.banco}${p.numero_contrato ? ` · ${p.numero_contrato}` : ''}`
  const { error: eIns } = await supabase.from('fluxo_lancamentos').insert(valores.map((v, i) => ({
    direcao: 'saida', grupo: 'passivo_bancario', origem: 'passivo', passivo_id: p.id,
    descricao: `Parcela ${i + 1}/${n} (renegociada) — ${nome}`,
    valor_previsto: v, data_prevista: addMeses(e.primeiro_vencimento, i),
    parcela_num: i + 1, parcelas_total: n, lote_id: lote,
    detalhes: { modalidade: p.modalidade, renegociacao: agora }, criado_por: user.id,
  })))
  if (eIns) return { erro: erroTabela(eIns.message) }

  const historico = Array.isArray(p.renegociacoes) ? p.renegociacoes : []
  await supabase.from('fluxo_passivos').update({
    valor_negociado: negociado,
    valor_face: p.valor_face ?? saldoAnterior,
    renegociacoes: [...historico, {
      data: agora.slice(0, 10), saldo_anterior: saldoAnterior, valor_negociado: negociado,
      parcelas: n, primeiro_vencimento: e.primeiro_vencimento, motivo: e.motivo?.trim() || null,
    }],
  }).eq('id', p.id)

  revalidar()
  return { sucesso: true, desconto: arred(saldoAnterior - negociado) }
}

export async function excluirPassivoAction(id: string): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const { count } = await supabase.from('fluxo_lancamentos').select('id', { count: 'exact', head: true })
    .eq('passivo_id', id).not('data_realizada', 'is', null)
  if ((count || 0) > 0) return { erro: `Contrato tem ${count} parcela(s) já efetivada(s). Cancele só as parcelas em aberto na aba Lançamentos.` }
  const { error } = await supabase.from('fluxo_passivos').delete().eq('id', id)
  if (error) return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true }
}

// ─── Venda do sistema → recebimentos + custos PREVISTOS ─────────────────────

export type LinhaProgramada = LinhaPlano

export async function programarVendaAction(e: {
  origem: 'projeto' | 'venda_manual'
  origem_id: string
  projeto_id: string | null
  kit_passa_caixa: boolean | null
  valor_venda: number
  condicao: Record<string, any>
  linhas: LinhaProgramada[]
  /** Ajuste de venda já lançada (ex.: automática): troca a programação antiga por esta */
  substituir_programacao_id?: string | null
}): Promise<R<{ criados: number }>> {
  const { supabase, user, ok } = await admin()
  if (!ok || !user) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const linhas = e.linhas.filter((l) => l.valor > 0)
  if (!linhas.some((l) => l.direcao === 'entrada')) return { erro: 'Programe pelo menos um recebimento' }
  if (linhas.some((l) => !/^\d{4}-\d{2}-\d{2}$/.test(l.data))) return { erro: 'Tem linha sem data válida' }

  if (e.substituir_programacao_id) {
    const { count } = await supabase.from('fluxo_lancamentos').select('id', { count: 'exact', head: true })
      .eq('programacao_id', e.substituir_programacao_id).not('data_realizada', 'is', null)
    if ((count || 0) > 0) return { erro: `Essa venda já tem ${count} lançamento(s) efetivado(s) — ajuste linha a linha na lista.` }
    const { error: eDel } = await supabase.from('fluxo_programacoes').delete().eq('id', e.substituir_programacao_id)
    if (eDel) return { erro: erroTabela(eDel.message) }
  }

  const { data: prog, error } = await supabase.from('fluxo_programacoes').insert({
    origem: e.origem, origem_id: e.origem_id, situacao: 'programado',
    kit_passa_caixa: e.kit_passa_caixa, valor_venda: arred(e.valor_venda),
    condicao: e.condicao || {}, criado_por: user.id,
  }).select('id').single()
  if (error || !prog) {
    if (error?.code === '23505') return { erro: 'Essa venda já foi programada' }
    return { erro: erroTabela(error?.message || 'Falha ao programar') }
  }

  const { error: e2 } = await supabase.from('fluxo_lancamentos').insert(linhas.map((l) => ({
    direcao: l.direcao, grupo: l.grupo, descricao: l.descricao.trim() || GRUPOS[l.grupo].rotulo,
    valor_previsto: arred(l.valor), data_prevista: l.data,
    forma_pagamento: l.forma_pagamento || null,
    parcela_num: l.parcela_num ?? null, parcelas_total: l.parcelas_total ?? null,
    projeto_id: e.projeto_id, programacao_id: prog.id, lote_id: prog.id,
    origem: e.origem, detalhes: l.detalhes || {}, criado_por: user.id,
  })))
  if (e2) {
    await supabase.from('fluxo_programacoes').delete().eq('id', prog.id)
    return { erro: erroTabela(e2.message) }
  }
  revalidar()
  return { sucesso: true, criados: linhas.length }
}

/** Dados da venda de uma programação (pra reabrir o "Programar" e ajustar a condição). */
export async function vendaDaProgramacaoAction(programacaoId: string): Promise<R<{ venda: VendaPendente; automatica: boolean }>> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const { data: prog } = await supabase.from('fluxo_programacoes')
    .select('origem, origem_id, condicao').eq('id', programacaoId).maybeSingle()
  if (!prog) return { erro: 'Programação não encontrada' }
  const { data: perfis } = await supabase.from('profiles').select('id, nome_completo')
  const nomes = new Map((perfis || []).map((p: any) => [p.id, p.nome_completo as string]))

  if (prog.origem === 'projeto') {
    const [{ data: p }, { data: hist }, { data: itemVd }] = await Promise.all([
      supabase.from('projetos').select(SELECT_PROJETO_VENDA).eq('id', prog.origem_id).maybeSingle(),
      supabase.from('projeto_status_historico').select('projeto_id, created_at').eq('projeto_id', prog.origem_id).in('status_novo', STATUS_FECHADOS),
      supabase.from('projeto_itens').select('dados').eq('projeto_id', prog.origem_id).eq('tipo', 'venda_equipamentos').neq('status', 'removido').maybeSingle(),
    ])
    if (!p) return { erro: 'Projeto da venda não encontrado' }
    return {
      sucesso: true,
      venda: vendaDoProjeto(p, nomes, mapaPrimeiroFechamento((hist || []) as any[]), (itemVd as any)?.dados?.calculo),
      automatica: !!(prog.condicao as any)?.automatica,
    }
  }
  const { data: v } = await supabase.from('vendas_manuais')
    .select('id, cliente_nome, valor_venda, custo_estimado, data_venda, vendedor_id, observacao').eq('id', prog.origem_id).maybeSingle()
  if (!v) return { erro: 'Venda manual não encontrada' }
  return { sucesso: true, venda: vendaManual(v, nomes), automatica: !!(prog.condicao as any)?.automatica }
}

/** Venda antiga já liquidada fora do sistema: sai da lista "A programar". */
export async function ignorarVendaAction(origem: 'projeto' | 'venda_manual', origem_id: string, valor_venda: number): Promise<R> {
  const { supabase, user, ok } = await admin()
  if (!ok || !user) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const { error } = await supabase.from('fluxo_programacoes').insert({
    origem, origem_id, situacao: 'ignorado', valor_venda: arred(valor_venda), criado_por: user.id,
  })
  if (error && error.code !== '23505') return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true }
}

/** Refaz a programação: apaga previstos da venda (só se nada foi efetivado) e ela volta pra "A programar". */
export async function desfazerProgramacaoAction(programacaoId: string): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  const { count } = await supabase.from('fluxo_lancamentos').select('id', { count: 'exact', head: true })
    .eq('programacao_id', programacaoId).not('data_realizada', 'is', null)
  if ((count || 0) > 0) return { erro: `Já tem ${count} lançamento(s) efetivado(s) nessa venda. Ajuste linha a linha na aba Lançamentos.` }
  const { error } = await supabase.from('fluxo_programacoes').delete().eq('id', programacaoId)
  if (error) return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true }
}

// ─── Cadastros de apoio ─────────────────────────────────────────────────────

export async function salvarFornecedorAction(f: {
  id?: string; razao_social: string; nome_fantasia?: string | null; cnpj?: string | null
  categoria?: string | null; contato_telefone?: string | null; ativo?: boolean
}): Promise<R<{ id: string }>> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin cadastra fornecedor' }
  if (!f.razao_social?.trim()) return { erro: 'Informe a razão social / nome do fornecedor' }
  const dados = {
    razao_social: f.razao_social.trim(),
    nome_fantasia: f.nome_fantasia?.trim() || null,
    cnpj: f.cnpj?.replace(/\D/g, '') || null,
    categoria: f.categoria?.trim() || null,
    contato_telefone: f.contato_telefone?.replace(/\D/g, '') || null,
    ativo: f.ativo !== false,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = f.id
    ? await supabase.from('fornecedores').update(dados).eq('id', f.id).select('id').single()
    : await supabase.from('fornecedores').insert(dados).select('id').single()
  if (error || !data) return { erro: error?.message || 'Falha ao salvar fornecedor' }
  revalidar()
  return { sucesso: true, id: data.id }
}

export async function criarCategoriaAction(nome: string, tipo: 'receita' | 'despesa'): Promise<R<{ id: string }>> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin cria categoria' }
  const n = nome.trim()
  if (n.length < 2) return { erro: 'Nome da categoria muito curto' }
  const { data: existe } = await supabase.from('categorias_financeiras').select('id').ilike('nome', n).eq('tipo', tipo).maybeSingle()
  if (existe) return { sucesso: true, id: existe.id }
  const { data, error } = await supabase.from('categorias_financeiras').insert({ nome: n, tipo }).select('id').single()
  if (error || !data) return { erro: error?.message || 'Falha ao criar categoria' }
  revalidar()
  return { sucesso: true, id: data.id }
}

export async function salvarConfigFluxoAction(c: {
  saldo_inicial: number; data_inicio: string; reserva_minima: number; regime_imposto: 'competencia' | 'caixa'
  kit_passa_caixa_padrao?: boolean
}): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe no fluxo de caixa' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data_inicio || '')) return { erro: 'Data de início inválida' }
  const { error } = await supabase.from('fluxo_config').upsert({
    singleton: true,
    saldo_inicial: arred(c.saldo_inicial || 0),
    data_inicio: c.data_inicio,
    reserva_minima: arred(Math.max(0, c.reserva_minima || 0)),
    regime_imposto: c.regime_imposto === 'caixa' ? 'caixa' : 'competencia',
    ...(c.kit_passa_caixa_padrao !== undefined ? { kit_passa_caixa_padrao: !!c.kit_passa_caixa_padrao } : {}),
    atualizado_em: new Date().toISOString(),
  })
  if (error) return { erro: erroTabela(error.message) }
  revalidar()
  return { sucesso: true }
}
