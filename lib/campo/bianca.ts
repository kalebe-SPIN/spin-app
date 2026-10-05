import type { SupabaseClient } from '@supabase/supabase-js'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { getTituloTipo } from '@/lib/execucoes'
import { formatarMoedaBRL } from '@/lib/formatters'
import { STATUS_FEITO, dataCurtaBR, hojeBRT, rotuloOs } from './comum'
import { calcularDiaria } from './diarias'

/**
 * Bianca no campo (Kalebe 2026-10-05) — roda no cron diário (~7h):
 *  1. Fecha a diária dos dias que passaram: R$ 100 se concluiu todos os
 *     serviços aprovados do dia, R$ 70 se não.
 *  2. O que não foi executado no dia (agendado, aguardando aprovação ou
 *     iniciado sem concluir) volta pras demandas — sem data e sem dono.
 *  3. Cada profissional recebe UMA mensagem: diária de ontem, o que voltou
 *     pras demandas e os serviços de hoje.
 *  4. O admin (único que libera e aprova) recebe o que está esperando por ele.
 */

type Recados = Map<string, string[]>
const anotar = (m: Recados, pessoa: string, linha: string) => m.set(pessoa, [...(m.get(pessoa) || []), linha])
const linhaOs = (o: any) => `${rotuloOs(o.os_numero)} ${getTituloTipo(o.tipo_servico)} — ${o.cliente_nome || o.titulo}`

