import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CidadesAdminClient, type CidadeRow } from '@/components/admin/CidadesAdminClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminCidadesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
        </div>
      </main>
    )
  }

  const { data: cidades } = await supabase
    .from('cidades_distancia')
    .select('id, cidade, uf, km, observacao, ativo, criado_em, atualizado_em')
    .order('km', { ascending: true })

  return (
    <main className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-screen-xl mx-auto">
        <nav className="mb-4">
          <Link href="/admin/precificacao" className="text-xs text-white/40 hover:text-white/70">
            ← Precificação
          </Link>
        </nav>
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black text-white">
            🗺 Cidades <span className="text-sol">atendidas</span>
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Distância de cada cidade até a sede (Tijucas/SC). Usado pelo simulador de
            proposta em <code className="text-sol">/crm/servicos</code> pra calcular
            deslocamento automático.
          </p>
        </header>

        <CidadesAdminClient cidades={(cidades || []) as CidadeRow[]} />
      </div>
    </main>
  )
}
