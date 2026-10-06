import { createAdminClient } from '@/lib/supabase/admin'
import { arred } from './fluxo'
import { assinaturaVenda, planoAutomatico } from './plano-venda'
import {
  STATUS_FECHADOS, SELECT_PROJETO_VENDA, dataFechamento, mapaPrimeiroFechamento, mapaVendaDireta, vendaDoProjeto, vendaManual,
} from './vendas-sistema'

/**
 * Vendas do sistema → fluxo de caixa SOZINHAS (Kalebe 2026-09-30).
 *
 * Toda venda fechada a partir do início do fluxo (fluxo_config.data_inicio)
 * vira recebimentos + custos PREVISTOS (lib/financeiro/plano-venda.ts), sem
 * ninguém clicar. Mantém em dia:
 *   - venda nova → lança
 *   - valor da venda mudou → refaz (se nada foi efetivado ainda)
 *   - projeto saiu de "fechado" (cancelado, excluído) → remove (idem)
 * Programação feita à mão nunca é tocada. Vendas de antes do início ficam
 * em "vendas a programar" (decisão manual — muitas já foram recebidas).
 *
 * Roda com service role: é chamada ao abrir o financeiro e ao fechar venda
 * (quem fecha pode ser o consultor, que não enxerga o fluxo).
 */
export async function sincronizarVendasNoFluxo(): Promise<{ criadas: number; refeitas: number; removidas: number } | { erro: string }> {
  const admin = createAdminClient()
  const { data: cfg, error: eCfg } = await admin.from('fluxo_config').select('*').maybeSingle()
  if (eCfg || !cfg) return { erro: eCfg?.message || 'Fluxo de caixa não configurado' }
  const inicio = String(cfg.data_inicio || '').slice(0, 10)
  const opcoes = {
    regime_imposto: (cfg.regime_imposto === 'caixa' ? 'caixa' : 'competencia') as 'caixa' | 'competencia',
    kit_passa_caixa_padrao: !!(cfg as any).kit_passa_caixa_padrao,
  }

  const [{ data: projetos }, manuaisRes, { data: progs }, { data: perfis }, { data: historico }] = await Promise.all([
    admin.from('projetos').select(SELECT_PROJETO_VENDA).in('status', STATUS_FECHADOS).is('excluida_em', null).limit(10000),
    admin.from('vendas_manuais').select('*').is('deletada_em', null).limit(10000),
    admin.from('fluxo_programacoes').select('id, origem, origem_id, situacao, valor_venda, condicao'),
    admin.from('profiles').select('id, nome_completo'),
    admin.from('projeto_status_historico').select('projeto_id, created_at').in('status_novo', STATUS_FECHADOS).limit(20000),
  ])
  const { data: itensVd } = await admin.from('projeto_itens').select('projeto_id, dados')
    .eq('tipo', 'venda_equipamentos').neq('status', 'removido').limit(10000)
  const nomes = new Map((perfis || []).map((p: any) => [p.id, p.nome_completo as string]))
  const porOrigem = new Map((progs || []).map((p: any) => [`${p.origem}:${p.origem_id}`, p]))
  const primeiro = mapaPrimeiroFechamento((historico || []) as any[])
  const vendaDireta = mapaVendaDireta((itensVd || []) as any[])

  const vendas = [
    ...((projetos || []) as any[]).filter((p) => dataFechamento(p, primeiro) >= inicio)
      .map((p) => vendaDoProjeto(p, nomes, primeiro, vendaDireta.get(p.id))),
    ...((((manuaisRes as any)?.error ? [] : (manuaisRes as any)?.data) || []) as any[])
      .map((v) => vendaManual(v, nomes)).filter((v) => v.data_venda >= inicio),
  ].filter((v) => v.valor_venda > 0)
  const vivas = new Set(vendas.map((v) => `${v.origem}:${v.origem_id}`))

  const temEfetivado = async (programacaoId: string) => {
    const { count } = await admin.from('fluxo_lancamentos').select('id', { count: 'exact', head: true })
      .eq('programacao_id', programacaoId).not('data_realizada', 'is', null)
    return (count || 0) > 0
  }

  let criadas = 0, refeitas = 0, removidas = 0

  for (const venda of vendas) {
    const chave = `${venda.origem}:${venda.origem_id}`
    const prog: any = porOrigem.get(chave)
    if (prog) {
      // Só mexe no que o sistema lançou sozinho; programação manual é do admin
      if (!prog.condicao?.automatica || prog.situacao !== 'programado') continue
      // Kalebe 2026-10-06: refaz quando a venda mudou (valor, datas, condição,
      // custos). Programação antiga sem assinatura: só pelo valor, como antes.
      const mudou = prog.condicao?.assinatura
        ? prog.condicao.assinatura !== assinaturaVenda(venda)
        : Math.abs(Number(prog.valor_venda || 0) - venda.valor_venda) > 1
      if (!mudou) continue
      if (await temEfetivado(prog.id)) continue
      await admin.from('fluxo_programacoes').delete().eq('id', prog.id)   // cascata leva os previstos
      refeitas += 1
    }

    const plano = planoAutomatico(venda, opcoes)
    const { data: nova, error } = await admin.from('fluxo_programacoes').insert({
      origem: venda.origem, origem_id: venda.origem_id, situacao: 'programado',
      kit_passa_caixa: venda.custos.kit > 0 ? plano.kitPassa : null,
      valor_venda: arred(venda.valor_venda), condicao: plano.condicao,
    }).select('id').single()
    if (error || !nova) continue   // 23505 = outra rodada já lançou
    const linhas = plano.linhas.filter((l) => l.valor > 0).map((l) => ({
      direcao: l.direcao, grupo: l.grupo, descricao: l.descricao,
      valor_previsto: arred(l.valor), data_prevista: l.data,
      forma_pagamento: l.forma_pagamento || null,
      parcela_num: l.parcela_num ?? null, parcelas_total: l.parcelas_total ?? null,
      projeto_id: venda.projeto_id, programacao_id: nova.id, lote_id: nova.id,
      origem: venda.origem,
      detalhes: { ...(l.detalhes || {}), automatico: true, ...(plano.condicao.revisar && l.direcao === 'entrada' ? { revisar_condicao: true } : {}) },
    }))
    const { error: e2 } = await admin.from('fluxo_lancamentos').insert(linhas)
    if (e2) { await admin.from('fluxo_programacoes').delete().eq('id', nova.id); continue }
    if (!prog) criadas += 1
  }

  // Venda automática que deixou de existir (cancelada, excluída, voltou de status)
  for (const prog of (progs || []) as any[]) {
    if (!prog.condicao?.automatica || vivas.has(`${prog.origem}:${prog.origem_id}`)) continue
    if (await temEfetivado(prog.id)) continue
    await admin.from('fluxo_programacoes').delete().eq('id', prog.id)
    removidas += 1
  }

  return { criadas, refeitas, removidas }
}
