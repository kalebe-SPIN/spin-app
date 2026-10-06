import { createClient } from '@/lib/supabase/server'
import { mapaPrimeiroFechamento } from '@/lib/financeiro/vendas-sistema'
import { getTituloTipo } from '@/lib/execucoes'
import {
  STATUS_FECHADOS, STATUS_PERDIDOS, STATUS_PROPOSTA, STATUS_PROPOSTA_EMITIDA,
  chaveCliente, dataDaVenda, diaBRT, fechadoNoMes, hojeBRT, janelaMes, valorDaVenda,
} from './regras'

/**
 * Listas do Dashboard (Kalebe 2026-10-06): cada número do painel abre a lista
 * do que ele conta — mesma regra (lib/dashboard/regras.ts). RLS do usuário:
 * cada um vê o que já via no número.
 */

export type LinhaLista = {
  id: string
  href: string
  cliente: string
  codigo?: string | null
  status?: string | null
  pessoa?: string | null
  data?: string | null
  valor?: number | null
  extra?: string | null
}

export type ResultadoLista = {
  titulo: string
  regra: string
  rotuloData: string
  porMes: boolean
  somaValor: boolean
  soAdmin?: boolean
  linhas: LinhaLista[]
}

type Def = {
  titulo: string
  regra: string
  rotuloData: string
  porMes?: boolean
  somaValor?: boolean
  soAdmin?: boolean
  fonte: 'projetos' | 'homologacoes' | 'execucoes'
}

export const LISTAS: Record<string, Def> = {
  // Painel da equipe (admin) — do mês
  vendas_mes:     { titulo: 'Vendas do mês', fonte: 'projetos', porMes: true, somaValor: true, soAdmin: true, rotuloData: 'Data da venda',
                    regra: 'Projetos fechados cuja DATA DA VENDA (informada no fechamento ou 1ª entrada em "vendido") cai no mês, mais as vendas manuais do mês. Valor = preço acordado.' },
  leads_mes:      { titulo: 'Leads do mês', fonte: 'projetos', porMes: true, soAdmin: true, rotuloData: 'Entrou em',
                    regra: 'Clientes únicos com projeto criado no mês (um cliente com 2 projetos conta 1). Responsável = quem criou o 1º projeto do cliente no mês.' },
  projetos_mes:   { titulo: 'Projetos do mês', fonte: 'projetos', porMes: true, somaValor: true, soAdmin: true, rotuloData: 'Criado em',
                    regra: 'Projetos criados no mês.' },
  propostas_mes:  { titulo: 'Propostas do mês', fonte: 'projetos', porMes: true, somaValor: true, soAdmin: true, rotuloData: 'Criado em',
                    regra: 'Projetos criados no mês com proposta emitida (PDF gerado), em qualquer etapa depois disso.' },
  perdidos_mes:   { titulo: 'Perdidos no mês', fonte: 'projetos', porMes: true, somaValor: true, soAdmin: true, rotuloData: 'Perdido em',
                    regra: 'Recusados, cancelados ou expirados com a última troca de etapa no mês.' },
  negociacao:     { titulo: 'Em negociação', fonte: 'projetos', somaValor: true, rotuloData: 'Última movimentação',
                    regra: 'Proposta enviada, negociando ou em fechamento — agora.' },
  parados:        { titulo: 'Negócios parados', fonte: 'projetos', somaValor: true, soAdmin: true, rotuloData: 'Última movimentação',
                    regra: 'Em negociação e sem movimentação há mais de 7 dias.' },
  // Cards da jornada
  projetos_todos:      { titulo: 'Projetos', fonte: 'projetos', rotuloData: 'Criado em', regra: 'Todos os projetos (sem os excluídos).' },
  projetos_andamento:  { titulo: 'Projetos em andamento', fonte: 'projetos', rotuloData: 'Última movimentação',
                         regra: 'Projetos antes da proposta ser enviada (rascunho até orçamento gerado).' },
  projetos_vendidos:   { titulo: 'Projetos vendidos', fonte: 'projetos', somaValor: true, rotuloData: 'Data da venda',
                         regra: 'Projetos em etapa de venda fechada (vendido, homologação, execução, instalado, pós-venda).' },
  projetos_rascunho:   { titulo: 'Projetos em rascunho', fonte: 'projetos', rotuloData: 'Criado em', regra: 'Etapa rascunho.' },
  projetos_orcamento:  { titulo: 'Orçamentos gerados', fonte: 'projetos', somaValor: true, rotuloData: 'Última movimentação', regra: 'Etapa orçamento gerado (proposta ainda não enviada).' },
  hom_todas:       { titulo: 'Homologações', fonte: 'homologacoes', soAdmin: true, rotuloData: 'Aberta em', regra: 'Todas as homologações.' },
  hom_ativas:      { titulo: 'Homologações ativas', fonte: 'homologacoes', soAdmin: true, rotuloData: 'Última movimentação', regra: 'Iniciadas ou em andamento.' },
  hom_atrasadas:   { titulo: 'Homologações atrasadas', fonte: 'homologacoes', soAdmin: true, rotuloData: 'Última movimentação', regra: 'Ativas sem movimentação há mais de 5 dias.' },
  hom_aprovadas:   { titulo: 'Homologações aprovadas', fonte: 'homologacoes', soAdmin: true, rotuloData: 'Última movimentação', regra: 'Aprovadas pela CELESC.' },
  hom_rejeitadas:  { titulo: 'Homologações rejeitadas', fonte: 'homologacoes', soAdmin: true, rotuloData: 'Última movimentação', regra: 'Rejeitadas.' },
  op_todas:        { titulo: 'Execuções', fonte: 'execucoes', somaValor: true, rotuloData: 'Agendada para', regra: 'Todas as execuções, menos as canceladas.' },
  op_execucao:     { titulo: 'Em execução', fonte: 'execucoes', somaValor: true, rotuloData: 'Agendada para', regra: 'Em execução ou preparando material.' },
  op_agendadas:    { titulo: 'Execuções agendadas', fonte: 'execucoes', somaValor: true, rotuloData: 'Agendada para', regra: 'Agendadas (com data).' },
  op_atrasadas:    { titulo: 'Execuções atrasadas', fonte: 'execucoes', somaValor: true, rotuloData: 'Agendada para', regra: 'Agendadas pra antes de hoje e ainda não concluídas.' },
  op_entregues:    { titulo: 'Execuções entregues', fonte: 'execucoes', somaValor: true, rotuloData: 'Concluída em', regra: 'Entregues ao cliente.' },
  pv_garantia:     { titulo: 'Em garantia', fonte: 'execucoes', soAdmin: true, rotuloData: 'Concluída em', regra: 'Execuções em pós-venda (garantia).' },
  pv_om:           { titulo: 'Ativos em O&M', fonte: 'projetos', soAdmin: true, somaValor: true, rotuloData: 'Data da venda', regra: 'Projetos em pós-venda ativo.' },
}

