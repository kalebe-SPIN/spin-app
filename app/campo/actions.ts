'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checklistPadrao } from '@/lib/campo/checklists'
import { dataCurtaBR, hojeBRT, linhaEndereco, rotuloOs, type EnderecoCampo, type ItemChecklist } from '@/lib/campo/comum'
import { DIARIA_INTEGRAL } from '@/lib/campo/diarias'
import { getTituloTipo } from '@/lib/execucoes'
import { formatarMoedaBRL } from '@/lib/formatters'

/**
 * Painel do profissional de campo (Kalebe 2026-10-05): demandas, agenda e
 * ordem de serviço. Profissional de campo não lê projetos/clientes pelo RLS
 * — então as leituras e gravações daqui usam o service role DEPOIS de
 * conferir o papel (campo/instalador/admin) e, na OS, o responsável.
 */

type R<T = {}> = ({ sucesso: true } & T) | { erro: string }
const PAPEIS_CAMPO = ['profissional_campo', 'instalador', 'admin']
const MSG_MIG = 'Falta rodar a migration 137 (painel do campo) no Supabase.'
const MSG_MIG138 = 'Falta rodar a migration 138 (aprovação da agenda e diárias) no Supabase.'
const erroMig = (m: string) => (/column|origem|cidade|os_numero|checklist|assinatura|agenda_evento_id/.test(m) ? MSG_MIG : m)

async function exigirCampo() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as string, user: null, papel: null, nome: '' }
  const { data: p } = await supabase.from('profiles').select('role, ativo, nome_completo').eq('id', user.id).maybeSingle()
  if (!p?.ativo || !PAPEIS_CAMPO.includes(String(p.role))) return { erro: 'Área do profissional de campo', user: null, papel: null, nome: '' }
  return { erro: null, user, papel: String(p.role), nome: (p.nome_completo as string) || '' }
}

/** OS que o usuário pode mexer: responsável por ela (ou admin). */
async function exigirOs(id: string) {
  const c = await exigirCampo()
  if (c.erro || !c.user) return { ...c, os: null as any }
  const { data: os } = await createAdminClient().from('execucoes_servicos').select('*').eq('id', id).maybeSingle()
  if (!os) return { ...c, erro: 'Ordem de serviço não encontrada', os: null as any }
  if (c.papel !== 'admin' && os.responsavel_tecnico !== c.user.id) return { ...c, erro: 'Essa OS é de outro profissional', os: null as any }
  return { ...c, os }
}

function revalidar(id?: string) {
  revalidatePath('/campo')
  if (id) revalidatePath(`/campo/os/${id}`)
  revalidatePath('/agenda')
}

// ─── Demandas ───────────────────────────────────────────────────────────────

export async function criarDemandaAction(d: {
  tipo_servico: string
  cliente_nome: string
  contato_nome?: string
  contato_telefone: string
  endereco: EnderecoCampo
  descricao?: string
}): Promise<R<{ id: string }>> {
  const c = await exigirCampo()
  if (c.erro || !c.user) return { erro: c.erro || 'Não autenticado' }
  if (!d.tipo_servico) return { erro: 'Escolha o tipo de serviço' }
  if (!d.cliente_nome?.trim()) return { erro: 'Informe o cliente' }
  if (String(d.contato_telefone || '').replace(/\D/g, '').length < 10) return { erro: 'Telefone de contato com DDD' }
  if (!d.endereco?.cidade?.trim()) return { erro: 'Informe ao menos a cidade (é o filtro de região)' }

  // Vai direto pro quadro; o controle do admin é na aprovação da agenda do dia
  const { data, error } = await createAdminClient().from('execucoes_servicos').insert({
    origem: 'manual',
    tipo_servico: d.tipo_servico,
    titulo: `${getTituloTipo(d.tipo_servico)} — ${d.cliente_nome.trim()}`,
    descricao: d.descricao?.trim() || null,
    cliente_nome: d.cliente_nome.trim(),
    contato_nome: d.contato_nome?.trim() || null,
    contato_telefone: d.contato_telefone,
    endereco: d.endereco,
    cidade: d.endereco.cidade?.trim() || null,
    bairro: d.endereco.bairro?.trim() || null,
    endereco_execucao: linhaEndereco(d.endereco) || null,
    status: 'agendando',
    checklist: checklistPadrao(d.tipo_servico),
    criada_por: c.user.id,
  }).select('id').single()
  if (error || !data) return { erro: erroMig(error?.message || 'Falha ao cadastrar') }
  revalidar()
  return { sucesso: true, id: data.id }
}

