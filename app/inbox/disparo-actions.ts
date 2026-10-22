'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIMITE_DISPARO } from '@/lib/spinzap/disparo-comum'

/**
 * Disparo em massa pelo Spinzap (Kalebe 2026-10-22): depois de filtrar,
 * os contatos selecionados recebem texto, criativo (imagem, vídeo, PDF) ou
 * gravação de voz do usuário — agora ou programado — enviado pela Laís ou
 * pela Bianca. Cada contato vira um envio na fila de follow-ups (cron de 5
 * em 5 min, lib/bianca/followups.ts). Janela de 24h fechada: vai antes o
 * modelo de retomada e o conteúdo sai quando o cliente responder.
 * Qualquer usuário dispara pras conversas que enxerga (RLS); até 100 por vez.
 */

export type EntradaDisparo = {
  conversa_ids: string[]
  agente: 'lais' | 'bianca'
  tipo: 'texto' | 'midia' | 'audio'
  texto: string
  midia?: { url: string; mime: string; nome: string } | null
  /** ISO; vazio = agora */
  quando?: string | null
  /** Resumo dos filtros usados (só registro) */
  filtros?: Record<string, unknown>
}

export type DisparoRecente = {
  id: string
  criado_em: string
  executar_em: string
  agente: 'lais' | 'bianca'
  tipo: 'texto' | 'midia' | 'audio'
  texto: string | null
  total: number
  status: string
  autor: string | null
  contagem: { agendado: number; enviado: number; aguardando_cliente: number; aguardando_humano: number; falhou: number; cancelado: number }
}

const migracao = (msg: string) => (/wa_disparos|disparo_id|midia_url|agente/.test(msg) ? 'Falta rodar a migration 159 (disparo em massa) no Supabase.' : msg)

export async function criarDisparoAction(e: EntradaDisparo): Promise<
  { sucesso: true; disparo_id: string; total: number; enviados_agora: number } | { erro: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const ids = Array.from(new Set((e.conversa_ids || []).filter(Boolean)))
  if (!ids.length) return { erro: 'Selecione pelo menos um contato' }
  if (ids.length > LIMITE_DISPARO) return { erro: `No máximo ${LIMITE_DISPARO} contatos por disparo — divida em mais de um` }
  const agente = e.agente === 'lais' ? 'lais' : 'bianca'
  const tipo = e.tipo === 'midia' || e.tipo === 'audio' ? e.tipo : 'texto'
  const texto = String(e.texto || '').trim().slice(0, 4000)
  if (tipo === 'texto' && !texto) return { erro: 'Escreva a mensagem' }
  const midia = tipo === 'texto' ? null : e.midia || null
  if (tipo !== 'texto') {
    // Só arquivo que subiu pro bucket do disparo (a Meta baixa por esse link)
    if (!midia?.url || !midia.url.includes('/storage/v1/object/public/wa-disparos/')) return { erro: tipo === 'audio' ? 'Grave o áudio antes de disparar' : 'Envie o criativo antes de disparar' }
    if (tipo === 'audio' && !String(midia.mime || '').startsWith('audio/')) return { erro: 'O áudio precisa ser uma gravação' }
  }
  const agora = Date.now()
  let executar = new Date(agora)
  if (e.quando) {
    executar = new Date(e.quando)
    if (isNaN(executar.getTime())) return { erro: 'Data/hora inválida' }
    if (executar.getTime() < agora - 60_000) return { erro: 'Escolha uma data/hora no futuro' }
  }
  const imediato = !e.quando || executar.getTime() <= agora + 60_000

  // RLS: só as conversas que este usuário enxerga
  const { data: visiveis } = await supabase.from('wa_conversas')
    .select('id, responsavel_id, contato:contato_id(projeto_id, telefone)').in('id', ids)
  const alvo = ((visiveis || []) as any[]).filter((c) => c.contato?.telefone)
  if (!alvo.length) return { erro: 'Nenhuma das conversas selecionadas está acessível pra você' }

  const admin = createAdminClient()
  const { data: disparo, error } = await admin.from('wa_disparos').insert({
    criado_por: user.id, agente, tipo, texto: texto || null,
    midia_url: midia?.url || null, midia_mime: midia?.mime || null, midia_nome: midia?.nome || null,
    executar_em: executar.toISOString(), total: alvo.length, filtros: e.filtros || {},
  }).select('id').single()
  if (error || !disparo) return { erro: migracao(error?.message || 'Falha ao criar o disparo') }
  const disparoId = (disparo as any).id as string

  const { error: e2 } = await admin.from('wa_followups').insert(alvo.map((c) => ({
    conversa_id: c.id,
    projeto_id: c.contato?.projeto_id || null,
    responsavel_id: c.responsavel_id || user.id,
    executar_em: executar.toISOString(),
    modo: 'texto_exato',
    mensagem: texto,
    cancelar_se_responder: false,
    disparo_id: disparoId,
    midia_url: midia?.url || null, midia_mime: midia?.mime || null, midia_nome: midia?.nome || null,
    agente,
  })))
  if (e2) {
    await admin.from('wa_disparos').delete().eq('id', disparoId)
    return { erro: migracao(e2.message) }
  }

  // "Agora": o primeiro lote sai já; o resto vai no cron (lotes de 30 a cada 5 min)
  let enviadosAgora = 0
  if (imediato) {
    const { executarFollowupsVencidos } = await import('@/lib/bianca/followups')
    const r = await executarFollowupsVencidos({ disparoId, limite: 5 }).catch(() => null)
    enviadosAgora = (r?.enviados || 0) + (r?.aguardando_cliente || 0)
  }
  revalidatePath('/spinzap')
  return { sucesso: true, disparo_id: disparoId, total: alvo.length, enviados_agora: enviadosAgora }
}

