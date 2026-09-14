import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AdminAgentesClient } from '@/components/admin/AdminAgentesClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminAgentesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const { data: agentes } = await supabase
    .from('wa_agentes')
    .select('*')
    .order('ordem_prioridade', { ascending: true })

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/whatsapp" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Painel WhatsApp
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            🤖 Agentes IA do canal Spin
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Cada agente atende uma finalidade específica no canal +55 48 3263-0182.
            Você edita a persona, o prompt e as regras aqui.
          </p>
        </header>

        <AdminAgentesClient agentesIniciais={(agentes || []) as any[]} />
      </div>
    </main>
  )
}