const ROTULO_STATUS: Record<string, string> = {
  rascunho: 'Rascunho', fatura_analisada: 'Fatura analisada', telhado_preenchido: 'Telhado', dimensionado: 'Dimensionado',
  kit_selecionado: 'Kit', lista_ca_confirmada: 'Lista CA', orcamento_gerado: 'Orçamento gerado',
  proposta_enviada: 'Proposta enviada', negociando: 'Negociando', em_fechamento: 'Em fechamento',
  vendido: 'Vendido', aceito: 'Aceito', em_homologacao: 'Em homologação', em_execucao: 'Em execução',
  instalado: 'Instalado', ativo_pos_venda: 'Pós-venda', recusado: 'Recusado', cancelado: 'Cancelado', expirado: 'Expirado',
  // execuções
  aguardando_pre_requisitos: 'Aguardando liberação', agendando: 'Em aberto', agendado: 'Agendada',
  preparando_material: 'Preparando material', concluido: 'Concluída', entregue: 'Entregue', pos_venda: 'Garantia',
  // homologações
  iniciado: 'Iniciada', em_andamento: 'Em andamento', aprovada: 'Aprovada', rejeitada: 'Rejeitada',
}
export const rotuloStatus = (s: string | null | undefined) => (s ? ROTULO_STATUS[s] || s.replace(/_/g, ' ') : '—')

const ANTES_DA_PROPOSTA = ['rascunho', 'fatura_analisada', 'telhado_preenchido', 'dimensionado', 'kit_selecionado', 'lista_ca_confirmada', 'orcamento_gerado']