/** Últimos disparos (o admin vê todos; os demais, os seus) com o andamento. */
export async function disparosRecentesAction(): Promise<{ disparos: DisparoRecente[] } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  // RLS de wa_disparos: os próprios + admin
  const { data, error } = await supabase.from('wa_disparos')
    .select('id, criado_em, executar_em, agente, tipo, texto, total, status, autor:criado_por(nome_completo)')
    .order('criado_em', { ascending: false }).limit(8)
  if (error) return { erro: migracao(error.message) }
  const lista = (data || []) as any[]
  if (!lista.length) return { disparos: [] }
  const { data: envios } = await createAdminClient().from('wa_followups').select('disparo_id, status').in('disparo_id', lista.map((d) => d.id))
  const vazio = () => ({ agendado: 0, enviado: 0, aguardando_cliente: 0, aguardando_humano: 0, falhou: 0, cancelado: 0 })
  const cont = new Map<string, ReturnType<typeof vazio>>()
  for (const x of (envios || []) as any[]) {
    const c = cont.get(x.disparo_id) || vazio()
    if (x.status in c) (c as any)[x.status] += 1
    cont.set(x.disparo_id, c)
  }
  return {
    disparos: lista.map((d) => ({
      id: d.id, criado_em: d.criado_em, executar_em: d.executar_em, agente: d.agente, tipo: d.tipo, texto: d.texto,
      total: d.total, status: d.status, autor: String(d.autor?.nome_completo || '').split(' ')[0] || null,
      contagem: cont.get(d.id) || vazio(),
    })),
  }
}

/** Cancela o que ainda não saiu (o que já foi enviado fica). */
export async function cancelarDisparoAction(id: string): Promise<{ sucesso: true; cancelados: number } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: d } = await supabase.from('wa_disparos').select('id').eq('id', id).maybeSingle()
  if (!d) return { erro: 'Disparo não encontrado' }
  const admin = createAdminClient()
  const { data: cancelados } = await admin.from('wa_followups')
    .update({ status: 'cancelado', motivo: 'Disparo cancelado', executado_em: new Date().toISOString() })
    .eq('disparo_id', id).in('status', ['agendado', 'aguardando_cliente']).select('id')
  await admin.from('wa_disparos').update({ status: 'cancelado' }).eq('id', id)
  revalidatePath('/spinzap')
  return { sucesso: true, cancelados: (cancelados || []).length }
}
