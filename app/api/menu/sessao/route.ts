import { NextRequest, NextResponse } from 'next/server'
import { validarToken, corsHeaders, jsonCors } from '@/lib/menu-handoff'

export const dynamic = 'force-dynamic'

/**
 * POST /api/menu/sessao
 * Body: { token: string }
 *
 * Chamada pelo catálogo (menu.spinsolar.com.br) logo após detectar ?ms= na
 * URL, e de novo a cada carregamento de página enquanto a sessão durar.
 * Devolve quem é o consultor — o menu usa isso pra liberar o botão de
 * proposta e mostrar a barra "conectado como X".
 *
 * Nunca devolve dado sensível: só nome, papel e validade.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  let token = ''
  try {
    const body = await req.json()
    token = String(body?.token || '')
  } catch {
    return jsonCors({ ok: false, erro: 'Body inválido' }, origin, 400)
  }

  const sessao = await validarToken(token)

  if (!sessao) {
    return jsonCors(
      { ok: false, erro: 'Sessão inválida ou expirada. Abra o catálogo de novo pelo portal.' },
      origin,
      401
    )
  }

  return jsonCors(
    {
      ok: true,
      consultor: {
        nome: sessao.nome,
        role: sessao.role,
        telefone: sessao.telefone,
      },
      expiraEm: sessao.expiraEm,
    },
    origin
  )
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}
