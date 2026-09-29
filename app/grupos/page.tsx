import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { GruposClient } from '@/components/grupos/GruposClient'

export const dynamic = 'force-dynamic'

/**
 * /grupos — grupos internos por setor (Kalebe 2026-09-29). A Bianca
 * administra e repassa por eles campanhas, mensagens internas e avisos.
 */
export default async function GruposPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="max-w-screen-xl mx-auto">
        <header className="mb-5">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-1 inline-block">← Dashboard</Link>
          <h1 className="text-2xl md:text-3xl font-black text-white">👥 Grupos da equipe</h1>
          <p className="text-white/60 text-xs mt-0.5">
            Um grupo por setor. A Bianca administra: campanhas, recados e avisos chegam aqui e no sino de cada um.
          </p>
        </header>
        <GruposClient usuarioId={user.id} />
      </div>
    </main>
  )
}
