'use server'

import { createClient } from '@/lib/supabase/server'

async function verificarAdmin(): Promise<{ erro: string } | { ok: true }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' }
  return { ok: true }
}

export type MetricasRepresentante = {
  id: string
  nome: string
  projetos_criados: number      // criados no mês
  projetos_ativos: number       // status não perdido/pos_venda
  propostas_enviadas: number    // status = proposta_enviada
  contratos_assinados: number   // status = contrato_assinado ou depois
  vendas_valor: number          // soma pv_total dos vendidos
}

export type MetricasVendedorServ = {
  id: string
  nome: string
  telhados_prospectados: number    // fase = prospeccao
  em_contato: number               // fase = contato
  em_proposta: number              // fase = proposta
  fechados: number                 // fase = fechado
  valor_propostas: number          // soma proposta_valor onde fase in (proposta, fechado)
}

export type MetricasProfissionalCampo = {
  id: string
  nome: string
  os_executadas: number            // execucoes_servicos com data_conclusao no mês
  valor_faturado: number           // soma valor_final das concluídas
}

export type FatiaFaturamento = {
  linha: 'Kits solar' | 'Serviços de limpeza' | 'Execução de OS'
  valor: number
  cor: string
}

export type EtapaFunil = {
  chave: 'prospeccao' | 'contato' | 'proposta' | 'fechado'
  rotulo: string
  quantidade: number
  valor: number
}

export type LinhaRank = {
  id: string
  nome: string
  role: 'representante' | 'representante' | 'admin'
  vendido: number
  em_proposta: number
  meta: number
}

export type ComparativoMes = {
  faturamento_mes: number
  faturamento_mes_passado: number
  contratos_mes: number
  contratos_mes_passado: number
  os_mes: number
  os_mes_passado: number
}

export type PainelEquipe = {
  representantes: MetricasRepresentante[]
  vendedoresServ: MetricasVendedorServ[]
  profissionaisCampo: MetricasProfissionalCampo[]
  totais: {
    projetos_criados: number
    propostas_enviadas: number
    contratos_assinados: number
    vendas_valor: number
    telhados_prospectados: number
    fechados_servicos: number
    valor_propostas_servicos: number
    os_executadas: number
    faturamento_execucao: number
  }
  faturamentoPorLinha: FatiaFaturamento[]
  funil: EtapaFunil[]
  rankVendedores: LinhaRank[]
  comparativo: ComparativoMes
}

/** Status que contam como "venda fechada" no pipeline atual. */
const STATUS_FECHADOS = ['vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda']

/** Status que contam como "em negociação (proposta viva)". */
const STATUS_PROPOSTA = ['proposta_enviada', 'negociando', 'em_fechamento']

/** Status "projeto em andamento" pra funil (antes da proposta). */
const STATUS_PROJETO_PROSPECCAO = ['rascunho', 'fatura_analisada', 'telhado_preenchido']
const STATUS_PROJETO_CONTATO = ['dimensionado', 'kit_selecionado', 'lista_ca_confirmada', 'orcamento_gerado']

