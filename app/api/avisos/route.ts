import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Avisos internos dos agentes pro usuário logado (sino do portal).
 * GET  → não lidos (mais recentes primeiro)
 * POST → { id } marca um como lido | { todos: true } marca todos
 * RLS garante que cada um só vê/altera os próprios.
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
    .limit(30)

  if (error) return NextResponse.json({ avisos: [] })
  return NextResponse.json({ avisos: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  let q = supabase
    .from('avisos_internos')
    .update({ lido_em: new Date().toISOString() })
    .eq('destinatario_id', user.id)
    .is('lido_em', null)
  if (!body?.todos) {
    if (!body?.id) return NextResponse.json({ erro: 'Informe id ou todos' }, { status: 400 })
    q = q.eq('id', body.id)
  }
  const { error } = await q
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
