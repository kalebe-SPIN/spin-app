import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { InboxClient } from '@/components/inbox/InboxClient'

/**
 * /inbox — canal WhatsApp Spin (Sprint 1).
 * Lista de conversas + timeline + envio de texto.
 * Realtime nas 3 tabelas wa_*.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function InboxPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles').select('role, nome_completo').eq('id', user.id).maybeSingle()
  const podeAcessar = ['admin', 'representante', 'consultor', 'sdr'].includes(perfil?.role || '')
  if (!podeAcessar) redirect('/dashboard')

  return (
    // Sem min-h-screen: o painel do inbox já ocupa o resto da tela; min-h
    // somado ao cabeçalho do portal fazia a página rolar.
    <main>
      <header className="border-b border-white/10 px-4 sm:px-6 md:px-8 py-4 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-1 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-2xl md:text-3xl font-black text-white">
            💬 Inbox WhatsApp
          </h1>
          <p className="text-white/60 text-xs mt-0.5">
            Canal Spin — leads de campanha, atendimento e comunicação interna. Multi-persona no mesmo número.
          </p>
        </div>
      </header>

      <InboxClient
        usuarioId={user.id}
        usuarioNome={perfil?.nome_completo || null}
        usuarioRole={perfil?.role || null}
      />
    </main>
  )
}