export async function buscarPainelEquipeAction(): Promise<PainelEquipe | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()

  // Janelas de tempo
  const inicioMes = new Date()
  inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const inicioMesPassado = new Date(inicioMes)
  inicioMesPassado.setMonth(inicioMesPassado.getMonth() - 1)
  const fimMesPassado = new Date(inicioMes)  // exclusivo
  const inicioMesIso = inicioMes.toISOString()
  const inicioMesPassadoIso = inicioMesPassado.toISOString()
  const fimMesPassadoIso = fimMesPassado.toISOString()

  // ─── Perfis comerciais + admin (admin também vende) ────────────────────────
  const { data: perfis } = await supabase
    .from('profiles')
    .select('id, nome_completo, role, ativo')
    .in('role', ['admin', 'representante', 'representante', 'profissional_campo'])

  const perfilPorId = new Map<string, { nome: string; role: string }>()
  for (const p of perfis || []) {
    perfilPorId.set(p.id, { nome: p.nome_completo || 'Sem nome', role: p.role })
  }

  const admins = (perfis || []).filter((p) => p.role === 'admin' && p.ativo)
  const representantes = (perfis || []).filter((p) => p.role === 'representante' && p.ativo)
  const vendedoresServ = (perfis || []).filter((p) => p.role === 'representante' && p.ativo)
  const profissionaisCampo = (perfis || []).filter((p) => p.role === 'profissional_campo' && p.ativo)

  // Vendedores solar = representantes + admins (Kalebe também fecha venda).
  const vendedoresSolar = [...admins, ...representantes]

  // ─── Puxa TODOS os projetos (não filtra por consultor_id) ─────────────────
  // Sem filtro pra não perder projetos criados por admins nem por representantes
  // que ficaram inativos depois. Filtra depois no memória agrupando por
  // consultor_id que aparece de fato.
  const projetosPromise = supabase
    .from('projetos')
    .select('id, consultor_id, status, pv_total, created_at, updated_at, status_atualizado_em')

  // Kalebe 2026-08-27: painel mostrava 0 pra Maria Eduarda porque só
  // buscava telhados de quem tem role vendedor_servicos. Como admins
  // (Kalebe) também cadastram telhados, buscamos TODOS e agrupamos
  // por quem realmente é o vendedor_id do registro.
  const telhadosPromise = supabase
    .from('telhados')
    .select('vendedor_id, fase, proposta_valor, created_at, updated_at')

  const execPromise = profissionaisCampo.length > 0
    ? supabase
        .from('execucoes_servicos')
        .select('responsavel_id, valor_final, data_conclusao')
        .in('responsavel_id', profissionaisCampo.map((p) => p.id))
        .not('data_conclusao', 'is', null)
        .gte('data_conclusao', inicioMesPassadoIso)
    : Promise.resolve({ data: [] as any[] })

  const [{ data: projetosData }, { data: telhadosData }, { data: execData }] = await Promise.all([
    projetosPromise, telhadosPromise, execPromise,
  ])

  const todosProjetos = projetosData || []

  // Helper: um projeto "fechou no mês X" se hoje está em status fechado E
  // a última mudança de status caiu na janela. Se status_atualizado_em não
  // existir (projetos antigos), cai pra updated_at.
  const dataFechamento = (p: any) => p.status_atualizado_em || p.updated_at
  const isFechadoNoMes = (p: any, deIso: string, ateIso?: string) => {
    if (!STATUS_FECHADOS.includes(p.status)) return false
    const d = dataFechamento(p)
    if (!d) return false
    if (d < deIso) return false
    if (ateIso && d >= ateIso) return false
    return true
  }

  // ─── Agrega por consultor solar (representantes + admins) ─────────────────
  const metricasRepres: MetricasRepresentante[] = vendedoresSolar.map((r) => {
    const meus = todosProjetos.filter((p: any) => p.consultor_id === r.id)
    const meusMes = meus.filter((p: any) => p.created_at >= inicioMesIso)
    const propostaViva = meus.filter((p: any) => STATUS_PROPOSTA.includes(p.status))
    const fechadosMes = meus.filter((p: any) => isFechadoNoMes(p, inicioMesIso))
    return {
      id: r.id,
      nome: r.nome_completo || 'Sem nome',
      projetos_criados: meusMes.length,
      projetos_ativos: meus.filter((p: any) =>
        !['recusado', 'cancelado', 'expirado', 'ativo_pos_venda'].includes(p.status)
      ).length,
      propostas_enviadas: propostaViva.length,
      contratos_assinados: fechadosMes.length,
      vendas_valor: fechadosMes.reduce((s: number, p: any) => s + (Number(p.pv_total) || 0), 0),
    }
  })

  // ─── Agrega por vendedor de serviços ──────────────────────────────────────
  // Considera QUALQUER usuário que apareça como vendedor_id de telhado
  // (não só quem tem role vendedor_servicos — admins também cadastram).
  const idsQueCadastraramTelhado = new Set<string>(
    (telhadosData || []).map((t: any) => t.vendedor_id).filter(Boolean),
  )
  // União: vendedores_servicos ativos + qualquer outro que apareça nos telhados
  const vendedoresServAmpliados = [
    ...vendedoresServ,
    ...(perfis || []).filter((p) =>
      idsQueCadastraramTelhado.has(p.id) && !vendedoresServ.some((v) => v.id === p.id)
    ),
  ]
  const metricasVend: MetricasVendedorServ[] = vendedoresServAmpliados.map((v) => {
    const meus = (telhadosData || []).filter((t: any) => t.vendedor_id === v.id)
    return {
      id: v.id,
      nome: v.nome_completo || 'Sem nome',
      telhados_prospectados: meus.filter((t: any) => t.fase === 'prospeccao').length,
      em_contato: meus.filter((t: any) => t.fase === 'contato').length,
      em_proposta: meus.filter((t: any) => t.fase === 'proposta').length,
      fechados: meus.filter((t: any) => t.fase === 'fechado').length,
      valor_propostas: meus
        .filter((t: any) => ['proposta', 'fechado'].includes(t.fase))
        .reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0),
    }
  }).filter((m) =>
    // Só mostra quem tem pelo menos 1 telhado OU tem role vendedor_servicos
    m.telhados_prospectados + m.em_contato + m.em_proposta + m.fechados > 0 ||
    vendedoresServ.some((v) => v.id === m.id)
  )

  // ─── Agrega por profissional de campo (só mês corrente) ───────────────────
  const metricasCampo: MetricasProfissionalCampo[] = profissionaisCampo.map((c) => {
    const meus = (execData || []).filter((e: any) =>
      e.responsavel_id === c.id && e.data_conclusao >= inicioMesIso
    )
    return {
      id: c.id,
      nome: c.nome_completo || 'Sem nome',
      os_executadas: meus.length,
      valor_faturado: meus.reduce((s: number, e: any) => s + (Number(e.valor_final) || 0), 0),
    }
  })

  // ─── Faturamento por linha ────────────────────────────────────────────────
  const totalKitsSolar = metricasRepres.reduce((s, r) => s + r.vendas_valor, 0)
  const totalServicosLimpeza = metricasVend.reduce((s, v) => {
    const fechadosMes = (telhadosData || []).filter(
      (t: any) => t.vendedor_id === v.id && t.fase === 'fechado' && (t.updated_at || '') >= inicioMesIso
    )
    return s + fechadosMes.reduce((ss: number, t: any) => ss + (Number(t.proposta_valor) || 0), 0)
  }, 0)
  const totalExecucao = metricasCampo.reduce((s, c) => s + c.valor_faturado, 0)

  const faturamentoPorLinha: FatiaFaturamento[] = (
    [
      { linha: 'Kits solar', valor: totalKitsSolar, cor: '#F5B400' },
      { linha: 'Serviços de limpeza', valor: totalServicosLimpeza, cor: '#4EDC8A' },
      { linha: 'Execução de OS', valor: totalExecucao, cor: '#0047BB' },
    ] as FatiaFaturamento[]
  ).filter((f) => f.valor > 0)

  // ─── Funil consolidado (todos os projetos + todos os telhados) ────────────
  const projetosProspeccao = todosProjetos.filter((p: any) => STATUS_PROJETO_PROSPECCAO.includes(p.status))
  const projetosContato = todosProjetos.filter((p: any) => STATUS_PROJETO_CONTATO.includes(p.status))
  const projetosProposta = todosProjetos.filter((p: any) => STATUS_PROPOSTA.includes(p.status))
  const projetosFechadosAtuais = todosProjetos.filter((p: any) => STATUS_FECHADOS.includes(p.status))

  const telhadosProspeccao = (telhadosData || []).filter((t: any) => t.fase === 'prospeccao')
  const telhadosContato = (telhadosData || []).filter((t: any) => t.fase === 'contato')
  const telhadosProposta = (telhadosData || []).filter((t: any) => t.fase === 'proposta')
  const telhadosFechados = (telhadosData || []).filter((t: any) => t.fase === 'fechado')

  const funil: EtapaFunil[] = [
    {
      chave: 'prospeccao',
      rotulo: 'Prospecção',
      quantidade: projetosProspeccao.length + telhadosProspeccao.length,
      valor: 0,
    },
    {
      chave: 'contato',
      rotulo: 'Em contato',
      quantidade: projetosContato.length + telhadosContato.length,
      valor: 0,
    },
    {
      chave: 'proposta',
      rotulo: 'Proposta enviada',
      quantidade: projetosProposta.length + telhadosProposta.length,
      valor:
        projetosProposta.reduce((s: number, p: any) => s + (Number(p.pv_total) || 0), 0) +
        telhadosProposta.reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0),
    },
    {
      chave: 'fechado',
      rotulo: 'Fechado',
      quantidade: projetosFechadosAtuais.length + telhadosFechados.length,
      valor:
        projetosFechadosAtuais.reduce((s: number, p: any) => s + (Number(p.pv_total) || 0), 0) +
        telhadosFechados.reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0),
    },
  ]

  // ─── Rank consolidado de vendedores ───────────────────────────────────────
  const rankVendedores: LinhaRank[] = [
    ...metricasRepres.map((r) => ({
      id: r.id,
      nome: r.nome,
      role: (perfilPorId.get(r.id)?.role === 'admin' ? 'admin' : 'representante') as 'representante' | 'admin',
      vendido: r.vendas_valor,
      em_proposta: r.propostas_enviadas,
      meta: 0,
    })),
    ...metricasVend.map((v) => ({
      id: v.id,
      nome: v.nome,
      role: 'representante' as const,
      vendido: (telhadosData || [])
        .filter((t: any) => t.vendedor_id === v.id && t.fase === 'fechado' && (t.updated_at || '') >= inicioMesIso)
        .reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0),
      em_proposta: v.em_proposta,
      meta: 0,
    })),
  ].sort((a, b) => b.vendido - a.vendido)

  // ─── Comparativo mês vs mês passado ───────────────────────────────────────
  const projetosFechadosPassado = todosProjetos.filter((p: any) =>
    isFechadoNoMes(p, inicioMesPassadoIso, fimMesPassadoIso)
  )
  const telhadosFechadosPassado = (telhadosData || []).filter((t: any) =>
    t.fase === 'fechado' &&
    (t.updated_at || '') >= inicioMesPassadoIso && (t.updated_at || '') < fimMesPassadoIso
  )
  const execPassado = (execData || []).filter((e: any) =>
    e.data_conclusao >= inicioMesPassadoIso && e.data_conclusao < fimMesPassadoIso
  )

  const faturamentoMesPassado =
    projetosFechadosPassado.reduce((s: number, p: any) => s + (Number(p.pv_total) || 0), 0) +
    telhadosFechadosPassado.reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0) +
    execPassado.reduce((s: number, e: any) => s + (Number(e.valor_final) || 0), 0)

  const faturamentoMes = totalKitsSolar + totalServicosLimpeza + totalExecucao

  const comparativo: ComparativoMes = {
    faturamento_mes: faturamentoMes,
    faturamento_mes_passado: faturamentoMesPassado,
    contratos_mes: metricasRepres.reduce((s, r) => s + r.contratos_assinados, 0),
    contratos_mes_passado: projetosFechadosPassado.length,
    os_mes: metricasCampo.reduce((s, c) => s + c.os_executadas, 0),
    os_mes_passado: execPassado.length,
  }

  return {
    representantes: metricasRepres,
    vendedoresServ: metricasVend,
    profissionaisCampo: metricasCampo,
    totais: {
      projetos_criados: metricasRepres.reduce((s, r) => s + r.projetos_criados, 0),
      propostas_enviadas: metricasRepres.reduce((s, r) => s + r.propostas_enviadas, 0),
      contratos_assinados: metricasRepres.reduce((s, r) => s + r.contratos_assinados, 0),
      vendas_valor: metricasRepres.reduce((s, r) => s + r.vendas_valor, 0),
      telhados_prospectados: metricasVend.reduce((s, v) => s + v.telhados_prospectados + v.em_contato + v.em_proposta + v.fechados, 0),
      fechados_servicos: metricasVend.reduce((s, v) => s + v.fechados, 0),
      valor_propostas_servicos: metricasVend.reduce((s, v) => s + v.valor_propostas, 0),
      os_executadas: metricasCampo.reduce((s, c) => s + c.os_executadas, 0),
      faturamento_execucao: metricasCampo.reduce((s, c) => s + c.valor_faturado, 0),
    },
    faturamentoPorLinha,
    funil,
    rankVendedores,
    comparativo,
  }
}
