'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { URL_PORTAL } from '@/lib/agentes/nomes'
import { TIPOS_EVENTO, rotuloTipoEvento, type TipoEvento } from '@/lib/agenda/tipos-evento'
import { primeiroNomePerfil, registrarAgendaNaConversa, type RegistroAgenda } from '@/lib/spinzap/registro-agenda'

/**
 * Agenda a partir da conversa (Kalebe 2026-09-29): tarefa, evento ou
 * follow-up que a Bianca executa na própria conversa.
 * Kalebe 2026-10-13: escolhe o RESPONSÁVEL (qualquer usuário ativo) — o item
 * vai pra agenda dele e ele recebe o aviso (WhatsApp + sino). Evento ganhou
 * "Call" (sala de vídeo gerada) e "Reunião externa" (endereço obrigatório),
 * lembrete antes e mensagem de acompanhamento depois
 * (lib/agenda/lembretes-eventos.ts, no cron de 1 em 1 minuto).
 * Acesso: só agenda em conversa que o usuário enxerga (RLS); a gravação vai
 * pelo service role porque a agenda é de outra pessoa.
 */

export type ItemAgendaConversa = {
  id: string
  tipo: 'followup' | 'tarefa' | 'evento'
  /** follow-up que é lembrete ao cliente (não cancela se ele responder) */
  lembrete?: boolean
  titulo: string
  quando: string | null
  status: string
  detalhe: string | null
  responsavel: string | null
  /** Kalebe 2026-10-15: valores crus pra editar na própria lista */
  edicao: { titulo?: string; mensagem?: string; modo?: string; local?: string | null }
}

async function conversaAcessivel(conversaId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as string, supabase, user: null, conv: null }
  const { data: conv } = await supabase
    .from('wa_conversas')
    .select('id, contato:contato_id(nome_exibicao, telefone, projeto_id)')
    .eq('id', conversaId)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' as string, supabase, user, conv: null }
  return { erro: null, supabase, user, conv: conv as any }
}