/**
 * Dia de trabalho (campo_agenda_dias) depois de mexer nos serviços de
 * (profissional, data): `servicos` = aprovados; status 'pendente' enquanto
 * houver serviço esperando aprovação. Dia vazio some.
 */
async function sincronizarDia(
  admin: ReturnType<typeof createAdminClient>,
  profissional: string, data: string,
  mudar: { adicionarAprovados?: string[]; remover?: string; aprovadoPor?: string | null; motivo?: string | null } = {},
) {
  const agora = new Date().toISOString()
  const { data: dia } = await admin.from('campo_agenda_dias').select('id, servicos, status, solicitado_em')
    .eq('profissional_id', profissional).eq('data', data).maybeSingle()
  if (dia?.status === 'fechada') return
  let servicos: string[] = ((dia?.servicos || []) as string[]).filter((x) => x !== mudar.remover)
  for (const id of mudar.adicionarAprovados || []) if (!servicos.includes(id)) servicos.push(id)
  const { count: pendentes } = await admin.from('execucoes_servicos').select('id', { count: 'exact', head: true })
    .eq('responsavel_tecnico', profissional).eq('data_agendada', data).eq('aprovacao', 'pendente')

  if (!servicos.length && !pendentes) {
    if (!dia) return
    if (mudar.motivo !== undefined) {
      await admin.from('campo_agenda_dias').update({ servicos, status: 'recusada', motivo_recusa: mudar.motivo, updated_at: agora }).eq('id', dia.id)
    } else {
      await admin.from('campo_agenda_dias').delete().eq('id', dia.id)
    }
    return
  }
  const campos: Record<string, any> = {
    servicos,
    status: pendentes ? 'pendente' : 'aprovada',
    solicitado_em: pendentes ? (dia?.status === 'pendente' && dia.solicitado_em ? dia.solicitado_em : agora) : dia?.solicitado_em || null,
    updated_at: agora,
  }
  if (mudar.aprovadoPor) { campos.aprovado_por = mudar.aprovadoPor; campos.aprovado_em = agora }
  if (mudar.motivo !== undefined) campos.motivo_recusa = mudar.motivo
  if (dia) await admin.from('campo_agenda_dias').update(campos).eq('id', dia.id)
  else await admin.from('campo_agenda_dias').insert({ profissional_id: profissional, data, ...campos })
}

/** Serviço aprovado de hoje (ou de dia que já passou) só o admin mexe — é a base da diária. */
function travadoPelaDiaria(os: any, papel: string | null) {
  return papel !== 'admin' && os.aprovacao === 'aprovada' && !!os.data_agendada && os.data_agendada <= hojeBRT()
}

/**
 * Agendar = a demanda sai do quadro e vai pra agenda do profissional (evento
 * na agenda dele). Várias de uma vez: mesma região, mesmo dia.
 * Kalebe 2026-10-05: o profissional monta o dia e PEDE APROVAÇÃO — só o
 * admin aprova (agendamento feito pelo admin já nasce aprovado).
 */
