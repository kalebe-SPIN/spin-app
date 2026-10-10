import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Agenda comercial pras ligações de orçamento (Kalebe 2026-10-10): "consultar
 * agenda do setor comercial do dia; sem disponibilidade, o próximo dia útil;
 * identificar horários e consultores disponíveis; escolher 2 opções".
 * Horário (Kalebe 2026-10-09): seg–sex 9h–19h, sáb 9h–11h, blocos de 30 min.
 * Consultores = membros ativos (não bloqueados) do setor Comercial.
 * Tudo em horário de Brasília (sem horário de verão desde 2019).
 */

type Admin = ReturnType<typeof createAdminClient>

export const AGENDA_LIGACOES = {
  semana: { inicio: 9, fim: 19 },
  sabado: { inicio: 9, fim: 11 },
  blocoMin: 30,
  /** Primeiro horário oferecido: pelo menos isso a partir de agora. */
  antecedenciaMin: 15,
  /** Quantos dias à frente procurar (contando hoje). */
  diasBusca: 7,
  /** As 2 opções oferecidas ficam pelo menos isso distantes (quando houver). */
  espacamentoMin: 90,
}

export type ParteDoDia = 'manha' | 'tarde' | 'noite'
const PARTES: Record<ParteDoDia, [number, number]> = { manha: [9, 12], tarde: [12, 18], noite: [18, 19] }

export type HorarioLivre = { inicio: string; fim: string; consultor_id: string; consultor_nome: string }

const MIN = 60_000
const diaBRT = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const emBRT = (dia: string, hora: number, minuto = 0) =>
  new Date(`${dia}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`)
const diaSemana = (dia: string) => new Date(`${dia}T12:00:00-03:00`).getUTCDay()   // 0 = domingo
const somaDias = (dia: string, n: number) => diaBRT(new Date(new Date(`${dia}T12:00:00-03:00`).getTime() + n * 86_400_000))

/** "segunda, 13/10 às 14:30" — como a Laís escreve o horário. */
export function rotuloHorario(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  const hoje = diaBRT(new Date()) === diaBRT(d)
  const amanha = diaBRT(new Date(Date.now() + 86_400_000)) === diaBRT(d)
  return `${hoje ? 'hoje' : amanha ? 'amanhã' : dia.split(',')[0]}${hoje || amanha ? '' : `, ${dia.split(', ')[1] || ''}`} às ${hora}`
}

export async function consultoresComerciais(admin: Admin): Promise<Array<{ id: string; nome: string }>> {
  const { data: g } = await admin.from('grupos_internos').select('id').eq('chave', 'comercial').eq('ativo', true).maybeSingle()
  if (!g) return []
  const { data: membros } = await admin.from('grupos_membros').select('usuario_id, bloqueado_em').eq('grupo_id', g.id)
  const ids = ((membros || []) as any[]).filter((m) => !m.bloqueado_em).map((m) => m.usuario_id as string)
  if (!ids.length) return []
  const { data: perfis } = await admin.from('profiles').select('id, nome_completo, ativo, role').in('id', ids)
  return ((perfis || []) as any[])
    .filter((p) => p.ativo !== false && p.role !== 'candidato')
    .map((p) => ({ id: p.id as string, nome: (p.nome_completo as string) || 'Consultor' }))
}

/** Janelas de atendimento de um dia (vazio no domingo). */
function blocosDoDia(dia: string): Date[] {
  const ds = diaSemana(dia)
  if (ds === 0) return []
  const { inicio, fim } = ds === 6 ? AGENDA_LIGACOES.sabado : AGENDA_LIGACOES.semana
  const saida: Date[] = []
  for (let m = inicio * 60; m + AGENDA_LIGACOES.blocoMin <= fim * 60; m += AGENDA_LIGACOES.blocoMin) {
    saida.push(emBRT(dia, Math.floor(m / 60), m % 60))
  }
  return saida
}

/**
 * Horários livres pra ligação. Sem filtro: os `quantidade` primeiros a partir
 * de agora (hoje; se não tiver, os próximos dias). Com `parteDoDia`: só
 * dentro dela. Com `horaExata`: confere só aquele horário. Cada opção traz o
 * consultor livre com menos compromissos no dia (divide a carga).
 */
