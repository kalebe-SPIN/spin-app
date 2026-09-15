import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { StatusSetupClient } from '@/components/admin/StatusSetupClient'

/**
 * /admin/whatsapp/setup — checklist de saúde da integração.
 * Kalebe 2026-09-15: mostra o que tá pronto/pendente pro cutover TROIA→Spin.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SetupCanalPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/whatsapp" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Painel WhatsApp
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            🔧 Setup do canal Spin
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Checklist do cutover TROIA → Spin. Cada item verde é uma dependência resolvida.
          </p>
        </header>

        <StatusSetupClient />
      </div>
    </main>
  )
}
