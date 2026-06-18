import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Logout — POST /api/auth/signout
 * Limpa a sessão Supabase e redireciona pra /login.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  await supabase.auth.signOut()

  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/login`, { status: 302 })
}
