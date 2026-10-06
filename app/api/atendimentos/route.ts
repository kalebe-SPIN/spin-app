import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { HORAS_STANDBY } from '@/lib/bianca/atendimentos'

export const dynamic = 'force-dynamic'

/**
 * Sino da Bianca (Kalebe 2026-10-06): só atendimentos — cliente esperando
 * resposta ou conversa em standby (migration 139, wa_atendimentos_pendentes).
 * GET  → lista do usuário logado
 * POST → { conversa_id } dispensa uma | { ids: [] } dispensa várias
 *        (sai do sino até chegar mensagem nova na conversa)
 */

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const { data, error } = await supabase.rpc('wa_atendimentos_pendentes', { p_standby_horas: HORAS_STANDBY })
  if (error) {
    const semMigration = /wa_atendimentos_pendentes|function/.test(error.message)
    return NextResponse.json({ atendimentos: [], aviso: semMigration ? 'Falta rodar a migration 139 (sino de atendimentos).' : error.message })
  }
  return NextResponse.json({ atendimentos: data || [], horas_standby: HORAS_STANDBY })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : body?.conversa_id ? [body.conversa_id] : []
  if (!ids.length) return NextResponse.json({ erro: 'Informe conversa_id ou ids' }, { status: 400 })

  const agora = new Date().toISOString()
  const { error } = await supabase.from('wa_pendencias_dispensadas')
    .upsert(ids.map((conversa_id) => ({ conversa_id, usuario_id: user.id, dispensada_em: agora })))
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
