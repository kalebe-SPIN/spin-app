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
}

/**
 * Snapshot da equipe comercial no mês corrente. Chamado em fetch inicial
 * pelo painel admin e depois a cada evento Realtime nas tabelas relevantes.
 * Uma única viagem ao Supabase por chamada (paralelismo interno).
 */
export async function buscarPainelEquipeAction(): Promise<PainelEquipe | { erro: string }> {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const inicioMes = new Date()
  inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const inicioMesIso = inicioMes.toISOString()

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
        .select('consultor_id, status, pv_total, created_at')
        .in('consultor_id', representantes.map((p) => p.id))
    : Promise.resolve({ data: [] as any[] })

  // ─── Vendedores de serviço — dados dos TELHADOS ───────────────────────────
  const telhadosPromise = vendedoresServ.length > 0
    ? supabase
        .from('telhados')
        .select('vendedor_id, fase, proposta_valor')
        .in('vendedor_id', vendedoresServ.map((p) => p.id))
    : Promise.resolve({ data: [] as any[] })

  // ─── Profissionais de campo — dados das EXECUÇÕES ─────────────────────────
  const execPromise = profissionaisCampo.length > 0
    ? supabase
        .from('execucoes_servicos')
        .select('responsavel_id, valor_final, data_conclusao')
        .in('responsavel_id', profissionaisCampo.map((p) => p.id))
        .not('data_conclusao', 'is', null)
        .gte('data_conclusao', inicioMesIso)
    : Promise.resolve({ data: [] as any[] })

  const [{ data: projetosData }, { data: telhadosData }, { data: execData }] = await Promise.all([
    projetosPromise, telhadosPromise, execPromise,
  ])

  // Agrega por consultor
  const metricasRepres: MetricasRepresentante[] = representantes.map((r) => {
    const meus = (projetosData || []).filter((p: any) => p.consultor_id === r.id)
    const meusMes = meus.filter((p: any) => p.created_at >= inicioMesIso)
    const proposta_enviada = meus.filter((p: any) => p.status === 'proposta_enviada')
    const fechados = meus.filter((p: any) =>
      ['contrato_assinado', 'homologacao', 'instalado', 'ativo_pos_venda'].includes(p.status)
    )
    return {
      id: r.id,
      nome: r.nome_completo || 'Sem nome',
      projetos_criados: meusMes.length,
      projetos_ativos: meus.filter((p: any) => p.status !== 'perdido' && p.status !== 'ativo_pos_venda').length,
      propostas_enviadas: proposta_enviada.length,
      contratos_assinados: fechados.length,
      vendas_valor: fechados.reduce((s: number, p: any) => s + (Number(p.pv_total) || 0), 0),
    }
  })

  // Agrega por vendedor_servicos
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

  // Agrega por profissional de campo
  const metricasCampo: MetricasProfissionalCampo[] = profissionaisCampo.map((c) => {
    const meus = (execData || []).filter((e: any) => e.responsavel_id === c.id)
    return {
      id: c.id,
      nome: c.nome_completo || 'Sem nome',
      os_executadas: meus.length,
      valor_faturado: meus.reduce((s: number, e: any) => s + (Number(e.valor_final) || 0), 0),
    }
  })

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
  }
}