export async function agendarDemandasAction(e: {
  ids: string[]
  data: string
  hora?: string | null
  responsavel_id?: string | null   // admin escolhe; o campo agenda pra si
}): Promise<R<{ agendadas: number; pendente: boolean }>> {
  const c = await exigirCampo()
  if (c.erro || !c.user) return { erro: c.erro || 'Não autenticado' }
  if (!e.ids?.length) return { erro: 'Marque ao menos um serviço' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data || '')) return { erro: 'Escolha a data' }
  if (e.data < hojeBRT()) return { erro: 'Escolha hoje ou uma data futura' }
  const hora = /^\d{2}:\d{2}$/.test(e.hora || '') ? e.hora! : '08:00'
  const ehAdmin = c.papel === 'admin'
  const responsavel = ehAdmin && e.responsavel_id ? e.responsavel_id : c.user.id

  const admin = createAdminClient()
  const { data: lista, error } = await admin.from('execucoes_servicos')
    .select('id, status, titulo, tipo_servico, projeto_id, cliente_nome, contato_telefone, endereco, endereco_execucao, cidade, os_numero, agenda_evento_id, data_agendada, responsavel_tecnico, aprovacao')
    .in('id', e.ids)
  if (error) return { erro: /aprovacao/.test(error.message) ? MSG_MIG138 : erroMig(error.message) }

  let agendadas = 0
  const aprovados: string[] = []
  const pedidos: any[] = []
  const diasAntigos: Array<[string, string, string]> = []
  for (const os of (lista || []) as any[]) {
    if (os.status === 'aguardando_pre_requisitos') continue   // venda ainda não liberada pelo admin
    if (!['agendando', 'agendado', 'cancelado'].includes(os.status)) continue
    if (travadoPelaDiaria(os, c.papel)) continue                 // aprovado de hoje: só o admin remaneja
    const mesmoDia = os.responsavel_tecnico === responsavel && os.data_agendada === e.data
    const aprovacao = ehAdmin || (mesmoDia && os.aprovacao === 'aprovada') ? 'aprovada' : 'pendente'
    if (os.responsavel_tecnico && os.data_agendada && !mesmoDia) diasAntigos.push([os.responsavel_tecnico, os.data_agendada, os.id])
    const local = linhaEndereco(os.endereco) || os.endereco_execucao || null
    const evento = {
      usuario_id: responsavel,
      titulo: `🔧 ${rotuloOs(os.os_numero)} · ${getTituloTipo(os.tipo_servico)} — ${os.cliente_nome || ''}`.trim(),
      descricao: [`Ordem de serviço: /campo/os/${os.id}`, os.contato_telefone ? `Contato: ${os.contato_telefone}` : null].filter(Boolean).join('\n'),
      data_hora_inicio: `${e.data}T${hora}:00-03:00`,
      local,
      tipo: 'servico_campo',
      projeto_id: os.projeto_id || null,
      cliente_nome: os.cliente_nome || null,
      status: aprovacao === 'aprovada' ? 'confirmado' : 'agendado',
      criado_por_usuario_id: c.user.id,
    }
    let eventoId = os.agenda_evento_id as string | null
    if (eventoId) {
      await admin.from('agenda_eventos').update(evento).eq('id', eventoId)
    } else {
      const { data: ev } = await admin.from('agenda_eventos').insert(evento).select('id').single()
      eventoId = ev?.id || null
    }
    const { error: eUp } = await admin.from('execucoes_servicos').update({
      status: 'agendado', data_agendada: e.data, hora_agendada: hora, aprovacao,
      responsavel_tecnico: responsavel, agenda_evento_id: eventoId, updated_at: new Date().toISOString(),
    }).eq('id', os.id)
    if (eUp) continue
    agendadas++
    if (aprovacao === 'aprovada') aprovados.push(os.id)
    else pedidos.push(os)
  }
  if (!agendadas) return { erro: 'Nenhum serviço pôde ser agendado (aguardando liberação, já em execução ou aprovado pra hoje)' }

  for (const [prof, dia, id] of diasAntigos) await sincronizarDia(admin, prof, dia, { remover: id })
  await sincronizarDia(admin, responsavel, e.data, { adicionarAprovados: aprovados, aprovadoPor: aprovados.length ? c.user.id : null })

  if (pedidos.length) {
    const cidades = Array.from(new Set(pedidos.map((o) => o.cidade).filter(Boolean))).join(', ')
    const { avisarEquipe } = await import('@/lib/agentes/diretorio')
    await avisarEquipe({
      agente: 'bianca',
      mensagem: `${c.nome.split(' ')[0] || 'Campo'} montou a agenda de ${dataCurtaBR(e.data)} e pede aprovação: ${pedidos.length} serviço(s)${cidades ? ` em ${cidades}` : ''}. Aprove em /campo.`,
    }).catch(() => {})
  }
  revalidar()
  return { sucesso: true, agendadas, pendente: pedidos.length > 0 }
}

