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

/** Uma linha do faturamento por linha de negócio (pra gráfico de pizza). */
export type FatiaFaturamento = {
  linha: 'Kits solar' | 'Serviços de limpeza' | 'Execução de OS'
  valor: number
  cor: string      // cor tailwind hex pra pintar a fatia
}

/** Etapa do funil comercial unificado (kits + serviços). */
export type EtapaFunil = {
  chave: 'prospeccao' | 'contato' | 'proposta' | 'fechado'
  rotulo: string
  quantidade: number
  valor: number   // valor em R$ nessa etapa
}

/** Linha do rank consolidado de vendedores (kits + serviços). */
export type LinhaRank = {
  id: string
  nome: string
  role: 'representante' | 'vendedor_servicos'
  vendido: number
  em_proposta: number
  meta: number       // meta mensal individual (a definir depois; 0 se não configurada)
}

/** Comparativo mês corrente vs mês passado. */
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

/**
 * Snapshot da equipe comercial no mês corrente + comparativo com o mês
 * anterior. Chamado em fetch inicial pelo painel admin e depois a cada
 * evento Realtime nas tabelas relevantes. Todas as queries em paralelo.
 */
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

  // Perfis com role comercial
  const { data: perfis } = await supabase
    .from('profiles')
    .select('id, nome_completo, role, ativo')
    .in('role', ['representante', 'vendedor_servicos', 'profissional_campo'])
    .eq('ativo', true)

  const representantes = (perfis || []).filter((p) => p.role === 'representante')
  const vendedoresServ = (perfis || []).filter((p) => p.role === 'vendedor_servicos')
  const profissionaisCampo = (perfis || []).filter((p) => p.role === 'profissional_campo')

  // ─── Consultores (representantes) — dados dos PROJETOS ────────────────────
  const projetosPromise = representantes.length > 0
    ? supabase
        .from('projetos')
        .select('consultor_id, status, pv_total, created_at, updated_at')
        .in('consultor_id', representantes.map((p) => p.id))
    : Promise.resolve({ data: [] as any[] })

  // ─── Vendedores de serviço — dados dos TELHADOS ───────────────────────────
  const telhadosPromise = vendedoresServ.length > 0
    ? supabase
        .from('telhados')
        .select('vendedor_id, fase, proposta_valor, created_at, updated_at')
        .in('vendedor_id', vendedoresServ.map((p) => p.id))
    : Promise.resolve({ data: [] as any[] })

  // ─── Profissionais de campo — dados das EXECUÇÕES ─────────────────────────
  // Puxa TUDO desde o início do mês passado pra montar comparativo.
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

  const STATUS_FECHADOS = ['contrato_assinado', 'homologacao', 'instalado', 'ativo_pos_venda']

  // ─── Agrega por consultor (mês corrente) ──────────────────────────────────
  const metricasRepres: MetricasRepresentante[] = representantes.map((r) => {
    const meus = (projetosData || []).filter((p: any) => p.consultor_id === r.id)
    const meusMes = meus.filter((p: any) => p.created_at >= inicioMesIso)
    const proposta_enviada = meus.filter((p: any) => p.status === 'proposta_enviada')
    const fechadosMes = meus.filter((p: any) =>
      STATUS_FECHADOS.includes(p.status) && p.updated_at >= inicioMesIso
    )
    return {
      id: r.id,
      nome: r.nome_completo || 'Sem nome',
      projetos_criados: meusMes.length,
      projetos_ativos: meus.filter((p: any) => p.status !== 'perdido' && p.status !== 'ativo_pos_venda').length,
      propostas_enviadas: proposta_enviada.length,
      contratos_assinados: fechadosMes.length,
      vendas_valor: fechadosMes.reduce((s: number, p: any) => s + (Number(p.pv_total) || 0), 0),
    }
  })

  // ─── Agrega por vendedor_servicos ─────────────────────────────────────────
  const metricasVend: MetricasVendedorServ[] = vendedoresServ.map((v) => {
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
  })

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

  // ─── Faturamento por linha (pra pizza) ────────────────────────────────────
  const totalKitsSolar = metricasRepres.reduce((s, r) => s + r.vendas_valor, 0)
  const totalServicosLimpeza = metricasVend.reduce((s, v) => {
    const fechadosVend = (telhadosData || []).filter(
      (t: any) => t.vendedor_id === v.id && t.fase === 'fechado' && t.updated_at >= inicioMesIso
    )
    return s + fechadosVend.reduce((ss: number, t: any) => ss + (Number(t.proposta_valor) || 0), 0)
  }, 0)
  const totalExecucao = metricasCampo.reduce((s, c) => s + c.valor_faturado, 0)

  const faturamentoPorLinha: FatiaFaturamento[] = (
    [
      { linha: 'Kits solar', valor: totalKitsSolar, cor: '#F5B400' },
      { linha: 'Serviços de limpeza', valor: totalServicosLimpeza, cor: '#4EDC8A' },
      { linha: 'Execução de OS', valor: totalExecucao, cor: '#0047BB' },
    ] as FatiaFaturamento[]
  ).filter((f) => f.valor > 0)  // pizza só mostra o que tem valor

  // ─── Funil consolidado (kits + serviços somados) ──────────────────────────
  // Prospecção = telhados fase prospeccao + projetos status inicial
  // Contato    = telhados fase contato + projetos em_andamento/agendado
  // Proposta   = telhados fase proposta + projetos proposta_enviada
  // Fechado    = telhados fase fechado + projetos fechados
  const projetosProspeccao = (projetosData || []).filter((p: any) =>
    ['lead', 'em_avaliacao', 'aguardando_visita'].includes(p.status)
  )
  const projetosContato = (projetosData || []).filter((p: any) =>
    ['visita_agendada', 'em_negociacao'].includes(p.status)
  )
  const projetosProposta = (projetosData || []).filter((p: any) => p.status === 'proposta_enviada')
  const projetosFechados = (projetosData || []).filter((p: any) => STATUS_FECHADOS.includes(p.status))

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
      quantidade: projetosFechados.length + telhadosFechados.length,
      valor:
        projetosFechados.reduce((s: number, p: any) => s + (Number(p.pv_total) || 0), 0) +
        telhadosFechados.reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0),
    },
  ]

  // ─── Rank consolidado de vendedores (kits + serviços) ─────────────────────
  const rankVendedores: LinhaRank[] = [
    ...metricasRepres.map((r) => ({
      id: r.id,
      nome: r.nome,
      role: 'representante' as const,
      vendido: r.vendas_valor,
      em_proposta: r.propostas_enviadas,
      meta: 0,   // Meta individual será configurável em fase seguinte
    })),
    ...metricasVend.map((v) => ({
      id: v.id,
      nome: v.nome,
      role: 'vendedor_servicos' as const,
      vendido: (telhadosData || [])
        .filter((t: any) => t.vendedor_id === v.id && t.fase === 'fechado' && t.updated_at >= inicioMesIso)
        .reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0),
      em_proposta: v.em_proposta,
      meta: 0,
    })),
  ].sort((a, b) => b.vendido - a.vendido)

  // ─── Comparativo mês corrente vs mês passado ──────────────────────────────
  const projetosFechadosPassado = (projetosData || []).filter((p: any) =>
    STATUS_FECHADOS.includes(p.status) &&
    p.updated_at >= inicioMesPassadoIso && p.updated_at < fimMesPassadoIso
  )
  const telhadosFechadosPassado = (telhadosData || []).filter((t: any) =>
    t.fase === 'fechado' &&
    t.updated_at >= inicioMesPassadoIso && t.updated_at < fimMesPassadoIso
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
