import { NextRequest, NextResponse } from 'next/server'
import { getWaConfig } from '@/lib/whatsapp/config'
import { executarFollowupsVencidos } from '@/lib/bianca/followups'

/**
 * Follow-ups agendados nas conversas (Bianca executa). Chamado a cada 5 min
 * pelo pg_cron do Supabase (migration 123) com Authorization: Bearer
 * wa_config.cron_secret.
 */

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cfg = await getWaConfig()
  const auth = req.headers.get('authorization')
  if (!cfg.cron_secret || auth !== `Bearer ${cfg.cron_secret}`) {
    return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })
  }
  try {
    const r = await executarFollowupsVencidos()
    if (r.vencidos > 0) console.log('[cron/followups]', JSON.stringify(r))
    return NextResponse.json({ sucesso: true, ...r })
  } catch (e: any) {
    console.error('[cron/followups]', e)
    return NextResponse.json({ erro: e?.message }, { status: 500 })
  }
}
