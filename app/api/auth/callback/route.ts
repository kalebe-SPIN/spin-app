import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Callback de auth — chamado pelo Supabase após login com magic link/OAuth.
 * Troca o code temporário por uma sessão válida e redireciona pro dashboard.
 *
 * URL completa: /api/auth/callback?code=xxxxx
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Algo deu errado — manda pra login com mensagem
  return NextResponse.redirect(`${origin}/login?erro=callback-falhou`)
}
