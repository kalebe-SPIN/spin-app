import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ClienteForm } from '@/components/ClienteForm'

export const dynamic = 'force-dynamic'

export default async function NovoClientePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <Link href="/crm/clientes" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Clientes
          </Link>
          <h1 className="text-2xl md:text-3xl font-black text-white">➕ Novo cliente</h1>
          <p className="text-white/60 mt-1 text-sm">
            Cadastra os dados. Você poderá vincular projetos, contratos e interações depois.
          </p>
        </header>

        <ClienteForm />
      </div>
    </main>
  )
}
