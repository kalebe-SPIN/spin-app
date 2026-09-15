import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Proxy de mídia WhatsApp.
 *
 * Kalebe 2026-09-15: Meta guarda mídia em URLs temporárias com auth Bearer.
 * O <audio>/<img>/<video> do browser não pode injetar Authorization header,
 * então proxy-a via server: browser bate aqui, nós baixamos da Meta com
 * token e devolvemos o binário com content-type original.
 *
 * Cache 60s pra evitar chamar a Meta múltiplas vezes ao dar play/replay.
 *
 * Gate: só usuários autenticados que tenham acesso à conversa (via wa_mensagens
 * RLS quando implementado). MVP: qualquer authenticated user, pra desatolar.
 *
 * URL: /api/whatsapp/media/{metaId}
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { metaId: string } },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ erro: 'Meta API não configurada' }, { status: 500 })

  const metaId = params.metaId
  if (!metaId) return NextResponse.json({ erro: 'metaId ausente' }, { status: 400 })

  try {
    // 1. Descobre a URL temporária da mídia
    const infoResp = await fetch(`https://graph.facebook.com/v20.0/${metaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!infoResp.ok) {
      const err = await infoResp.json().catch(() => ({}))
      return NextResponse.json({ erro: err?.error?.message || 'Meta info erro' }, { status: 404 })
    }
    const info = await infoResp.json()
    const url = info?.url
    const mime = info?.mime_type || 'application/octet-stream'
    if (!url) return NextResponse.json({ erro: 'Mídia sem URL' }, { status: 404 })

    // 2. Baixa a mídia (também precisa Bearer)
    const mediaResp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!mediaResp.ok) {
      return NextResponse.json({ erro: 'Falha baixando mídia' }, { status: 502 })
    }
    const buffer = await mediaResp.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': 'inline',
      },
    })
  } catch (e: any) {
    console.error('[wa/media]', e)
    return NextResponse.json({ erro: e?.message || 'erro desconhecido' }, { status: 500 })
  }
}