/** Admin aprova os serviços que o profissional pediu pra um dia. */
export async function aprovarAgendaAction(e: { profissional_id: string; data: string }): Promise<R<{ aprovados: number }>> {
  const c = await exigirCampo()
  if (c.erro || !c.user) return { erro: c.erro || 'Não autenticado' }
  if (c.papel !== 'admin') return { erro: 'Só o admin aprova a agenda do campo' }
  const admin = createAdminClient()
  const { data: pend, error } = await admin.from('execucoes_servicos').select('id, agenda_evento_id')
    .eq('responsavel_tecnico', e.profissional_id).eq('data_agendada', e.data).eq('aprovacao', 'pendente')
  if (error) return { erro: /aprovacao/.test(error.message) ? MSG_MIG138 : error.message }
  const lista = (pend || []) as Array<{ id: string; agenda_evento_id: string | null }>
  if (!lista.length) return { erro: 'Nada esperando aprovação nesse dia' }

  await admin.from('execucoes_servicos').update({ aprovacao: 'aprovada', updated_at: new Date().toISOString() }).in('id', lista.map((x) => x.id))
  const eventos = lista.map((x) => x.agenda_evento_id).filter(Boolean) as string[]
  if (eventos.length) await admin.from('agenda_eventos').update({ status: 'confirmado' }).in('id', eventos)
  await sincronizarDia(admin, e.profissional_id, e.data, { adicionarAprovados: lista.map((x) => x.id), aprovadoPor: c.user.id })

  const { avisarUsuario } = await import('@/lib/agentes/diretorio')
  await avisarUsuario({
    destinatario_id: e.profissional_id,
    agente: 'bianca',
    titulo: 'Agenda aprovada',
    mensagem: `Sua agenda de ${dataCurtaBR(e.data)} foi aprovada: ${lista.length} serviço(s). Diária integral (${formatarMoedaBRL(DIARIA_INTEGRAL)}) concluindo todos; o que não for concluído volta pras demandas. Abra cada OS em /campo.`,
  }).catch(() => {})
  revalidar()
  return { sucesso: true, aprovados: lista.length }
}

/** Admin recusa o pedido: os serviços pedidos voltam pras demandas. */
export async function recusarAgendaAction(e: { profissional_id: string; data: string; motivo?: string }): Promise<R<{ devolvidos: number }>> {
  const c = await exigirCampo()
  if (c.erro || !c.user) return { erro: c.erro || 'Não autenticado' }
  if (c.papel !== 'admin') return { erro: 'Só o admin aprova a agenda do campo' }
  const admin = createAdminClient()
  const { data: pend, error } = await admin.from('execucoes_servicos').select('id, agenda_evento_id')
    .eq('responsavel_tecnico', e.profissional_id).eq('data_agendada', e.data).eq('aprovacao', 'pendente')
  if (error) return { erro: /aprovacao/.test(error.message) ? MSG_MIG138 : error.message }
  const lista = (pend || []) as Array<{ id: string; agenda_evento_id: string | null }>
  if (!lista.length) return { erro: 'Nada esperando aprovação nesse dia' }

  await admin.from('execucoes_servicos').update({
    status: 'agendando', data_agendada: null, hora_agendada: null, responsavel_tecnico: null,
    agenda_evento_id: null, aprovacao: null, updated_at: new Date().toISOString(),
  }).in('id', lista.map((x) => x.id))
  const eventos = lista.map((x) => x.agenda_evento_id).filter(Boolean) as string[]
  if (eventos.length) await admin.from('agenda_eventos').update({ status: 'cancelado' }).in('id', eventos)
  const motivo = e.motivo?.trim() || null
  await sincronizarDia(admin, e.profissional_id, e.data, { motivo })

  const { avisarUsuario } = await import('@/lib/agentes/diretorio')
  await avisarUsuario({
    destinatario_id: e.profissional_id,
    agente: 'bianca',
    titulo: 'Agenda não aprovada',
    mensagem: `A agenda de ${dataCurtaBR(e.data)} não foi aprovada${motivo ? ` (${motivo})` : ''}. ${lista.length} serviço(s) voltaram pras demandas em /campo.`,
  }).catch(() => {})
  revalidar()
  return { sucesso: true, devolvidos: lista.length }
}

/**
 * Liberar = a demanda que nasceu da venda (pré-requisitos ok) pode ser
 * agendada. Kalebe 2026-10-05: SÓ O ADMIN libera serviço de campo.
 */
