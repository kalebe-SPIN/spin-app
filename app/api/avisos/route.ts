import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Avisos internos dos agentes pro usuário logado (Central da Bianca e card
 * do cliente — Kalebe 2026-10-06: saíram do sino).
 * GET    → não lidos (mais recentes primeiro)
 * POST   → { id } | { ids: [] } | { todos: true } marca como lido
 * DELETE → { id } | { ids: [] } | { todos: true } exclui
 * Cada um só mexe nos próprios (RLS na leitura/lido; exclusão pelo servidor
 * sempre filtrada pelo destinatário).
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('avisos_internos')
    .select('id, remetente_agente, titulo, mensagem, urgente, projeto_id, conversa_id, whatsapp_status, criado_em, projeto:projeto_id(codigo, cliente_razao_social)')
    .eq('destinatario_id', user.id)
    .is('lido_em', null)
    .order('criado_em', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ avisos: [] })
  return NextResponse.json({ avisos: data || [] })
}

function alvo(body: any): { todos: true } | { ids: string[] } | null {
  if (body?.todos) return { todos: true }
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : body?.id ? [body.id] : []
  return ids.length ? { ids } : null
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const a = alvo(await req.json().catch(() => ({})))
  if (!a) return NextResponse.json({ erro: 'Informe id, ids ou todos' }, { status: 400 })
  let q = supabase
    .from('avisos_internos')
    .update({ lido_em: new Date().toISOString() })
    .eq('destinatario_id', user.id)
    .is('lido_em', null)
  if ('ids' in a) q = q.in('id', a.ids)
  const { error } = await q
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const a = alvo(await req.json().catch(() => ({})))
  if (!a) return NextResponse.json({ erro: 'Informe id, ids ou todos' }, { status: 400 })
  // Sem policy de DELETE no RLS: o servidor exclui só os do próprio usuário
  let q = createAdminClient().from('avisos_internos').delete().eq('destinatario_id', user.id)
  if ('ids' in a) q = q.in('id', a.ids)
  else q = q.is('lido_em', null)   // "excluir todas" = as pendentes que estão na tela
  const { error } = await q
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
