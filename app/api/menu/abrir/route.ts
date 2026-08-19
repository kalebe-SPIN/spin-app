import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gerarToken, hashToken, HANDOFF_TTL_HORAS } from '@/lib/menu-handoff'

export const dynamic = 'force-dynamic'

const MENU_URL = process.env.NEXT_PUBLIC_MENU_URL || 'https://menu.spinsolar.com.br'

/**
 * GET /api/menu/abrir
 *
 * Ponte do portal para o catálogo. O consultor logado clica no card
 * "Catálogo Spin" e cai aqui: geramos um token de handoff e redirecionamos
 * pra menu.spinsolar.com.br/on-grid/?ms=<token>.
 *
 * Query params opcionais:
 *   ?kit=KIT-RES-005  → abre o catálogo já com o kit selecionado
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const login = new URL('/login', req.nextUrl.origin)
    login.searchParams.set('redirect', '/api/menu/abrir')
    return NextResponse.redirect(login)
  }

  // Só admin ou consultor solar (representante) ativo abre o catálogo autenticado.
  // Vendedor de serviços e profissional de campo não tem fluxo comercial de FV.
  const { data: perfil } = await supabase
    .from('profiles')
    .select('ativo, role')
    .eq('id', user.id)
    .single()

  if (!perfil?.ativo) {
    return NextResponse.redirect(new URL('/dashboard?erro=perfil_inativo', req.nextUrl.origin))
  }
  if (perfil.role !== 'admin' && perfil.role !== 'representante') {
    return NextResponse.redirect(new URL('/dashboard?erro=sem_acesso_menu', req.nextUrl.origin))
  }

  const token = gerarToken()
  const expiraEm = new Date(Date.now() + HANDOFF_TTL_HORAS * 60 * 60 * 1000)

  const admin = createAdminClient()
  const { error } = await admin.from('menu_sessoes').insert({
    token_hash: hashToken(token),
    consultor_id: user.id,
    expira_em: expiraEm.toISOString(),
    user_agent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
  })

  if (error) {
    console.error('[menu/abrir] erro ao criar sessão:', error.message)
    return NextResponse.redirect(new URL('/dashboard?erro=menu_sessao', req.nextUrl.origin))
  }

  const destino = new URL('/on-grid/', MENU_URL)
  destino.searchParams.set('ms', token)

  const kit = req.nextUrl.searchParams.get('kit')
  if (kit) destino.searchParams.set('kit', kit)

  return NextResponse.redirect(destino)
}