export async function liberarDemandasAction(ids: string[]): Promise<R<{ liberadas: number }>> {
  const c = await exigirCampo()
  if (c.erro || !c.user) return { erro: c.erro || 'Não autenticado' }
  if (c.papel !== 'admin') return { erro: 'Só o admin libera serviço de campo' }
  if (!ids?.length) return { erro: 'Nenhuma demanda escolhida' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('execucoes_servicos')
    .update({ status: 'agendando', updated_at: new Date().toISOString() })
    .in('id', ids).eq('status', 'aguardando_pre_requisitos')
    .select('id')
  if (error) return { erro: error.message }
  const liberadas = (data || []) as Array<{ id: string }>
  if (liberadas.length) {
    await admin.from('execucoes_status_historico').insert(liberadas.map((x) => ({
      execucao_id: x.id, status_anterior: 'aguardando_pre_requisitos', status_novo: 'agendando',
      observacoes: 'Liberada pelo admin no painel do campo', usuario_id: c.user!.id,
    })))
  }
  revalidar()
  return { sucesso: true, liberadas: liberadas.length }
}

/** Tira da agenda e devolve pras demandas. */
export async function desmarcarAction(id: string): Promise<R> {
  const c = await exigirOs(id)
  if (c.erro || !c.os) return { erro: c.erro || 'Sem permissão' }
  if (!['agendado', 'preparando_material'].includes(c.os.status)) return { erro: 'Só dá pra desmarcar serviço agendado' }
  if (travadoPelaDiaria(c.os, c.papel)) return { erro: 'Serviço aprovado pra hoje — se não der pra fazer, ele volta sozinho pras demandas amanhã (ou peça ao admin).' }
  const admin = createAdminClient()
  if (c.os.agenda_evento_id) await admin.from('agenda_eventos').update({ status: 'cancelado' }).eq('id', c.os.agenda_evento_id)
  await admin.from('execucoes_servicos').update({
    status: 'agendando', data_agendada: null, hora_agendada: null, responsavel_tecnico: null,
    agenda_evento_id: null, aprovacao: null, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (c.os.responsavel_tecnico && c.os.data_agendada) await sincronizarDia(admin, c.os.responsavel_tecnico, c.os.data_agendada, { remover: id })
  revalidar(id)
  return { sucesso: true }
}

// ─── Ordem de serviço ───────────────────────────────────────────────────────

export async function iniciarOsAction(id: string): Promise<R> {
  const c = await exigirOs(id)
  if (c.erro || !c.os) return { erro: c.erro || 'Sem permissão' }
  if (!['agendado', 'preparando_material', 'em_execucao'].includes(c.os.status)) return { erro: 'Essa OS não está na agenda' }
  // Kalebe 2026-10-05: só executa o que o admin aprovou, no dia aprovado (base da diária)
  if (c.papel !== 'admin') {
    if (c.os.aprovacao !== 'aprovada') return { erro: 'Aguardando o admin aprovar a agenda desse dia' }
    if (c.os.data_agendada !== hojeBRT()) return { erro: `Essa OS está aprovada pra ${dataCurtaBR(c.os.data_agendada)}` }
  }
  const admin = createAdminClient()
  const checklist = Array.isArray(c.os.checklist) && c.os.checklist.length ? c.os.checklist : checklistPadrao(c.os.tipo_servico)
  await admin.from('execucoes_servicos').update({
    status: 'em_execucao', data_inicio_real: c.os.data_inicio_real || new Date().toISOString(),
    checklist, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (c.os.agenda_evento_id) await admin.from('agenda_eventos').update({ status: 'em_andamento' }).eq('id', c.os.agenda_evento_id)
  revalidar(id)
  return { sucesso: true }
}

export async function salvarOsAction(id: string, d: { checklist?: ItemChecklist[]; observacoes?: string; problemas?: string }): Promise<R> {
  const c = await exigirOs(id)
  if (c.erro || !c.os) return { erro: c.erro || 'Sem permissão' }
  if (STATUS_FECHADO.includes(c.os.status)) return { erro: 'OS já concluída' }
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (d.checklist) patch.checklist = d.checklist.map((i) => ({ item: String(i.item), feito: !!i.feito, obs: i.obs?.trim() || null }))
  if (d.observacoes !== undefined) patch.observacoes = d.observacoes.trim() || null
  if (d.problemas !== undefined) patch.problemas_encontrados = d.problemas.trim() || null
  const { error } = await createAdminClient().from('execucoes_servicos').update(patch).eq('id', id)
  if (error) return { erro: erroMig(error.message) }
  return { sucesso: true }
}
const STATUS_FECHADO = ['concluido', 'entregue', 'pos_venda', 'cancelado']

/** Foto antes/depois (já reduzida no celular) → bucket privado ordens-servico. */
export async function enviarFotoOsAction(fd: FormData): Promise<R<{ caminho: string }>> {
  const id = String(fd.get('id') || '')
  const momento = fd.get('momento') === 'depois' ? 'depois' : 'antes'
  const arquivo = fd.get('arquivo')
  const c = await exigirOs(id)
  if (c.erro || !c.os) return { erro: c.erro || 'Sem permissão' }
  if (!(arquivo instanceof Blob) || !arquivo.size) return { erro: 'Escolha a foto' }
  const admin = createAdminClient()
  const caminho = `${id}/${momento}-${randomUUID()}.jpg`
  const { error } = await admin.storage.from('ordens-servico').upload(caminho, Buffer.from(await arquivo.arrayBuffer()), { contentType: 'image/jpeg' })
  if (error) return { erro: /bucket/i.test(error.message) ? MSG_MIG : error.message }
  const coluna = momento === 'depois' ? 'fotos_depois_urls' : 'fotos_antes_urls'
  await admin.from('execucoes_servicos').update({ [coluna]: [...(c.os[coluna] || []), caminho], updated_at: new Date().toISOString() }).eq('id', id)
  revalidar(id)
  return { sucesso: true, caminho }
}

/** Links temporários (10 min) pras fotos/assinatura de uma OS. */
export async function urlsArquivosOsAction(id: string, caminhos: string[]): Promise<R<{ urls: Record<string, string> }>> {
  const c = await exigirOs(id)
  if (c.erro || !c.os) return { erro: c.erro || 'Sem permissão' }
  const validos = caminhos.filter((p) => p.startsWith(`${id}/`))
  if (!validos.length) return { sucesso: true, urls: {} }
  const { data } = await createAdminClient().storage.from('ordens-servico').createSignedUrls(validos, 600)
  const urls: Record<string, string> = {}
  for (const x of data || []) if (x.path && x.signedUrl) urls[x.path] = x.signedUrl
  return { sucesso: true, urls }
}

/**
 * Custo extra da OS (Kalebe 2026-10-02: "registrar custos extras
 * contabilizados ao projeto"). Entra no fluxo de caixa como saída PREVISTA
 * de custo do projeto (o admin confere e efetiva/reembolsa) e avisa os admins.
 */
export async function registrarCustoExtraAction(fd: FormData): Promise<R> {
  const id = String(fd.get('id') || '')
  const c = await exigirOs(id)
  if (c.erro || !c.os || !c.user) return { erro: c.erro || 'Sem permissão' }
  const descricao = String(fd.get('descricao') || '').trim()
  const valor = Math.round(Number(String(fd.get('valor') || '').replace(/\./g, '').replace(',', '.')) * 100) / 100
  const pagoPor = fd.get('pago_por') === 'empresa' ? 'empresa' : 'profissional'
  if (!descricao) return { erro: 'Descreva o custo (ex.: "parafusos extras", "pedágio")' }
  if (!(valor > 0)) return { erro: 'Informe o valor' }

  const admin = createAdminClient()
  let comprovante: string | null = null
  const arquivo = fd.get('arquivo')
  if (arquivo instanceof Blob && arquivo.size) {
    const caminho = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.jpg`
    const { error } = await admin.storage.from('comprovantes').upload(caminho, Buffer.from(await arquivo.arrayBuffer()), { contentType: 'image/jpeg' })
    if (!error) comprovante = caminho
  }
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const { error } = await admin.from('fluxo_lancamentos').insert({
    direcao: 'saida',
    grupo: 'custos_projeto',
    descricao: `Custo extra ${rotuloOs(c.os.os_numero)} — ${descricao}`,
    valor_previsto: valor,
    data_prevista: hoje,
    projeto_id: c.os.projeto_id || null,
    origem: 'manual',
    criado_por: c.user.id,
    detalhes: {
      origem_campo: true, execucao_id: id, os_numero: c.os.os_numero, pago_por: pagoPor,
      registrado_por: c.user.id, registrado_por_nome: c.nome,
      ...(c.os.item_id ? { servico_item_id: c.os.item_id, servico: getTituloTipo(c.os.tipo_servico) } : {}),
      ...(c.os.cliente_nome ? { projeto_rotulo: c.os.cliente_nome } : {}),
      ...(comprovante ? { comprovante } : {}),
    },
  })
  if (error) return { erro: error.message }

  const { avisarEquipe } = await import('@/lib/agentes/diretorio')
  await avisarEquipe({
    agente: 'bianca',
    mensagem: `${c.nome.split(' ')[0] || 'Campo'} registrou custo extra de ${formatarMoedaBRL(valor)} na ${rotuloOs(c.os.os_numero)} (${c.os.cliente_nome || c.os.titulo}): ${descricao}${pagoPor === 'profissional' ? ' — pago pelo profissional (reembolsar)' : ''}. Está previsto no fluxo de caixa.`,
    projeto_id: c.os.projeto_id || null,
  }).catch(() => {})
  revalidar(id)
  return { sucesso: true }
}

/** Custos extras já lançados nesta OS (pra listar na tela). */
export async function custosDaOsAction(id: string): Promise<R<{ custos: Array<{ id: string; descricao: string; valor: number; pago_por: string }> }>> {
  const c = await exigirOs(id)
  if (c.erro || !c.os) return { erro: c.erro || 'Sem permissão' }
  const { data } = await createAdminClient().from('fluxo_lancamentos')
    .select('id, descricao, valor_previsto, detalhes').contains('detalhes', { execucao_id: id }).is('cancelado_em', null)
  return {
    sucesso: true,
    custos: ((data || []) as any[]).map((l) => ({ id: l.id, descricao: l.descricao, valor: Number(l.valor_previsto), pago_por: l.detalhes?.pago_por || '' })),
  }
}

/**
 * Concluir a OS: checklist completo + assinatura do cliente (PNG do canvas).
 * Vira 'concluido', a agenda marca "realizado" e os admins são avisados.
 */
export async function concluirOsAction(fd: FormData): Promise<R> {
  const id = String(fd.get('id') || '')
  const c = await exigirOs(id)
  if (c.erro || !c.os || !c.user) return { erro: c.erro || 'Sem permissão' }
  if (STATUS_FECHADO.includes(c.os.status)) return { erro: 'OS já concluída' }
  const nome = String(fd.get('nome') || '').trim()
  const documento = String(fd.get('documento') || '').replace(/\D/g, '')
  const assinatura = fd.get('assinatura')
  const checklist = (Array.isArray(c.os.checklist) ? c.os.checklist : []) as ItemChecklist[]
  const pendentes = checklist.filter((i) => !i.feito)
  if (pendentes.length) return { erro: `Faltam ${pendentes.length} item(ns) do checklist — marque ou explique na observação do item` }
  if (!nome) return { erro: 'Nome de quem assina' }
  if (!(assinatura instanceof Blob) || assinatura.size < 500) return { erro: 'Peça pro cliente assinar no quadro' }

  const admin = createAdminClient()
  const caminho = `${id}/assinatura-${Date.now()}.png`
  const { error: eUp } = await admin.storage.from('ordens-servico').upload(caminho, Buffer.from(await assinatura.arrayBuffer()), { contentType: 'image/png' })
  if (eUp) return { erro: /bucket/i.test(eUp.message) ? MSG_MIG : eUp.message }

  const agora = new Date().toISOString()
  const { error } = await admin.from('execucoes_servicos').update({
    status: 'concluido', data_conclusao: agora,
    cliente_aceitou: true, assinatura_path: caminho, assinatura_nome: nome,
    assinatura_documento: documento || null, assinado_em: agora,
    aceite_texto: `Assinado por ${nome}${documento ? ` (${documento})` : ''} no local, em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    updated_at: agora,
  }).eq('id', id)
  if (error) return { erro: erroMig(error.message) }
  if (c.os.agenda_evento_id) await admin.from('agenda_eventos').update({ status: 'realizado' }).eq('id', c.os.agenda_evento_id)

  const { avisarEquipe } = await import('@/lib/agentes/diretorio')
  await avisarEquipe({
    agente: 'bianca',
    mensagem: `✅ ${rotuloOs(c.os.os_numero)} concluída por ${c.nome.split(' ')[0] || 'campo'}: ${c.os.titulo}. Cliente ${nome} assinou.`,
    projeto_id: c.os.projeto_id || null,
  }).catch(() => {})
  revalidar(id)
  return { sucesso: true }
}
