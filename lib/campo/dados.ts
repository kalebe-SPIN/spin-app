import { createAdminClient } from '@/lib/supabase/admin'
import { STATUS_AGENDA, STATUS_DEMANDA, STATUS_FEITO, hojeBRT, type DiaCampo, type Demanda } from './comum'

/**
 * Carga do painel do campo (Kalebe 2026-10-05). Service role: o profissional
 * de campo não lê projetos pelo RLS — quem chama já conferiu o papel.
 *  - demandas: todas em aberto (pool de todos os profissionais de campo)
 *  - agenda: as dele (admin vê todas — inclusive as que pedem aprovação)
 *  - concluídos: últimos 45 dias
 *  - dias: dias de trabalho do mês (diárias) — dele; admin vê todos
 */
const CAMPOS = `id, os_numero, status, origem, tipo_servico, titulo, descricao, projeto_id,
  cliente_nome, contato_nome, contato_telefone, endereco, cidade, bairro, endereco_execucao,
  data_agendada, hora_agendada, responsavel_tecnico, aprovacao, vezes_reaberta, data_conclusao,
  projeto:projeto_id(codigo, cliente_razao_social, cliente_telefone)`

export async function carregarPainelCampo(userId: string, ehAdmin: boolean): Promise<
  { demandas: Demanda[]; agenda: Demanda[]; feitos: Demanda[]; dias: DiaCampo[]; mes: string; equipe: Array<{ id: string; nome: string }> } | { erro: string }
> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 45 * 86400_000).toISOString()
  const hoje = hojeBRT()
  const mes = hoje.slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const fimMes = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10)

  let qAgenda = admin.from('execucoes_servicos').select(CAMPOS).in('status', STATUS_AGENDA).order('data_agendada').limit(300)
  let qFeitos = admin.from('execucoes_servicos').select(CAMPOS).in('status', STATUS_FEITO).gte('data_conclusao', desde)
    .order('data_conclusao', { ascending: false }).limit(100)
  let qDias = admin.from('campo_agenda_dias')
    .select('id, profissional_id, data, status, servicos, servicos_previstos, servicos_concluidos, valor_diaria, tipo_diaria')
    .gte('data', `${mes}-01`).lte('data', fimMes).in('status', ['pendente', 'aprovada', 'fechada']).order('data')
  if (!ehAdmin) {
    qAgenda = qAgenda.eq('responsavel_tecnico', userId)
    qFeitos = qFeitos.eq('responsavel_tecnico', userId)
    qDias = qDias.eq('profissional_id', userId)
  }

  const [rDem, rAg, rFeitos, rDias, { data: perfis }] = await Promise.all([
    admin.from('execucoes_servicos').select(CAMPOS).in('status', STATUS_DEMANDA).order('created_at').limit(500),
    qAgenda,
    qFeitos,
    qDias,
    admin.from('profiles').select('id, nome_completo, role').eq('ativo', true).in('role', ['profissional_campo', 'instalador', 'admin']),
  ])
  const erro = rDem.error || rAg.error || rFeitos.error
  if (erro) {
    if (/aprovacao/.test(erro.message)) return { erro: 'Falta rodar a migration 138 (aprovação da agenda e diárias) no Supabase.' }
    return { erro: /column|does not exist/.test(erro.message) ? 'Falta rodar a migration 137 (painel do campo) no Supabase.' : erro.message }
  }
  if (rDias.error) return { erro: 'Falta rodar a migration 138 (aprovação da agenda e diárias) no Supabase.' }

  const nomes = new Map(((perfis || []) as any[]).map((p) => [p.id, p.nome_completo as string]))
  const mapear = (r: any): Demanda => ({
    id: r.id,
    os_numero: r.os_numero,
    status: r.status,
    origem: r.origem || 'projeto',
    tipo_servico: r.tipo_servico,
    titulo: r.titulo,
    descricao: r.descricao,
    projeto_id: r.projeto_id,
    projeto_codigo: r.projeto?.codigo || null,
    cliente_nome: r.cliente_nome || r.projeto?.cliente_razao_social || null,
    contato_nome: r.contato_nome,
    contato_telefone: r.contato_telefone || r.projeto?.cliente_telefone || null,
    endereco: r.endereco || (r.endereco_execucao ? { logradouro: r.endereco_execucao } : null),
    cidade: r.cidade,
    bairro: r.bairro,
    data_agendada: r.data_agendada,
    hora_agendada: r.hora_agendada ? String(r.hora_agendada).slice(0, 5) : null,
    responsavel_tecnico: r.responsavel_tecnico,
    responsavel_nome: r.responsavel_tecnico ? nomes.get(r.responsavel_tecnico) || null : null,
    aprovacao: r.aprovacao || null,
    vezes_reaberta: r.vezes_reaberta || 0,
    data_conclusao: r.data_conclusao,
  })

  // Dias abertos: concluídos contados ao vivo; fechados: o que a Bianca gravou
  const diasBrutos = (rDias.data || []) as any[]
  const idsAbertos = Array.from(new Set(diasBrutos.filter((d) => d.status !== 'fechada').flatMap((d) => d.servicos || [])))
  const feitosAbertos = new Set<string>()
  if (idsAbertos.length) {
    const { data } = await admin.from('execucoes_servicos').select('id, status').in('id', idsAbertos)
    for (const x of (data || []) as any[]) if (STATUS_FEITO.includes(x.status)) feitosAbertos.add(x.id)
  }
  const dias: DiaCampo[] = diasBrutos
    .filter((d) => d.status === 'fechada' || (d.servicos || []).length > 0)
    .map((d) => {
      const fechada = d.status === 'fechada'
      const servicos: string[] = d.servicos || []
      return {
        id: d.id,
        profissional_id: d.profissional_id,
        profissional_nome: nomes.get(d.profissional_id) || 'Profissional',
        data: d.data,
        status: d.status,
        previstos: fechada ? d.servicos_previstos || 0 : servicos.length,
        concluidos: fechada ? d.servicos_concluidos || 0 : servicos.filter((id) => feitosAbertos.has(id)).length,
        valor: fechada ? Number(d.valor_diaria) : null,
        tipo: fechada ? d.tipo_diaria : null,
      }
    })

  const equipe = ((perfis || []) as any[])
    .filter((p) => p.role !== 'admin')
    .map((p) => ({ id: p.id, nome: p.nome_completo || 'Sem nome' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return {
    demandas: ((rDem.data || []) as any[]).map(mapear),
    agenda: ((rAg.data || []) as any[]).map(mapear),
    feitos: ((rFeitos.data || []) as any[]).map(mapear),
    dias,
    mes,
    equipe,
  }
}