/** Quem pode ser responsável (equipe ativa, A→Z) + quem está logado (padrão). */
export async function listarResponsaveisAction(): Promise<
  { usuarios: Array<{ id: string; nome: string }>; eu: string } | { erro: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data, error } = await createAdminClient().from('profiles')
    .select('id, nome_completo, role').eq('ativo', true).neq('role', 'candidato')
  if (error) return { erro: error.message }
  const usuarios = ((data || []) as any[])
    .map((p) => ({ id: p.id as string, nome: (p.nome_completo as string) || 'Sem nome' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { usuarios, eu: user.id }
}

export async function listarAgendaConversaAction(conversaId: string): Promise<{ itens: ItemAgendaConversa[] } | { erro: string }> {
  const { erro } = await conversaAcessivel(conversaId)
  if (erro) return { erro }
  // Itens podem ser de outras pessoas (responsável escolhido) — lê pelo service role
  const admin = createAdminClient()
  const [f, t, e] = await Promise.all([
    admin.from('wa_followups').select('id, executar_em, status, modo, mensagem, texto_enviado, motivo, cancelar_se_responder, responsavel:responsavel_id(nome_completo)')
      .eq('conversa_id', conversaId).order('executar_em', { ascending: false }).limit(20),
    admin.from('agenda_tarefas').select('id, titulo, data_prazo, status, usuario:usuario_id(nome_completo)')
      .eq('wa_conversa_id', conversaId).order('data_prazo', { ascending: false }).limit(20),
    admin.from('agenda_eventos').select('id, titulo, data_hora_inicio, status, tipo, local, usuario:usuario_id(nome_completo)')
      .eq('wa_conversa_id', conversaId).order('data_hora_inicio', { ascending: false }).limit(20),
  ])
  const nome = (x: any) => String(x?.nome_completo || '').split(' ')[0] || null
  const itens: ItemAgendaConversa[] = [
    ...(f.data || []).map((x: any) => {
      const lembrete = x.cancelar_se_responder === false
      const assunto = String(x.mensagem || '').match(/^Lembrete ao cliente do compromisso: (.+?) — /)?.[1] || x.mensagem
      return {
        id: x.id, tipo: 'followup' as const, lembrete,
        titulo: lembrete ? `Lembrete ao cliente: ${assunto}` : x.modo === 'texto_exato' ? `Follow-up: "${x.mensagem}"` : `Follow-up (Bianca escreve): ${x.mensagem}`,
        quando: x.executar_em, status: x.status,
        detalhe: x.texto_enviado ? `Enviado: "${x.texto_enviado}"` : x.motivo,
        responsavel: nome(x.responsavel),
        edicao: { mensagem: x.mensagem || '', modo: x.modo },
      }
    }),
    ...(t.data || []).map((x: any) => ({
      id: x.id, tipo: 'tarefa' as const, titulo: x.titulo, quando: x.data_prazo, status: x.status, detalhe: null, responsavel: nome(x.usuario),
      edicao: { titulo: x.titulo || '' },
    })),
    ...(e.data || []).map((x: any) => ({
      id: x.id, tipo: 'evento' as const, titulo: `${rotuloTipoEvento(x.tipo)}: ${x.titulo}`, quando: x.data_hora_inicio, status: x.status, detalhe: null, responsavel: nome(x.usuario),
      edicao: { titulo: x.titulo || '', local: x.local || null },
    })),
  ].sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')))
  return { itens }
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

/** Lembrete ao cliente: antecedências aceitas (min) — 30 min, 1 h, 2 h, 1 dia */
const ANTECEDENCIAS_LEMBRETE = [1440, 120, 60, 30] as const

export async function agendarNaConversaAction(input: {
  conversa_id: string
  /** lembrete (Kalebe 2026-10-14): a Bianca lembra o CLIENTE de um compromisso */
  tipo: 'followup' | 'tarefa' | 'evento' | 'lembrete'
  quando: string                 // ISO (followup/evento/lembrete = hora do compromisso) ou YYYY-MM-DD (tarefa)
  /** lembrete: quantos minutos antes do compromisso a Bianca manda (pode ser vários) */
  antecedencias_min?: number[]
  /** lembrete de call: link da sala pra Bianca incluir */
  link_sala?: string | null
  /** Quem executa (padrão: quem está criando) */
  responsavel_id?: string | null
  titulo?: string
  descricao?: string
  // followup
  modo?: 'texto_exato' | 'bianca_escreve'
  mensagem?: string
  cancelar_se_responder?: boolean
  // tarefa
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente'
  // evento
  duracao_min?: number
  tipo_evento?: TipoEvento
  local?: string
  lembrete_min?: number
}): Promise<{ sucesso: true; responsavel: string; link_sala?: string | null } | { erro: string }> {
  const { erro, user, conv } = await conversaAcessivel(input.conversa_id)
  if (erro || !user || !conv) return { erro: erro || 'Sem acesso' }
  const admin = createAdminClient()
  const contato = conv.contato || {}
  const nomeCliente = contato.nome_exibicao || contato.telefone || 'cliente'
  const projetoId = contato.projeto_id || null
  const rodape = `\n\n— criado a partir da conversa do WhatsApp com ${nomeCliente}`

  // Responsável: usuário ativo da equipe
  const respId = input.responsavel_id || user.id
  const { data: resp } = await admin.from('profiles').select('id, nome_completo, ativo, role').eq('id', respId).maybeSingle()
  if (!resp || resp.ativo === false || resp.role === 'candidato') return { erro: 'Responsável inválido ou desativado' }
  const { data: eu } = await admin.from('profiles').select('nome_completo').eq('id', user.id).maybeSingle()
  const quemCriou = String(eu?.nome_completo || 'Alguém da equipe').split(' ')[0]
  const linkConversa = `${URL_PORTAL}/spinzap?c=${conv.id}`
  let aviso: { titulo: string; linhas: Array<string | null> } | null = null
  let linkSala: string | null = null

  if (input.tipo === 'followup') {
    const quando = new Date(input.quando)
    if (isNaN(quando.getTime())) return { erro: 'Data/hora inválida' }
    if (quando.getTime() < Date.now() - 60_000) return { erro: 'Escolha uma data/hora no futuro' }
    const mensagem = String(input.mensagem || '').trim()
    if (!mensagem) return { erro: input.modo === 'texto_exato' ? 'Escreva a mensagem' : 'Diga o objetivo do follow-up pra Bianca' }
    const { error } = await admin.from('wa_followups').insert({
      conversa_id: conv.id,
      projeto_id: projetoId,
      responsavel_id: respId,
      executar_em: quando.toISOString(),
      modo: input.modo === 'texto_exato' ? 'texto_exato' : 'bianca_escreve',
      mensagem,
      cancelar_se_responder: input.cancelar_se_responder !== false,
    })
    if (error) return { erro: error.message.includes('wa_followups') ? 'Falta rodar a migration 123 no Supabase.' : error.message }
    aviso = {
      titulo: 'Follow-up agendado no seu nome',
      linhas: [
        `💬 ${quemCriou} agendou um follow-up com *${nomeCliente}* em ${dataHora(quando.toISOString())}.`,
        `${input.modo === 'texto_exato' ? 'Mensagem' : 'Objetivo'}: ${mensagem}`,
        'A Bianca envia na hora marcada; se não der (janela de 24h), ela te avisa pra você chamar.',
      ],
    }
  }

  // Kalebe 2026-10-14: "ação de lembrete automatizado da Bianca para enviar ao
  // cliente" — um follow-up por antecedência escolhida, que NÃO cancela se o
  // cliente responder (lembrete vai de qualquer jeito). Janela de 24h fechada:
  // mesmo caminho do follow-up (modelo de retomada / aviso ao responsável).
  if (input.tipo === 'lembrete') {
    const compromisso = new Date(input.quando)
    if (isNaN(compromisso.getTime())) return { erro: 'Data/hora do compromisso inválida' }
    if (compromisso.getTime() <= Date.now()) return { erro: 'O compromisso precisa estar no futuro' }
    const assunto = String(input.titulo || '').trim()
    if (!assunto) return { erro: 'Diga do que a Bianca deve lembrar o cliente' }
    const antecedencias = Array.from(new Set((input.antecedencias_min || []).map(Number)))
      .filter((m) => (ANTECEDENCIAS_LEMBRETE as readonly number[]).includes(m))
    if (!antecedencias.length) return { erro: 'Escolha quando lembrar' }
    const horarios = antecedencias
      .map((m) => ({ m, em: new Date(compromisso.getTime() - m * 60_000) }))
      .filter((h) => h.em.getTime() > Date.now() + 60_000)
    if (!horarios.length) return { erro: 'Os horários de lembrete já passaram — escolha um mais perto do compromisso' }
    const textoExato = input.modo === 'texto_exato'
    const mensagemExata = String(input.mensagem || '').trim()
    if (textoExato && !mensagemExata) return { erro: 'Escreva a mensagem do lembrete' }
    const link = input.link_sala && /^https:\/\//.test(input.link_sala) ? input.link_sala : null
    const objetivo = `Lembrete ao cliente do compromisso: ${assunto} — ${dataHora(compromisso.toISOString())}.` +
      `${link ? ` Incluir o link da sala: ${link}.` : ''} Citar o dia e o horário e pedir que confirme.`
    const { error } = await admin.from('wa_followups').insert(horarios.map((h) => ({
      conversa_id: conv.id,
      projeto_id: projetoId,
      responsavel_id: respId,
      executar_em: h.em.toISOString(),
      modo: textoExato ? 'texto_exato' : 'bianca_escreve',
      mensagem: textoExato ? mensagemExata : objetivo,
      cancelar_se_responder: false,
    })))
    if (error) return { erro: error.message.includes('wa_followups') ? 'Falta rodar a migration 123 no Supabase.' : error.message }
    const rotulo = (m: number) => (m >= 1440 ? '1 dia antes' : m >= 60 ? `${m / 60} h antes` : `${m} min antes`)
    aviso = {
      titulo: 'Lembrete ao cliente agendado',
      linhas: [
        `🔔 ${quemCriou} agendou lembretes da Bianca pra *${nomeCliente}*: ${assunto} — ${dataHora(compromisso.toISOString())}.`,
        `Envios: ${horarios.map((h) => rotulo(h.m)).join(', ')}.`,
      ],
    }
  }

  if (input.tipo === 'tarefa') {
    const titulo = String(input.titulo || '').trim()
    if (!titulo) return { erro: 'Dê um título pra tarefa' }
    const prazo = input.quando ? input.quando.slice(0, 10) : null
    // Lembrete no dia do prazo às 9h (se ainda estiver no futuro)
    const lembrar = prazo ? new Date(`${prazo}T09:00:00-03:00`) : null
    const { error } = await admin.from('agenda_tarefas').insert({
      titulo,
      descricao: `${String(input.descricao || '').trim()}${rodape}`.trim(),
      data_prazo: prazo,
      prioridade: input.prioridade || 'media',
      usuario_id: respId,
      projeto_id: projetoId,
      wa_conversa_id: conv.id,
      criado_por_usuario_id: user.id,
      ...(lembrar && lembrar.getTime() > Date.now() ? { lembrar_em: lembrar.toISOString() } : {}),
    })
    if (error) return { erro: error.message }
    aviso = {
      titulo: 'Nova tarefa pra você',
      linhas: [
        `✅ ${quemCriou} criou uma tarefa pra você: *${titulo}*`,
        prazo ? `📅 Prazo: ${new Date(`${prazo}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : null,
        `👤 Cliente: ${nomeCliente}`,
        input.descricao?.trim() ? `📝 ${input.descricao.trim()}` : null,
      ],
    }
  }

  if (input.tipo === 'evento') {
    const titulo = String(input.titulo || '').trim()
    if (!titulo) return { erro: 'Dê um título pro evento' }
    const inicio = new Date(input.quando)
    if (isNaN(inicio.getTime())) return { erro: 'Data/hora inválida' }
    const tipo: TipoEvento = TIPOS_EVENTO.some((t) => t.valor === input.tipo_evento) ? input.tipo_evento! : 'ligacao'
    const local = input.local?.trim() || null
    if (tipo === 'reuniao_externa' && !local) return { erro: 'Reunião externa: informe o endereço' }
    // Call: sala de vídeo (mesmo padrão das chamadas do Spinzap)
    if (tipo === 'call') linkSala = `https://meet.jit.si/spin-call-${Math.random().toString(36).slice(2, 10)}`
    const lembrete = [5, 15, 30, 60, 120].includes(Number(input.lembrete_min)) ? Number(input.lembrete_min) : 30
    const fim = new Date(inicio.getTime() + (Number(input.duracao_min) || 60) * 60_000)
    const { error } = await admin.from('agenda_eventos').insert({
      titulo,
      descricao: `${String(input.descricao || '').trim()}${rodape}`.trim(),
      data_hora_inicio: inicio.toISOString(),
      data_hora_fim: fim.toISOString(),
      tipo,
      local,
      url_reuniao: linkSala,
      usuario_id: respId,
      projeto_id: projetoId,
      cliente_nome: nomeCliente,
      lembrete_min_antes: lembrete,
      wa_conversa_id: conv.id,
      criado_por_usuario_id: user.id,
    })
    if (error) return { erro: error.message }
    aviso = {
      titulo: 'Novo compromisso na sua agenda',
      linhas: [
        `📅 ${quemCriou} marcou na sua agenda: *${rotuloTipoEvento(tipo)} — ${titulo}*`,
        `🕐 ${dataHora(inicio.toISOString())} (${Number(input.duracao_min) || 60} min)`,
        `👤 Cliente: ${nomeCliente}`,
        local ? `📍 ${local}` : null,
        linkSala ? `🎥 Sala da call: ${linkSala}` : null,
        `⏰ Eu te lembro ${lembrete} min antes.`,
      ],
    }
  }

  // Responsável recebe o compromisso (WhatsApp + sino). Quem criou pra si mesmo não precisa.
  if (aviso && respId !== user.id) {
    const { avisarUsuario } = await import('@/lib/agentes/diretorio')
    await avisarUsuario({
      destinatario_id: respId,
      agente: 'bianca',
      remetente_usuario_id: user.id,
      titulo: aviso.titulo,
      mensagem: [...aviso.linhas, `🔗 Conversa: ${linkConversa}`].filter(Boolean).join('\n'),
      conversa_id: conv.id,
      projeto_id: projetoId,
    }).catch((e) => console.error('[agenda-conversa] aviso', e))
  }

  revalidatePath('/agenda')
  revalidatePath('/spinzap')
  return { sucesso: true, responsavel: String(resp.nome_completo || '').split(' ')[0], link_sala: linkSala }
}

export async function cancelarFollowupAction(id: string): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  // Follow-up pode estar no nome de outra pessoa: confere o acesso à conversa e cancela pelo service role
  const admin = createAdminClient()
  const { data: f } = await admin.from('wa_followups').select('conversa_id, mensagem, executar_em, responsavel_id, cancelar_se_responder').eq('id', id).maybeSingle()
  if (!f) return { erro: 'Follow-up não encontrado' }
  const { erro } = await conversaAcessivel(f.conversa_id)
  if (erro) return { erro }
  const { data: cancelados, error } = await admin
    .from('wa_followups')
    .update({ status: 'cancelado', motivo: 'Cancelado pelo usuário', executado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'agendado')
    .select('id')
  if (error) return { erro: error.message }
  if (cancelados?.length) {
    await registrarAgendaNaConversa(admin, f.conversa_id, {
      acao: 'cancelado', tipo: (f as any).cancelar_se_responder === false ? 'lembrete' : 'followup',
      titulo: String((f as any).mensagem || ''), quando: (f as any).executar_em ? dataHora((f as any).executar_em) : null,
      responsavel: await primeiroNomePerfil(admin, (f as any).responsavel_id), por: await primeiroNomePerfil(admin, user.id),
      item_id: id, item_tipo: 'followup',
    }, user.id)
  }
  return { sucesso: true }
}

/**
 * Editar / excluir o que já foi agendado na conversa (Kalebe 2026-10-15).
 * Só item DESTA conversa e com acesso à conversa (mesma regra de quem cria).
 * Follow-up/lembrete só edita enquanto não saiu. Mudou a data: o aviso
 * automático é reprogramado. Se o item é de outra pessoa, ela é avisada.
 */
type TipoItemConversa = 'followup' | 'tarefa' | 'evento'
const TABELA_ITEM: Record<TipoItemConversa, { tabela: string; coluna: string; dono: string; rotulo: string }> = {
  followup: { tabela: 'wa_followups', coluna: 'conversa_id', dono: 'responsavel_id', rotulo: 'follow-up' },
  tarefa: { tabela: 'agenda_tarefas', coluna: 'wa_conversa_id', dono: 'usuario_id', rotulo: 'tarefa' },
  evento: { tabela: 'agenda_eventos', coluna: 'wa_conversa_id', dono: 'usuario_id', rotulo: 'evento' },
}

/** Follow-up que não cancela com resposta é lembrete ao cliente */
const tipoDoRegistro = (tipo: TipoItemConversa, item: any): RegistroAgenda['tipo'] =>
  tipo === 'followup' && item?.cancelar_se_responder === false ? 'lembrete' : tipo

async function itemDaConversa(conversaId: string, tipo: TipoItemConversa, id: string) {
  const acesso = await conversaAcessivel(conversaId)
  if (acesso.erro || !acesso.user || !acesso.conv) return { erro: acesso.erro || 'Sem acesso' }
  const t = TABELA_ITEM[tipo]
  if (!t) return { erro: 'Tipo inválido' }
  const admin = createAdminClient()
  const { data: item } = await admin.from(t.tabela).select('*').eq('id', id).eq(t.coluna, conversaId).maybeSingle()
  if (!item) return { erro: 'Item não encontrado nesta conversa' }
  return { admin, user: acesso.user, conv: acesso.conv, item: item as any, t }
}

/** Aviso ao responsável quando outra pessoa mexe no item dele (WhatsApp + sino). */
async function avisarMudanca(a: { admin: ReturnType<typeof createAdminClient>; user: { id: string }; conv: any; item: any; t: { dono: string; rotulo: string } }, linhas: string[]) {
  const dono = a.item[a.t.dono]
  if (!dono || dono === a.user.id) return
  const { data: eu } = await a.admin.from('profiles').select('nome_completo').eq('id', a.user.id).maybeSingle()
  const quem = String(eu?.nome_completo || 'Alguém da equipe').split(' ')[0]
  const { avisarUsuario } = await import('@/lib/agentes/diretorio')
  await avisarUsuario({
    destinatario_id: dono, agente: 'bianca', remetente_usuario_id: a.user.id,
    titulo: `${quem} mexeu num ${a.t.rotulo} seu`,
    mensagem: [...linhas.map((l) => l.replace('{quem}', quem)), `🔗 Conversa: ${URL_PORTAL}/spinzap?c=${a.conv.id}`].join('\n'),
    conversa_id: a.conv.id, projeto_id: a.conv.contato?.projeto_id || null,
  }).catch((e) => console.error('[agenda-conversa] aviso de mudança', e))
}

export async function editarItemAgendaConversaAction(input: {
  conversa_id: string
  tipo: TipoItemConversa
  id: string
  /** ISO (follow-up/evento) ou YYYY-MM-DD (tarefa) */
  quando?: string | null
  titulo?: string
  mensagem?: string
  local?: string | null
}): Promise<{ sucesso: true } | { erro: string }> {
  const a = await itemDaConversa(input.conversa_id, input.tipo, input.id)
  if ('erro' in a) return { erro: a.erro as string }
  const { admin, item } = a
  const patch: Record<string, any> = {}
  let quandoTexto = ''

  if (input.tipo === 'followup') {
    if (item.status !== 'agendado') return { erro: 'Esse follow-up já saiu ou foi cancelado — não dá mais pra editar' }
    if (input.quando) {
      const d = new Date(input.quando)
      if (isNaN(d.getTime())) return { erro: 'Data/hora inválida' }
      if (d.getTime() < Date.now() - 60_000) return { erro: 'Escolha uma data/hora no futuro' }
      patch.executar_em = d.toISOString()
      quandoTexto = dataHora(patch.executar_em)
    }
    if (input.mensagem !== undefined) {
      const m = String(input.mensagem).trim()
      if (!m) return { erro: 'A mensagem não pode ficar vazia' }
      patch.mensagem = m
    }
  } else if (input.tipo === 'tarefa') {
    if (input.titulo !== undefined) {
      const t = String(input.titulo).trim()
      if (!t) return { erro: 'Dê um título pra tarefa' }
      patch.titulo = t
    }
    if (input.quando !== undefined) {
      const prazo = input.quando ? String(input.quando).slice(0, 10) : null
      if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return { erro: 'Prazo inválido' }
      patch.data_prazo = prazo
      // Lembrete do prazo reprogramado (9h do dia, se ainda estiver no futuro)
      const lembrar = prazo ? new Date(`${prazo}T09:00:00-03:00`) : null
      patch.lembrar_em = lembrar && lembrar.getTime() > Date.now() ? lembrar.toISOString() : null
      patch.lembrete_enviado_em = null
      quandoTexto = prazo ? new Date(`${prazo}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'sem prazo'
    }
  } else {
    if (input.titulo !== undefined) {
      const t = String(input.titulo).trim()
      if (!t) return { erro: 'Dê um título pro evento' }
      patch.titulo = t
    }
    if (input.local !== undefined) {
      const l = String(input.local || '').trim() || null
      if (item.tipo === 'reuniao_externa' && !l) return { erro: 'Reunião externa: informe o endereço' }
      patch.local = l
    }
    if (input.quando) {
      const ini = new Date(input.quando)
      if (isNaN(ini.getTime())) return { erro: 'Data/hora inválida' }
      // Mantém a duração e reprograma o lembrete antes e o acompanhamento depois
      const dur = item.data_hora_fim ? new Date(item.data_hora_fim).getTime() - new Date(item.data_hora_inicio).getTime() : 60 * 60_000
      patch.data_hora_inicio = ini.toISOString()
      patch.data_hora_fim = new Date(ini.getTime() + Math.max(dur, 15 * 60_000)).toISOString()
      if (ini.getTime() > Date.now()) { patch.notificacao_enviada = false; patch.acompanhamento_enviado_em = null }
      quandoTexto = dataHora(patch.data_hora_inicio)
    }
  }
  if (!Object.keys(patch).length) return { sucesso: true }
  let { error } = await admin.from(a.t.tabela).update(patch).eq('id', input.id)
  // Banco sem as colunas de lembrete (migrations antigas): salva o resto
  if (error && /lembrar_em|lembrete_enviado_em|acompanhamento_enviado_em/.test(error.message)) {
    const { lembrar_em, lembrete_enviado_em, acompanhamento_enviado_em, ...resto } = patch
    void lembrar_em; void lembrete_enviado_em; void acompanhamento_enviado_em
    ;({ error } = await admin.from(a.t.tabela).update(resto).eq('id', input.id))
  }
  if (error) return { erro: error.message }
  await avisarMudanca(a, [
    `📝 {quem} alterou ${input.tipo === 'tarefa' ? 'a tarefa' : input.tipo === 'evento' ? 'o evento' : 'o follow-up'}: *${patch.titulo || item.titulo || String(item.mensagem || '').slice(0, 60)}*`,
    ...(quandoTexto ? [`🕐 Agora: ${quandoTexto}`] : []),
  ])
  revalidatePath('/agenda')
  return { sucesso: true }
}

export async function excluirItemAgendaConversaAction(conversa_id: string, tipo: TipoItemConversa, id: string): Promise<{ sucesso: true } | { erro: string }> {
  const a = await itemDaConversa(conversa_id, tipo, id)
  if ('erro' in a) return { erro: a.erro as string }
  const item = a.item
  let { error } = await a.admin.from(a.t.tabela).delete().eq('id', id)
  // Ligado a outro registro (ex.: OS de campo): em vez de apagar, cancela
  if (error?.code === '23503') {
    const cancelado = tipo === 'tarefa' ? { status: 'cancelada' } : tipo === 'evento' ? { status: 'cancelado' } : { status: 'cancelado', motivo: 'Excluído pelo usuário' }
    ;({ error } = await a.admin.from(a.t.tabela).update(cancelado).eq('id', id))
  }
  if (error) return { erro: error.message }
  await registrarAgendaNaConversa(a.admin, a.conv.id, {
    acao: 'excluido', tipo: tipoDoRegistro(tipo, item),
    titulo: String(item.titulo || item.mensagem || ''),
    quando: tipo === 'followup' && item.executar_em ? dataHora(item.executar_em)
      : tipo === 'evento' && item.data_hora_inicio ? dataHora(item.data_hora_inicio)
      : tipo === 'tarefa' && item.data_prazo ? `prazo ${new Date(`${item.data_prazo}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : null,
    responsavel: await primeiroNomePerfil(a.admin, item[a.t.dono]), por: await primeiroNomePerfil(a.admin, a.user.id),
    item_id: id, item_tipo: tipo,
  }, a.user.id)
  // Só avisa o responsável se ainda estava valendo
  const aberto = tipo === 'followup' ? item.status === 'agendado'
    : tipo === 'tarefa' ? !['concluida', 'cancelada'].includes(item.status)
    : !['realizado', 'cancelado'].includes(item.status) && new Date(item.data_hora_inicio).getTime() > Date.now()
  if (aberto) {
    await avisarMudanca(a, [
      `🗑 {quem} excluiu ${tipo === 'tarefa' ? 'a tarefa' : tipo === 'evento' ? 'o evento' : 'o follow-up'}: *${item.titulo || String(item.mensagem || '').slice(0, 60)}*`,
    ])
  }
  revalidatePath('/agenda')
  return { sucesso: true }
}

// ─── Cartão móvel: o que está em aberto na conversa (Kalebe 2026-10-19) ───

export type AbertoAgendaConversa = {
  id: string
  tipo: TipoItemConversa
  /** follow-up que é lembrete ao cliente */
  lembrete: boolean
  titulo: string
  /** Data/hora no padrão brasileiro */
  quando: string | null
  /** O que está acontecendo com ele agora */
  situacao: string
  /** Passou da hora, falhou ou precisa de alguém */
  atencao: boolean
  /** Já aconteceu (Bianca enviou, evento passou): falta só clicar em Concluído */
  executado: boolean
  responsavel: string | null
  /** Pra ordenar (ISO ou data) */
  ordem: string
}

/** Antes disso não existia o cartão: follow-up já enviado e evento passado não voltam a aparecer */
const INICIO_CARTOES = '2026-10-19T00:00:00-03:00'

export async function agendaAbertaConversaAction(conversaId: string): Promise<{ itens: AbertoAgendaConversa[] } | { erro: string }> {
  const { erro } = await conversaAcessivel(conversaId)
  if (erro) return { erro }
  const admin = createAdminClient()
  const agora = Date.now()
  const hoje = new Date(agora).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const inicioHoje = new Date(`${hoje}T00:00:00-03:00`).getTime()
  const inicioCartoes = new Date(INICIO_CARTOES).getTime()
  const [f, t, e, regs] = await Promise.all([
    admin.from('wa_followups').select('id, executar_em, executado_em, status, modo, mensagem, motivo, cancelar_se_responder, criado_em, responsavel:responsavel_id(nome_completo)')
      .eq('conversa_id', conversaId).in('status', ['agendado', 'aguardando_cliente', 'aguardando_humano', 'enviado', 'falhou']).order('executar_em').limit(40),
    admin.from('agenda_tarefas').select('id, titulo, data_prazo, status, usuario:usuario_id(nome_completo)')
      .eq('wa_conversa_id', conversaId).in('status', ['pendente', 'em_andamento']).limit(40),
    admin.from('agenda_eventos').select('id, titulo, tipo, data_hora_inicio, status, created_at, usuario:usuario_id(nome_completo)')
      .eq('wa_conversa_id', conversaId).not('status', 'in', '(cancelado,realizado,adiado)').limit(40),
    admin.from('wa_mensagens').select('agenda:dados->agenda').eq('conversa_id', conversaId).eq('tipo', 'system').limit(300),
  ])
  // Já fixados (concluídos, cancelados, excluídos) não voltam a acompanhar a conversa
  const fixados = new Set(((regs.data || []) as any[]).map((r) => r.agenda?.item_id).filter(Boolean))
  const nome = (x: any) => String(x?.nome_completo || '').split(' ')[0] || null
  const itens: AbertoAgendaConversa[] = []

  for (const x of (f.data || []) as any[]) {
    if (fixados.has(x.id)) continue
    const feito = x.status === 'enviado' || x.status === 'falhou'
    if (feito && new Date(x.criado_em).getTime() < inicioCartoes) continue
    if (x.status === 'falhou' && x.motivo === 'processando') continue
    const lembrete = x.cancelar_se_responder === false
    const msg = String(x.mensagem || '')
    const titulo = lembrete ? (msg.match(/^Lembrete ao cliente do compromisso: (.+?) — /)?.[1] || msg) : x.modo === 'texto_exato' ? `"${msg}"` : msg
    const quando = x.executar_em ? dataHora(x.executar_em) : null
    const passou = x.executar_em && new Date(x.executar_em).getTime() < agora - 10 * 60_000
    const situacao = x.status === 'enviado' ? `A Bianca enviou${x.executado_em ? ` em ${dataHora(x.executado_em)}` : ''} — clique em Concluído quando resolver`
      : x.status === 'aguardando_cliente' ? 'Janela de 24h fechada: a Bianca mandou o modelo de retomada e espera o cliente responder'
      : x.status === 'aguardando_humano' ? 'A Bianca não conseguiu enviar — chame o cliente'
      : x.status === 'falhou' ? 'O envio falhou — chame o cliente'
      : passou ? 'Passou da hora e ainda não saiu' : `A Bianca envia ${quando}`
    itens.push({
      id: x.id, tipo: 'followup', lembrete, titulo, quando, situacao,
      atencao: x.status === 'aguardando_humano' || x.status === 'falhou' || (x.status === 'agendado' && !!passou),
      executado: x.status === 'enviado', responsavel: nome(x.responsavel), ordem: x.executar_em || '',
    })
  }
  for (const x of (t.data || []) as any[]) {
    if (fixados.has(x.id)) continue
    const atrasada = !!x.data_prazo && x.data_prazo < hoje
    const prazo = x.data_prazo ? new Date(`${x.data_prazo}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null
    itens.push({
      id: x.id, tipo: 'tarefa', lembrete: false, titulo: String(x.titulo || 'Tarefa'), quando: prazo ? `prazo ${prazo}` : 'sem prazo',
      situacao: atrasada ? 'Atrasada' : x.data_prazo === hoje ? 'Vence hoje' : x.status === 'em_andamento' ? 'Em andamento' : 'A fazer',
      atencao: atrasada, executado: false, responsavel: nome(x.usuario), ordem: x.data_prazo || '9999',
    })
  }
  for (const x of (e.data || []) as any[]) {
    if (fixados.has(x.id)) continue
    const ini = new Date(x.data_hora_inicio).getTime()
    // Evento antigo (antes do cartão) que ninguém marcou: não volta
    if (ini < inicioHoje && new Date(x.created_at || x.data_hora_inicio).getTime() < inicioCartoes) continue
    const passou = ini < agora
    itens.push({
      id: x.id, tipo: 'evento', lembrete: false, titulo: `${rotuloTipoEvento(x.tipo)} — ${String(x.titulo || '')}`, quando: dataHora(x.data_hora_inicio),
      situacao: passou ? 'Já passou — clique em Concluído se aconteceu' : ini - agora < 3_600_000 ? 'Começa em menos de 1 hora' : 'Marcado',
      atencao: false, executado: passou, responsavel: nome(x.usuario), ordem: x.data_hora_inicio,
    })
  }
  itens.sort((a, b) => String(a.ordem).localeCompare(String(b.ordem)))
  return { itens }
}

/**
 * "Concluído" no cartão móvel: o item fecha na agenda e o cartão se fixa na
 * conversa. Tarefa → concluída; evento → realizado; follow-up que ainda não
 * saiu → cancelado (a Bianca não manda mais).
 */
export async function concluirItemAgendaConversaAction(conversa_id: string, tipo: TipoItemConversa, id: string): Promise<{ sucesso: true } | { erro: string }> {
  const a = await itemDaConversa(conversa_id, tipo, id)
  if ('erro' in a) return { erro: a.erro as string }
  const { admin, item } = a
  const agoraIso = new Date().toISOString()
  let detalhe: string | null = null
  let quando: string | null = null
  let error: { message: string } | null = null
  if (tipo === 'tarefa') {
    ;({ error } = await admin.from('agenda_tarefas').update({ status: 'concluida', concluida_em: agoraIso }).eq('id', id))
    quando = item.data_prazo ? `prazo ${new Date(`${item.data_prazo}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : null
    detalhe = item.descricao ? String(item.descricao).split('\n\n— criado a partir')[0] : null
  } else if (tipo === 'evento') {
    ;({ error } = await admin.from('agenda_eventos').update({ status: 'realizado' }).eq('id', id))
    quando = item.data_hora_inicio ? dataHora(item.data_hora_inicio) : null
    detalhe = [item.local ? `Local: ${item.local}` : null, item.url_reuniao ? `Sala: ${item.url_reuniao}` : null].filter(Boolean).join(' · ') || null
  } else {
    quando = item.executar_em ? dataHora(item.executar_em) : null
    if (['agendado', 'aguardando_cliente', 'aguardando_humano'].includes(item.status)) {
      ;({ error } = await admin.from('wa_followups').update({ status: 'cancelado', motivo: 'Concluído pelo usuário antes do envio', executado_em: agoraIso }).eq('id', id))
      detalhe = 'Concluído antes do envio — a Bianca não manda mais'
    } else if (item.texto_enviado) {
      detalhe = `A Bianca enviou: "${String(item.texto_enviado).slice(0, 300)}"`
    }
  }
  if (error) return { erro: error.message }
  const msg = String(item.mensagem || '')
  await registrarAgendaNaConversa(admin, a.conv.id, {
    acao: 'concluido', tipo: tipoDoRegistro(tipo, item),
    titulo: tipo === 'evento' ? `${rotuloTipoEvento(item.tipo)} — ${item.titulo || ''}`
      : tipo === 'tarefa' ? String(item.titulo || '')
      : item.cancelar_se_responder === false ? (msg.match(/^Lembrete ao cliente do compromisso: (.+?) — /)?.[1] || msg) : msg,
    quando, detalhe,
    responsavel: await primeiroNomePerfil(admin, item[a.t.dono]), por: await primeiroNomePerfil(admin, a.user.id),
    item_id: id, item_tipo: tipo,
  }, a.user.id)
  await avisarMudanca(a, [`✅ {quem} concluiu ${tipo === 'tarefa' ? 'a tarefa' : tipo === 'evento' ? 'o evento' : 'o follow-up'}: *${item.titulo || msg.slice(0, 60)}*`])
  revalidatePath('/agenda')
  return { sucesso: true }
}
