import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware do Next.js — roda em TODA requisição.
 *
 * Responsabilidades:
 * 1. Atualizar cookies de auth do Supabase (sessão sempre fresca)
 * 2. Proteger rotas privadas (/dashboard, /conta) — se não logado → /login
 * 3. Redirecionar usuários logados que tentam entrar em /login → /dashboard
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fail-soft: se env vars não estão definidas em runtime, não bloqueia — só loga
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] Supabase envs faltando — pulando auth check')
    return response
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const url = request.nextUrl.clone()
    const pathname = url.pathname

    // Rotas protegidas (requerem login)
    const rotasPrivadas = [
      '/dashboard', '/conta', '/admin', '/parceiro', '/cliente',
      '/projetos', '/crm', '/agenda', '/homologacoes',
    ]
    const ehRotaPrivada = rotasPrivadas.some((r) => pathname.startsWith(r))

    // Não logado tentando acessar rota privada → manda pro login
    if (!user && ehRotaPrivada) {
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // Logado tentando acessar /login → manda pro dashboard
    if (user && pathname === '/login') {
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    return response
  } catch (err: any) {
    // Fail-soft: qualquer erro no middleware não pode bloquear a app inteira
    console.error('[middleware] erro:', err?.message || err)
    return response
  }
}

export const config = {
  matcher: [
    // Roda em todas rotas EXCETO arquivos estáticos e _next
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
