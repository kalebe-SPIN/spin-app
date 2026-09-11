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
  /** Kalebe 2026-09-06: reforma dos 4 cards do topo do PainelEquipeAdmin */
  cardProjetos: {
    abertos_mes: number       // total de projetos criados no mês
    com_proposta: number      // qtos leads têm ao menos uma proposta enviada
    valor_total: number       // soma das propostas (uma por lead: a de MENOR valor)
    /** Kalebe 2026-09-11: agrupa origem_lead em 3 baldes (campanha, pós-venda, prospecção direta). */
    por_origem: {
      campanha: number
      pos_venda: number
      prospeccao: number
    }
  }
  cardPerfil: {
    total_propostas: number   // total de propostas no mês (1 por lead)
    pj: number                // qtos PJ com proposta
    pf: number                // qtos PF com proposta
    /** Kalebe 2026-09-11: efetividade = quantos leads viraram proposta. */
    leads_pj_mes: number      // total PJ que entraram como lead no mês
    leads_pf_mes: number      // total PF que entraram como lead no mês
    leads_total_mes: number   // total de leads que entraram no mês (denominador)
    efetividade_pct: number   // propostas / leads_total_mes
    efetividade_pj_pct: number  // pj / leads_pj_mes
    efetividade_pf_pct: number  // pf / leads_pf_mes
  }
  cardNegocios: {
    /** Kalebe 2026-09-11: agora headline = fechados no mês + valor acumulado. */
    fechados_qtd: number           // qtd de projetos com status fechado + fechamento no mês
    fechados_valor: number         // soma pv_total desses fechados
    fechados_novos_qtd: number     // dos fechados, os que foram CRIADOS neste mês
    fechados_novos_valor: number
    fechados_antigos_qtd: number   // dos fechados, os que foram criados em meses anteriores
    fechados_antigos_valor: number
    em_negociacao: number          // projetos em STATUS_PROPOSTA hoje
    perdidos: number               // projetos perdidos no mês
    parados: number                // em negociação sem update há > 7 dias
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
  // Kalebe 2026-09-07: 'representante' é o perfil unificado (substituiu
  // 'vendedor_servicos'). Ambos os roles caem no bucket 'representantes'
  // pra compat com usuários legados que ainda não foram migrados no banco.
  // 'vendedoresServ' fica vazio pra não duplicar — bloco vai sumir da UI
  // se não houver ninguém com role exclusivamente 'vendedor_servicos'.
  // Kalebe 2026-09-10: tira o filtro por role no fetch — pega TODOS os
  // profiles ativos + inativos, pra depois no memória saber o nome de
  // qualquer consultor_id que apareça em projetos (mesmo role=consultor
  // fora dos 4 buckets originais, ou representantes desativados).
  const { data: perfis } = await supabase
    .from('profiles')
    .select('id, nome_completo, role, ativo')

  const perfilPorId = new Map<string, { nome: string; role: string }>()
  for (const p of perfis || []) {
    perfilPorId.set(p.id, { nome: p.nome_completo || 'Sem nome', role: p.role })
  }

  const admins = (perfis || []).filter((p) => p.role === 'admin' && p.ativo)
  // Representantes = role 'representante' (novo) + 'vendedor_servicos' (legado)
  const representantes = (perfis || []).filter(
    (p) => (p.role === 'representante' || p.role === 'vendedor_servicos') && p.ativo,
  )
  // vendedoresServ propositalmente vazio — o painel Client detecta length=0
  // e não renderiza o bloco. Legado unificado no bucket de representantes.
  const vendedoresServ: any[] = []
  const profissionaisCampo = (perfis || []).filter((p) => p.role === 'profissional_campo' && p.ativo)

  // Kalebe 2026-09-10: vendedoresSolar amplia adiante pra incluir QUALQUER
  // consultor_id que apareça em `todosProjetos` (mesmo com role='consultor'
  // ou desativado). Assim ninguém que já lançou projeto some do rank/soma.
  // A união final acontece depois do await das promises.
  const vendedoresSolar_base = [...admins, ...representantes]

  // ─── Puxa TODOS os projetos (não filtra por consultor_id) ─────────────────
  // Sem filtro pra não perder projetos criados por admins nem por representantes
  // que ficaram inativos depois. Filtra depois no memória agrupando por
  // consultor_id que aparece de fato.
  // Kalebe 2026-09-07: `tipos_projeto` (plural) NÃO existe na tabela.
  // Os tipos vêm de `projeto_itens.tipo` (relacional). Nested select
  // do PostgREST puxa os itens junto na mesma round-trip.
  // Kalebe 2026-09-09: painel consolidado da organização inteira.
  // Filtra excluida_em pra ignorar soft-deletes (migration 095) — projetos
  // deletados por engano ou arquivados não devem inflar contagens.
  // limit(10000) removê o cap default do PostgREST (1000), o que trunca
  // silenciosamente depois de mil registros. Se algum dia passar disso,
  // paginamos.
  const projetosPromise = supabase
    .from('projetos')
    .select(`
      id, consultor_id, cliente_id, cliente_razao_social, cliente_cpf_cnpj,
      status, pv_total, orcamento_final, tipo_projeto, ve_recarga_selecionada,
      origem_lead,
      created_at, updated_at, status_atualizado_em, excluida_em,
      projeto_itens(tipo, status)
    `)
    .is('excluida_em', null)
    .limit(10000)

  // Kalebe 2026-08-27: painel mostrava 0 pra Maria Eduarda porque só
  // buscava telhados de quem tem role vendedor_servicos. Como admins
  // (Kalebe) também cadastram telhados, buscamos TODOS e agrupamos
  // por quem realmente é o vendedor_id do registro.
  const telhadosPromise = supabase
    .from('telhados')
    .select('vendedor_id, fase, proposta_valor, created_at, updated_at')
    .limit(10000)

  // Kalebe 2026-09-09: painel consolidado — pega TODAS as OS concluídas
  // da organização, não só as com responsavel_id em profissionais_campo.
  // Um admin ou consultor que registrou execução também aparece agora.
  const execPromise = supabase
    .from('execucoes_servicos')
    .select('responsavel_id, valor_final, data_conclusao')
    .not('data_conclusao', 'is', null)
    .gte('data_conclusao', inicioMesPassadoIso)
    .limit(10000)

  const [{ data: projetosData }, { data: telhadosData }, { data: execData }] = await Promise.all([
    projetosPromise, telhadosPromise, execPromise,
  ])

  const todosProjetos = projetosData || []

  // Kalebe 2026-09-10: amplia vendedoresSolar com QUALQUER consultor_id
  // presente em todosProjetos que ainda não estava na lista base — assim
  // um role='consultor' comum, um representante desativado ou até um
  // usuário fora dos 4 buckets originais aparece no rank e nas somas.
  const idsJaListados = new Set(vendedoresSolar_base.map((v) => v.id))
  const idsConsultoresEmProjetos = new Set<string>()
  for (const p of todosProjetos) {
    if (p.consultor_id && !idsJaListados.has(p.consultor_id)) {
      idsConsultoresEmProjetos.add(p.consultor_id)
    }
  }
  const vendedoresExtras = (perfis || []).filter((p) => idsConsultoresEmProjetos.has(p.id))
  // Um consultor pode ter projetos MAS ter sido apagado do profiles (raro).
  // Cria stub pra ele não sumir da agregação.
  const idsExtrasComPerfil = new Set(vendedoresExtras.map((v) => v.id))
  for (const id of idsConsultoresEmProjetos) {
    if (!idsExtrasComPerfil.has(id)) {
      vendedoresExtras.push({ id, nome_completo: 'Sem cadastro', role: 'desconhecido', ativo: false } as any)
    }
  }
  const vendedoresSolar = [...vendedoresSolar_base, ...vendedoresExtras]

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
  // Kalebe 2026-09-07: deduplica por id (previne duplicata caso o mesmo
  // usuário caia em metricasRepres E metricasVend antes da unificação).
  const rankMap = new Map<string, LinhaRank>()
  for (const r of metricasRepres) {
    // Se o mesmo id já veio em metricasVend, soma as vendas de telhado
    const vendasTelhados = (telhadosData || [])
      .filter((t: any) => t.vendedor_id === r.id && t.fase === 'fechado' && (t.updated_at || '') >= inicioMesIso)
      .reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0)
    rankMap.set(r.id, {
      id: r.id,
      nome: r.nome,
      role: (perfilPorId.get(r.id)?.role === 'admin' ? 'admin' : 'representante') as 'representante' | 'admin',
      vendido: r.vendas_valor + vendasTelhados,
      em_proposta: r.propostas_enviadas,
      meta: 0,
    })
  }
  for (const v of metricasVend) {
    if (rankMap.has(v.id)) continue  // já contabilizado
    const vendasTelhados = (telhadosData || [])
      .filter((t: any) => t.vendedor_id === v.id && t.fase === 'fechado' && (t.updated_at || '') >= inicioMesIso)
      .reduce((s: number, t: any) => s + (Number(t.proposta_valor) || 0), 0)
    rankMap.set(v.id, {
      id: v.id,
      nome: v.nome,
      role: 'representante' as const,
      vendido: vendasTelhados,
      em_proposta: v.em_proposta,
      meta: 0,
    })
  }
  const rankVendedores: LinhaRank[] = Array.from(rankMap.values()).sort((a, b) => b.vendido - a.vendido)

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
    // Kalebe 2026-09-09: OS do mês agora conta TODAS as execuções da
    // organização (independente de role do responsável). Antes só somava
    // execuções dos profissionais_campo, então OS registradas por admin/
    // consultor sumiam do painel executivo.
    os_mes: (execData || []).filter((e: any) => e.data_conclusao >= inicioMesIso).length,
    os_mes_passado: execPassado.length,
  }

  // ═══════════════════════════════════════════════════════════
  // Kalebe 2026-09-06: 3 cards novos no topo (Projetos / Perfil / Negócios)
  // Kalebe 2026-09-10: reformulado. Antes os 3 cards filtravam por
  // projetosMes (created_at >= inicioMes) — o que mostrava só leads NOVOS
  // do mês. Consequência: um vendedor (Luciane) que fechou 4 negócios de
  // projetos criados em meses anteriores aparecia no Rank/Faturamento
  // (R$ 162.987) mas NÃO em "Negócios do mês: 2 fechadas". Card ficava
  // desconectado do resto do painel.
  //
  // Agora:
  //   - PROJETOS DO MÊS: continua com o vies AQUISIÇÃO (leads novos).
  //     Valor total = propostas emitidas dos leads novos + valor fechado
  //     neste mês de leads antigos, pra o número reforçar a leitura de
  //     "fluxo do mês" e não fico órfão do faturamento.
  //   - PERFIL DAS PROPOSTAS: passa a considerar TODAS as propostas
  //     ativas no mês (em negociação AGORA) + fechadas/perdidas este mês.
  //     Batê com a foto de "negócios que rodaram no mês".
  //   - NEGÓCIOS DO MÊS: idem — em_negociacao (globais AGORA), fechados
  //     do mês, perdidos do mês. Passa a bater com contratos_mes do
  //     Comparativo (8, não 2).
  // ═══════════════════════════════════════════════════════════
  const projetosMes = todosProjetos.filter((p: any) => p.created_at >= inicioMesIso)

  const STATUS_PROPOSTA_EMITIDA = new Set([
    'proposta_enviada', 'negociando', 'em_fechamento',
    'vendido', 'aceito', 'em_homologacao', 'em_execucao',
    'instalado', 'ativo_pos_venda', 'perdido',
  ])
  const STATUS_PERDIDOS = new Set(['perdido', 'perdida', 'cancelado', 'cancelada', 'desistiu'])
  const seteDiasAtras = Date.now() - 7 * 24 * 3600 * 1000

  // Card 1 — PROJETOS (aquisição do mês)
  //   abertos_mes: total de leads criados no mês
  //   com_proposta: qtos LEADS únicos criados no mês têm proposta
  //   valor_total: fechamentos do mês + valor propostas ativas de leads
  //                do mês (uma por lead, a de menor valor pra evitar dupla contagem)
  const propostasPorLeadMes = new Map<string, number[]>()
  for (const p of projetosMes) {
    if (!STATUS_PROPOSTA_EMITIDA.has(p.status)) continue
    const cid = String(p.cliente_id || p.cliente_razao_social || p.id)
    const valor = Number(p.pv_total || p.orcamento_final?.pv_total) || 0
    if (valor <= 0) continue
    const arr = propostasPorLeadMes.get(cid) || []
    arr.push(valor)
    propostasPorLeadMes.set(cid, arr)
  }
  // Fechamentos do mês (projetos, independentes de quando foram criados)
  const projetosFechadosMes = todosProjetos.filter((p: any) => isFechadoNoMes(p, inicioMesIso))
  const valorFechadoMes = projetosFechadosMes.reduce(
    (s: number, p: any) => s + (Number(p.pv_total) || 0),
    0,
  )
  // Kalebe 2026-09-11: breakdown por origem_lead → 3 baldes visuais.
  // Se origem_lead vier vazio (projetos antigos), cai como campanha (lead_spin
  // é o default do trigger em migration 104).
  const projetosPorOrigem = { campanha: 0, pos_venda: 0, prospeccao: 0 }
  for (const p of projetosMes) {
    const o = String(p.origem_lead || 'lead_spin')
    if (o === 'prospeccao') projetosPorOrigem.prospeccao += 1
    else if (o === 'resgate' || o === 'indicacao') projetosPorOrigem.pos_venda += 1
    else projetosPorOrigem.campanha += 1
  }
  const cardProjetos = {
    abertos_mes: projetosMes.length,
    com_proposta: propostasPorLeadMes.size,
    valor_total: valorFechadoMes,  // agora bate com faturamento por linha
    por_origem: projetosPorOrigem,
  }

  // Card 2 — PERFIL DAS PROPOSTAS
  // População: propostas ATIVAS agora (globais) + propostas fechadas/perdidas
  // NO MÊS. Uma linha por lead (dedupe por cliente_id). Preferência: o projeto
  // mais recentemente atualizado ganha a representação.
  const leadRepresentante = new Map<string, any>()
  const isPropostaAtivaOuDoMes = (p: any) => {
    if (!STATUS_PROPOSTA_EMITIDA.has(p.status)) return false
    // Ativa agora (em negociação, independente de data)
    if (STATUS_PROPOSTA.includes(p.status)) return true
    // Fechada/perdida NO MÊS
    const d = dataFechamento(p)
    if (!d || d < inicioMesIso) return false
    return true
  }
  for (const p of todosProjetos) {
    if (!isPropostaAtivaOuDoMes(p)) continue
    const cid = String(p.cliente_id || p.cliente_razao_social || p.id)
    const atual = leadRepresentante.get(cid)
    if (!atual) {
      leadRepresentante.set(cid, p)
      continue
    }
    const dAtual = new Date(atual.status_atualizado_em || atual.updated_at || 0).getTime()
    const dNovo = new Date(p.status_atualizado_em || p.updated_at || 0).getTime()
    if (dNovo > dAtual) leadRepresentante.set(cid, p)
  }
  // Kalebe 2026-09-11: Perfil das propostas ganha efetividade (propostas ÷ entradas)
  // e ratio PJ×PF. Tira o breakdown de tipo (on-grid/híbrido/etc).
  //
  // Helpers pra classificar PJ vs PF pelo doc do cliente.
  const isPJ = (p: any) =>
    String(p.cliente_cpf_cnpj || '').replace(/\D/g, '').length === 14

  // Denominador: leads únicos entrados no mês (dedupe por cliente_id).
  // Um cliente pode ter 2 projetos no mês; conta como 1 lead.
  const leadsPorCliente = new Map<string, any>()
  for (const p of projetosMes) {
    const cid = String(p.cliente_id || p.cliente_razao_social || p.id)
    if (!leadsPorCliente.has(cid)) leadsPorCliente.set(cid, p)
  }
  let leadsPj = 0
  let leadsPf = 0
  for (const p of leadsPorCliente.values()) {
    if (isPJ(p)) leadsPj += 1
    else leadsPf += 1
  }
  const leadsTotal = leadsPorCliente.size

  // Numerador: propostas emitidas — mesma lógica que já roda em leadRepresentante,
  // mas só considerando leads CUJOS projetos entraram no mês (dedupe por cliente).
  // O card mede efetividade do funil do mês; leads antigos com proposta viva
  // caem no card NEGÓCIOS, não aqui.
  let propostasPj = 0
  let propostasPf = 0
  let propostasTotal = 0
  const clientesComPropostaMes = new Set<string>()
  for (const p of projetosMes) {
    if (!STATUS_PROPOSTA_EMITIDA.has(p.status)) continue
    const cid = String(p.cliente_id || p.cliente_razao_social || p.id)
    if (clientesComPropostaMes.has(cid)) continue
    clientesComPropostaMes.add(cid)
    propostasTotal += 1
    if (isPJ(p)) propostasPj += 1
    else propostasPf += 1
  }

  const cardPerfil = {
    total_propostas: propostasTotal,
    pj: propostasPj,
    pf: propostasPf,
    leads_pj_mes: leadsPj,
    leads_pf_mes: leadsPf,
    leads_total_mes: leadsTotal,
    efetividade_pct: leadsTotal === 0 ? 0 : Math.round((propostasTotal / leadsTotal) * 100),
    efetividade_pj_pct: leadsPj === 0 ? 0 : Math.round((propostasPj / leadsPj) * 100),
    efetividade_pf_pct: leadsPf === 0 ? 0 : Math.round((propostasPf / leadsPf) * 100),
  }

  // Card 3 — NEGÓCIOS DO MÊS (Kalebe 2026-09-11: reformado)
  // Headline agora = FECHADOS no mês + valor acumulado. Contagem project-level
  // (não dedupe por cliente) pra bater com contratos_mes do Comparativo e com
  // Faturamento por linha. Split adicional: dos fechados no mês, quantos foram
  // de projetos CRIADOS no mês (venda rápida) × antigos.
  //
  //   Parado = sem update há > 7 dias E ainda em status ativo (proposta/negociando)
  let fechadosNovosQtd = 0
  let fechadosNovosValor = 0
  let fechadosAntigosQtd = 0
  let fechadosAntigosValor = 0
  for (const p of projetosFechadosMes) {
    const valor = Number(p.pv_total) || 0
    if (p.created_at >= inicioMesIso) {
      fechadosNovosQtd += 1
      fechadosNovosValor += valor
    } else {
      fechadosAntigosQtd += 1
      fechadosAntigosValor += valor
    }
  }

  // Contagem project-level dos status ativos e perdidos do mês
  const emNegociacaoTodos = todosProjetos.filter((p: any) =>
    STATUS_PROPOSTA.includes(p.status)
  )
  const perdidosDoMes = todosProjetos.filter((p: any) => {
    if (!STATUS_PERDIDOS.has(String(p.status || '').toLowerCase())) return false
    const d = dataFechamento(p)
    return d && d >= inicioMesIso
  })
  const paradosCount = emNegociacaoTodos.filter((p: any) => {
    const updated = new Date(p.status_atualizado_em || p.updated_at || p.created_at).getTime()
    return updated < seteDiasAtras
  }).length

  const cardNegocios = {
    fechados_qtd: projetosFechadosMes.length,
    fechados_valor: valorFechadoMes,
    fechados_novos_qtd: fechadosNovosQtd,
    fechados_novos_valor: fechadosNovosValor,
    fechados_antigos_qtd: fechadosAntigosQtd,
    fechados_antigos_valor: fechadosAntigosValor,
    em_negociacao: emNegociacaoTodos.length,
    perdidos: perdidosDoMes.length,
    parados: paradosCount,
  }

  return {
    representantes: metricasRepres,
    vendedoresServ: metricasVend,
    profissionaisCampo: metricasCampo,
    cardProjetos,
    cardPerfil,
    cardNegocios,
    totais: {
      projetos_criados: metricasRepres.reduce((s, r) => s + r.projetos_criados, 0),
      propostas_enviadas: metricasRepres.reduce((s, r) => s + r.propostas_enviadas, 0),
      contratos_assinados: metricasRepres.reduce((s, r) => s + r.contratos_assinados, 0),
      vendas_valor: metricasRepres.reduce((s, r) => s + r.vendas_valor, 0),
      telhados_prospectados: metricasVend.reduce((s, v) => s + v.telhados_prospectados + v.em_contato + v.em_proposta + v.fechados, 0),
      fechados_servicos: metricasVend.reduce((s, v) => s + v.fechados, 0),
      valor_propostas_servicos: metricasVend.reduce((s, v) => s + v.valor_propostas, 0),
      // Kalebe 2026-09-09: consolidado da organização — todas as execuções
      // do mês, independente do role de quem executou.
      os_executadas: (execData || []).filter((e: any) => e.data_conclusao >= inicioMesIso).length,
      faturamento_execucao: (execData || [])
        .filter((e: any) => e.data_conclusao >= inicioMesIso)
        .reduce((s: number, e: any) => s + (Number(e.valor_final) || 0), 0),
    },
    faturamentoPorLinha,
    funil,
    rankVendedores,
    comparativo,
  }
}