export async function horariosLivres(admin: Admin, opcoes: {
  quantidade?: number
  parteDoDia?: ParteDoDia
  horaExata?: Date
  /** Dia (AAAA-MM-DD, Brasília) quando o lead escolhe só a parte do dia de outro dia */
  dia?: string
  /** Distância mínima entre as opções oferecidas (padrão 1h30) */
  espacamentoMin?: number
} = {}): Promise<HorarioLivre[]> {
  const quantidade = opcoes.quantidade ?? 2
  const consultores = await consultoresComerciais(admin)
  if (!consultores.length) return []

  const agora = Date.now()
  const primeiro = agora + AGENDA_LIGACOES.antecedenciaMin * MIN
  const hoje = diaBRT(new Date())
  const dias = opcoes.horaExata
    ? [diaBRT(opcoes.horaExata)]
    : opcoes.dia ? [opcoes.dia]
    : Array.from({ length: AGENDA_LIGACOES.diasBusca }, (_, i) => somaDias(hoje, i))

  // Compromissos dos consultores no período (dia inteiro = ocupado o dia todo)
  const ini = emBRT(dias[0], 0).toISOString()
  const fimBusca = emBRT(somaDias(dias[dias.length - 1], 1), 0).toISOString()
  const { data: eventos } = await admin.from('agenda_eventos')
    .select('usuario_id, data_hora_inicio, data_hora_fim, dia_inteiro, status')
    .in('usuario_id', consultores.map((c) => c.id))
    .gte('data_hora_inicio', new Date(new Date(ini).getTime() - 86_400_000).toISOString())
    .lt('data_hora_inicio', fimBusca)
  const ocupados = ((eventos || []) as any[])
    .filter((e) => !['cancelado', 'realizado'].includes(e.status))
    .map((e) => {
      const i = new Date(e.data_hora_inicio).getTime()
      if (e.dia_inteiro) {
        const d = diaBRT(new Date(e.data_hora_inicio))
        return { usuario: e.usuario_id as string, i: emBRT(d, 0).getTime(), f: emBRT(somaDias(d, 1), 0).getTime(), dia: d }
      }
      const f = e.data_hora_fim ? new Date(e.data_hora_fim).getTime() : i + AGENDA_LIGACOES.blocoMin * MIN
      return { usuario: e.usuario_id as string, i, f, dia: diaBRT(new Date(i)) }
    })

  // Junta os candidatos em ordem e escolhe espaçados (ex.: 14:30 e 16:30 em vez
  // de 14:30 e 15:00) — dá escolha de verdade pro lead
  const candidatos: HorarioLivre[] = []
  const LIMITE_CANDIDATOS = 60
  for (const dia of dias) {
    let blocos = blocosDoDia(dia)
    if (opcoes.parteDoDia) {
      const [h0, h1] = PARTES[opcoes.parteDoDia]
      blocos = blocos.filter((b) => b >= emBRT(dia, h0) && b < emBRT(dia, h1))
    }
    if (opcoes.horaExata) blocos = blocos.filter((b) => Math.abs(b.getTime() - opcoes.horaExata!.getTime()) < MIN)
    for (const b of blocos) {
      const i = b.getTime()
      if (i < primeiro) continue
      const f = i + AGENDA_LIGACOES.blocoMin * MIN
      const livres = consultores
        .filter((c) => !ocupados.some((o) => o.usuario === c.id && o.i < f && o.f > i))
        .map((c) => ({ c, carga: ocupados.filter((o) => o.usuario === c.id && o.dia === dia).length }))
        .sort((a, b) => a.carga - b.carga)
      if (!livres.length) continue
      candidatos.push({ inicio: new Date(i).toISOString(), fim: new Date(f).toISOString(), consultor_id: livres[0].c.id, consultor_nome: livres[0].c.nome })
      if (candidatos.length >= LIMITE_CANDIDATOS || (quantidade === 1 && candidatos.length)) break
    }
    if (candidatos.length >= LIMITE_CANDIDATOS || (quantidade === 1 && candidatos.length)) break
  }
  const espaco = (opcoes.espacamentoMin ?? AGENDA_LIGACOES.espacamentoMin) * MIN
  const saida: HorarioLivre[] = []
  for (const c of candidatos) {
    if (saida.length >= quantidade) break
    const t = new Date(c.inicio).getTime()
    if (saida.every((s) => Math.abs(new Date(s.inicio).getTime() - t) >= espaco)) saida.push(c)
  }
  // Sem horário espaçado o bastante: completa com os próximos livres
  for (const c of candidatos) {
    if (saida.length >= quantidade) break
    if (!saida.includes(c)) saida.push(c)
  }
  return saida.sort((a, b) => a.inicio.localeCompare(b.inicio))
}

/** Confere de novo (pode ter sido ocupado) e marca a ligação na agenda do consultor. */
export async function agendarLigacao(admin: Admin, e: {
  inicio: string
  consultor_id: string
  conversa_id: string
  projeto_id?: string | null
  cliente_nome: string
  telefone: string
}): Promise<{ evento_id: string } | { erro: string }> {
  const i = new Date(e.inicio).getTime()
  const f = i + AGENDA_LIGACOES.blocoMin * MIN
  const { data: conflitos } = await admin.from('agenda_eventos')
    .select('id, data_hora_inicio, data_hora_fim, status')
    .eq('usuario_id', e.consultor_id)
    .gte('data_hora_inicio', new Date(i - 6 * 3_600_000).toISOString())
    .lt('data_hora_inicio', new Date(f).toISOString())
  const ocupado = ((conflitos || []) as any[]).some((x) => !['cancelado', 'realizado'].includes(x.status)
    && new Date(x.data_hora_inicio).getTime() < f
    && (x.data_hora_fim ? new Date(x.data_hora_fim).getTime() : new Date(x.data_hora_inicio).getTime() + AGENDA_LIGACOES.blocoMin * MIN) > i)
  if (ocupado) return { erro: 'horario_ocupado' }

  const { data: ev, error } = await admin.from('agenda_eventos').insert({
    titulo: `📞 Ligação de orçamento — ${e.cliente_nome}`,
    descricao: `Ligação marcada pela Laís no WhatsApp. O consultor apresenta o orçamento na ligação. Telefone: ${e.telefone}`,
    data_hora_inicio: new Date(i).toISOString(),
    data_hora_fim: new Date(f).toISOString(),
    tipo: 'ligacao',
    usuario_id: e.consultor_id,
    projeto_id: e.projeto_id || null,
    cliente_nome: e.cliente_nome,
    lembrete_min_antes: 5,
    criado_por_bianca: true,
    wa_conversa_id: e.conversa_id,
    status: 'agendado',
  }).select('id').single()
  if (error || !ev) return { erro: error?.message || 'Falha ao agendar' }
  await admin.from('wa_conversas').update({ etapa: 'reuniao_agendada', etapa_em: new Date().toISOString() }).eq('id', e.conversa_id)
  return { evento_id: ev.id as string }
}
