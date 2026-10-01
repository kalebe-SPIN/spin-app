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
    .from('profiles').select('role, nome_completo, ativo').eq('id', user.id).maybeSingle()
  // Kalebe 2026-10-01: toda a equipe ativa usa o inbox (profissional de campo
  // recebe atendimento transferido). A lista antiga só tinha admin e
  // representante — 'consultor' e 'sdr' nem existem no enum user_role.
  const podeAcessar = !!perfil?.role && perfil.role !== 'candidato' && perfil.ativo !== false
  if (!podeAcessar) redirect('/dashboard')

  return (
    // Sem min-h-screen: o painel do inbox já ocupa o resto da tela; min-h
    // somado ao cabeçalho do portal fazia a página rolar.
    <main>
      {/* Kalebe 2026-09-30: topo enxuto no celular — o espaço é da conversa */}
      <header className="border-b border-white/10 px-4 sm:px-6 md:px-8 py-2.5 sm:py-4 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="hidden sm:inline-block text-xs text-white/40 hover:text-white/60 mb-1">
            ← Dashboard
          </Link>
          <h1 className="text-lg sm:text-2xl md:text-3xl font-black text-white">
            💬 Inbox WhatsApp
          </h1>
          <p className="hidden sm:block text-white/60 text-xs mt-0.5">
            Canal Spin — leads de campanha, atendimento e comunicação interna. Multi-persona no mesmo número.
          </p>
        </div>
        {/* Kalebe 2026-09-30: Grupos da equipe acessados pelo Inbox (saiu do menu) */}
        <Link
          href="/grupos"
          className="shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white/80 hover:bg-white/10 hover:text-white"
        >
          👥 Grupos da equipe
        </Link>
      </header>

      <InboxClient
        usuarioId={user.id}
        usuarioNome={perfil?.nome_completo || null}
        usuarioRole={perfil?.role || null}
      />
    </main>
  )
}