export async function fecharDiarias(admin: SupabaseClient, recados: Recados) {
  const hoje = hojeBRT()
  const { data, error } = await admin.from('campo_agenda_dias')
    .select('id, profissional_id, data, status, servicos').in('status', ['pendente', 'aprovada']).lt('data', hoje)
  if (error) return { tarefa: 'campo_diarias', erro: error.message }

  let fechadas = 0
  for (const dia of (data || []) as any[]) {
    const ids: string[] = dia.servicos || []
    if (!ids.length) {   // nada aprovado nesse dia → não conta diária
      await admin.from('campo_agenda_dias').update({ status: 'expirada', updated_at: new Date().toISOString() }).eq('id', dia.id)
      continue
    }
    const { data: svs } = await admin.from('execucoes_servicos').select('id, status, data_conclusao').in('id', ids)
    // Concluído = concluído até o fim do dia aprovado (horário de Brasília)
    const concluidos = ((svs || []) as any[]).filter((s) => STATUS_FEITO.includes(s.status) && s.data_conclusao
      && new Date(s.data_conclusao).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) <= dia.data).length
    const { valor, tipo } = calcularDiaria(ids.length, concluidos)
    const { error: e } = await admin.from('campo_agenda_dias').update({
      status: 'fechada', servicos_previstos: ids.length, servicos_concluidos: concluidos,
      valor_diaria: valor, tipo_diaria: tipo, fechado_em: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', dia.id)
    if (e) continue
    fechadas++
    anotar(recados, dia.profissional_id, `Diária de ${dataCurtaBR(dia.data)}: ${formatarMoedaBRL(valor)} (${concluidos} de ${ids.length} serviço(s) concluído(s)${tipo === 'integral' ? ' — integral' : ''}).`)
  }
  return { tarefa: 'campo_diarias', fechadas }
}

export async function reabrirServicosVencidos(admin: SupabaseClient, recados: Recados) {
  const hoje = hojeBRT()
  const { data, error } = await admin.from('execucoes_servicos')
    .select('id, os_numero, tipo_servico, titulo, cliente_nome, data_agendada, responsavel_tecnico, agenda_evento_id, vezes_reaberta')
    .in('status', ['agendado', 'preparando_material', 'em_execucao'])
    .lt('data_agendada', hoje)
  if (error) return { tarefa: 'campo_reabrir', erro: error.message }

  let reabertos = 0
  for (const os of (data || []) as any[]) {
    // checklist, fotos e custos ficam na OS — quem pegar de novo continua de onde parou
    const { error: e } = await admin.from('execucoes_servicos').update({
      status: 'agendando', data_agendada: null, hora_agendada: null, responsavel_tecnico: null,
      agenda_evento_id: null, aprovacao: null, vezes_reaberta: (os.vezes_reaberta || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', os.id)
    if (e) continue
    reabertos++
    if (os.agenda_evento_id) await admin.from('agenda_eventos').update({ status: 'adiado' }).eq('id', os.agenda_evento_id)
    if (os.responsavel_tecnico) anotar(recados, os.responsavel_tecnico, `↩ ${linhaOs(os)} (era ${dataCurtaBR(os.data_agendada)})`)
  }
  return { tarefa: 'campo_reabrir', encontrados: (data || []).length, reabertos }
}

export async function resumoDoDiaCampo(admin: SupabaseClient, diarias: Recados, voltaram: Recados) {
  const hoje = hojeBRT()
  const { data, error } = await admin.from('execucoes_servicos')
    .select('id, os_numero, tipo_servico, titulo, cliente_nome, bairro, cidade, hora_agendada, responsavel_tecnico, aprovacao')
    .in('status', ['agendado', 'preparando_material']).eq('data_agendada', hoje)
    .not('responsavel_tecnico', 'is', null)
  if (error) return { tarefa: 'campo_resumo', erro: error.message }

  const deHoje: Recados = new Map()
  for (const o of ((data || []) as any[]).sort((a, b) => String(a.hora_agendada || '').localeCompare(String(b.hora_agendada || '')))) {
    const onde = [o.bairro, o.cidade].filter(Boolean).join(', ')
    anotar(deHoje, o.responsavel_tecnico, `• ${o.hora_agendada ? String(o.hora_agendada).slice(0, 5) + ' ' : ''}${linhaOs(o)}${onde ? ` (${onde})` : ''}${o.aprovacao === 'pendente' ? ' ⏳ aguardando aprovação' : ''}`)
  }

  const pessoas = new Set([...Array.from(diarias.keys()), ...Array.from(voltaram.keys()), ...Array.from(deHoje.keys())])
  let enviados = 0
  for (const pessoa of Array.from(pessoas)) {
    // Uma vez por dia (o cron pode ser chamado de novo na mão)
    const { count } = await admin.from('avisos_internos').select('id', { count: 'exact', head: true })
      .eq('destinatario_id', pessoa).eq('titulo', 'Seu dia no campo').gte('created_at', `${hoje}T00:00:00-03:00`)
    if (count) continue
    const hojeLista = deHoje.get(pessoa) || []
    const partes = [
      'Bom dia!',
      ...(diarias.get(pessoa) || []),
      voltaram.get(pessoa)?.length ? `Não foram concluídos e voltaram pras demandas:\n${voltaram.get(pessoa)!.join('\n')}` : null,
      hojeLista.length ? `Hoje você tem ${hojeLista.length} serviço(s):\n${hojeLista.join('\n')}` : 'Hoje você não tem serviço agendado — monte sua agenda em /campo.',
      hojeLista.length ? 'Abra cada OS em /campo e siga o checklist.' : null,
    ].filter(Boolean)
    const r = await avisarUsuario({
      destinatario_id: pessoa,
      agente: 'bianca',
      titulo: 'Seu dia no campo',
      mensagem: partes.join('\n\n'),
    }).catch(() => ({ sucesso: false }))
    if (r.sucesso) enviados++
  }
  return { tarefa: 'campo_resumo', profissionais: pessoas.size, enviados }
}

/** O admin libera serviço e aprova agenda — lembrete diário do que espera por ele. */
export async function lembreteAdminCampo(admin: SupabaseClient) {
  const hoje = hojeBRT()
  const [{ data: travadas, error }, { data: pedidos }] = await Promise.all([
    admin.from('execucoes_servicos').select('id, cidade').eq('status', 'aguardando_pre_requisitos'),
    admin.from('campo_agenda_dias').select('id, data').eq('status', 'pendente').gte('data', hoje),
  ])
  if (error) return { tarefa: 'campo_admin', erro: error.message }
  const nTravadas = (travadas || []).length
  const nPedidos = (pedidos || []).length
  if (!nTravadas && !nPedidos) return { tarefa: 'campo_admin', pendentes: 0 }

  const porCidade = new Map<string, number>()
  for (const d of (travadas || []) as Array<{ cidade: string | null }>) {
    const c = d.cidade?.trim() || 'sem cidade'
    porCidade.set(c, (porCidade.get(c) || 0) + 1)
  }
  const cidades = Array.from(porCidade.entries()).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).join(', ')
  const mensagem = [
    nPedidos ? `${nPedidos} agenda(s) de campo esperando sua aprovação.` : null,
    nTravadas ? `${nTravadas} serviço(s) vendido(s) esperando liberação: ${cidades}.` : null,
    'Resolva em /campo.',
  ].filter(Boolean).join(' ')

  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin').eq('ativo', true)
  let enviados = 0
  for (const a of (admins || []) as Array<{ id: string }>) {
    const { count } = await admin.from('avisos_internos').select('id', { count: 'exact', head: true })
      .eq('destinatario_id', a.id).eq('titulo', 'Campo esperando você').gte('created_at', `${hoje}T00:00:00-03:00`)
    if (count) continue
    const r = await avisarUsuario({ destinatario_id: a.id, agente: 'bianca', titulo: 'Campo esperando você', mensagem })
      .catch(() => ({ sucesso: false }))
    if (r.sucesso) enviados++
  }
  return { tarefa: 'campo_admin', pedidos: nPedidos, travadas: nTravadas, enviados }
}

/** Ordem certa da rotina diária do campo (chamada pelo cron da Bianca). */
export async function rotinaDiariaCampo(admin: SupabaseClient) {
  const diarias: Recados = new Map()
  const voltaram: Recados = new Map()
  return [
    await fecharDiarias(admin, diarias),
    await reabrirServicosVencidos(admin, voltaram),
    await resumoDoDiaCampo(admin, diarias, voltaram),
    await lembreteAdminCampo(admin),
  ]
}