export async function carregarLista(chave: string, filtros: { mes?: string | null; pessoa?: string | null }): Promise<ResultadoLista | { erro: string }> {
  const def = LISTAS[chave]
  if (!def) return { erro: 'Lista não encontrada' }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (def.soAdmin) {
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (perfil?.role !== 'admin') return { erro: 'Lista disponível só para o admin' }
  }
  const janela = janelaMes(filtros.mes)
  const { data: perfis } = await supabase.from('profiles').select('id, nome_completo')
  const nomes = new Map(((perfis || []) as any[]).map((p) => [p.id, p.nome_completo as string]))
  const base = { titulo: def.titulo, regra: def.regra, rotuloData: def.rotuloData, porMes: !!def.porMes, somaValor: !!def.somaValor, soAdmin: !!def.soAdmin }

  if (def.fonte === 'projetos') {
    const { data: projetos, error } = await supabase.from('projetos')
      .select('id, codigo, cliente_id, cliente_razao_social, consultor_id, status, tipo_projeto, pv_total, orcamento_consolidado, pv_orcamento:orcamento_final->pv_total, created_at, updated_at, status_atualizado_em')
      .is('excluida_em', null).limit(10000)
    if (error) return { erro: error.message }
    let lista = (projetos || []) as any[]
    let primeiro: Map<string, string> | undefined
    if (['vendas_mes', 'projetos_vendidos', 'pv_om'].includes(chave)) {
      const { data: hist } = await supabase.from('projeto_status_historico').select('projeto_id, created_at')
        .in('status_novo', STATUS_FECHADOS).limit(20000)
      primeiro = mapaPrimeiroFechamento((hist || []) as any[])
    }
    const noMes = (iso: string | null) => { const d = diaBRT(iso); return !!d && d >= janela.de && d < janela.ate }
    const valorProposta = (p: any) => Number(p.pv_total || p.orcamento_consolidado?.pv_total || p.pv_orcamento) || 0
    const seteDias = Date.now() - 7 * 86400_000
    let dataDe = (p: any) => p.status_atualizado_em || p.updated_at
    let valorDe = valorProposta

    switch (chave) {
      case 'vendas_mes':
        lista = lista.filter((p) => fechadoNoMes(p, janela, primeiro))
        dataDe = (p) => dataDaVenda(p, primeiro); valorDe = valorDaVenda; break
      case 'leads_mes': {
        const doMes = lista.filter((p) => noMes(p.created_at)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        const porCliente = new Map<string, any>()
        for (const p of doMes) if (!porCliente.has(chaveCliente(p))) porCliente.set(chaveCliente(p), p)
        lista = Array.from(porCliente.values()); dataDe = (p) => p.created_at; break
      }
      case 'projetos_mes':
        lista = lista.filter((p) => noMes(p.created_at)); dataDe = (p) => p.created_at; break
      case 'propostas_mes':
        lista = lista.filter((p) => noMes(p.created_at) && STATUS_PROPOSTA_EMITIDA.has(p.status)); dataDe = (p) => p.created_at; break
      case 'perdidos_mes':
        lista = lista.filter((p) => STATUS_PERDIDOS.has(String(p.status || '').toLowerCase()) && noMes(p.status_atualizado_em || p.updated_at)); break
      case 'negociacao':
        lista = lista.filter((p) => STATUS_PROPOSTA.includes(p.status)); break
      case 'parados':
        lista = lista.filter((p) => STATUS_PROPOSTA.includes(p.status) && new Date(p.status_atualizado_em || p.updated_at || p.created_at).getTime() < seteDias); break
      case 'projetos_todos':
        dataDe = (p) => p.created_at; break
      case 'projetos_andamento':
        lista = lista.filter((p) => ANTES_DA_PROPOSTA.includes(p.status)); break
      case 'projetos_vendidos':
        lista = lista.filter((p) => STATUS_FECHADOS.includes(p.status)); dataDe = (p) => dataDaVenda(p, primeiro); valorDe = valorDaVenda; break
      case 'projetos_rascunho':
        lista = lista.filter((p) => p.status === 'rascunho'); dataDe = (p) => p.created_at; break
      case 'projetos_orcamento':
        lista = lista.filter((p) => p.status === 'orcamento_gerado'); break
      case 'pv_om':
        lista = lista.filter((p) => p.status === 'ativo_pos_venda'); dataDe = (p) => dataDaVenda(p, primeiro); valorDe = valorDaVenda; break
    }
    if (filtros.pessoa) lista = lista.filter((p) => p.consultor_id === filtros.pessoa)

    const linhas: LinhaLista[] = lista.map((p) => ({
      id: p.id,
      href: `/projetos/${p.id}`,
      cliente: p.cliente_razao_social || 'Cliente sem nome',
      codigo: p.codigo,
      status: rotuloStatus(p.status),
      pessoa: p.consultor_id ? nomes.get(p.consultor_id) || null : null,
      data: String(dataDe(p) || '').slice(0, 10) || null,
      valor: valorDe(p) || null,
      extra: p.tipo_projeto ? getTituloTipo(p.tipo_projeto) : null,
    }))

    // Vendas manuais entram nas vendas do mês (mesmo critério do painel)
    if (chave === 'vendas_mes') {
      let q = supabase.from('vendas_manuais').select('id, cliente_nome, categoria, tipo_detalhado, valor_venda, data_venda, vendedor_id')
        .is('deletada_em', null).gte('data_venda', janela.de).lt('data_venda', janela.ate)
      if (filtros.pessoa) q = q.eq('vendedor_id', filtros.pessoa)
      const { data: manuais } = await q
      for (const v of (manuais || []) as any[]) {
        linhas.push({
          id: v.id, href: '/admin/vendas', cliente: v.cliente_nome || 'Cliente', codigo: 'venda manual',
          status: v.categoria === 'fv' ? 'FV (manual)' : 'Serviço (manual)',
          pessoa: v.vendedor_id ? nomes.get(v.vendedor_id) || null : null,
          data: String(v.data_venda || '').slice(0, 10), valor: Number(v.valor_venda) || 0, extra: v.tipo_detalhado || null,
        })
      }
    }
    linhas.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
    return { ...base, linhas }
  }

  if (def.fonte === 'homologacoes') {
    const { data, error } = await supabase.from('homologacoes')
      .select('id, status_geral, etapa_atual, created_at, updated_at, projeto:projeto_id(id, codigo, cliente_razao_social, consultor_id)')
      .order('updated_at', { ascending: false }).limit(2000)
    if (error) return { erro: error.message }
    const cincoDias = Date.now() - 5 * 86400_000
    let lista = (data || []) as any[]
    if (chave === 'hom_ativas') lista = lista.filter((h) => ['iniciado', 'em_andamento'].includes(h.status_geral))
    if (chave === 'hom_atrasadas') lista = lista.filter((h) => ['iniciado', 'em_andamento'].includes(h.status_geral) && new Date(h.updated_at).getTime() < cincoDias)
    if (chave === 'hom_aprovadas') lista = lista.filter((h) => h.status_geral === 'aprovada')
    if (chave === 'hom_rejeitadas') lista = lista.filter((h) => h.status_geral === 'rejeitada')
    const linhas: LinhaLista[] = lista.map((h) => ({
      id: h.id, href: `/homologacoes/${h.id}`,
      cliente: h.projeto?.cliente_razao_social || 'Projeto', codigo: h.projeto?.codigo || null,
      status: rotuloStatus(h.status_geral), pessoa: h.projeto?.consultor_id ? nomes.get(h.projeto.consultor_id) || null : null,
      data: String((chave === 'hom_todas' ? h.created_at : h.updated_at) || '').slice(0, 10) || null,
      extra: h.etapa_atual ? `Etapa ${h.etapa_atual}` : null,
    }))
    return { ...base, linhas }
  }

  // execuções
  let q = supabase.from('execucoes_servicos')
    .select('id, os_numero, status, tipo_servico, titulo, cliente_nome, valor_contratado, data_agendada, data_conclusao, responsavel_tecnico, projeto:projeto_id(codigo, cliente_razao_social)')
    .neq('status', 'cancelado').limit(5000)
  if (chave === 'op_execucao') q = q.in('status', ['em_execucao', 'preparando_material'])
  if (chave === 'op_agendadas') q = q.eq('status', 'agendado')
  if (chave === 'op_atrasadas') q = q.in('status', ['agendado', 'preparando_material', 'em_execucao']).lt('data_agendada', hojeBRT())
  if (chave === 'op_entregues') q = q.eq('status', 'entregue')
  if (chave === 'pv_garantia') q = q.eq('status', 'pos_venda')
  const { data, error } = await q
  if (error) return { erro: error.message }
  const linhas: LinhaLista[] = ((data || []) as any[]).map((e) => ({
    id: e.id, href: `/execucoes/${e.id}`,
    cliente: e.cliente_nome || e.projeto?.cliente_razao_social || e.titulo,
    codigo: e.projeto?.codigo || (e.os_numero ? `OS ${String(e.os_numero).padStart(4, '0')}` : null),
    status: rotuloStatus(e.status), pessoa: e.responsavel_tecnico ? nomes.get(e.responsavel_tecnico) || null : null,
    data: String((['op_entregues', 'pv_garantia'].includes(chave) ? e.data_conclusao : e.data_agendada) || '').slice(0, 10) || null,
    valor: Number(e.valor_contratado) || null, extra: getTituloTipo(e.tipo_servico),
  }))
  linhas.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
  return { ...base, linhas }
}
