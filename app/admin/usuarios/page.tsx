import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminUsuariosClient } from '@/components/AdminUsuariosClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Admin de usuários — lista todos, convida novo, muda role, ativa/desativa.
 * Só admin. Substitui o Supabase Studio pra 90% dos casos.
 */
export default async function AdminUsuariosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">
            Somente administradores podem gerenciar usuários.
          </p>
        </div>
      </main>
    )
  }

  // Precisa do admin client pra ler auth.users (emails, confirmação, último login)
  const admin = createAdminClient()

  const [{ data: profiles }, { data: authList }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, nome_completo, telefone, role, avatar_url, ativo, created_at, updated_at')
      .order('created_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 500 }),
  ])

  // Junta perfil + email/last_sign_in do auth.users
  const authById = new Map(
    (authList?.users || []).map(u => [u.id, u]),
  )

  const usuarios = (profiles || []).map(p => {
    const au = authById.get(p.id)
    return {
      ...p,
      email: au?.email || null,
      email_confirmado: !!au?.email_confirmed_at,
      ultimo_login: au?.last_sign_in_at || null,
      convite_pendente: !au?.last_sign_in_at && !!au?.invited_at,
    }
  })

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <Link href="/admin" className="text-white/60 text-sm hover:text-white transition">
            ← Voltar ao admin
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white">
            👥 Usuários <span className="text-sol">& permissões</span>
          </h1>
          <p className="text-white/60 mt-2 text-sm leading-relaxed">
            Convide novos usuários por email, edite roles, ative/desative.
            Substitui o Supabase Studio pra 90% dos casos do dia a dia.
          </p>
        </header>

        <AdminUsuariosClient usuarios={usuarios} meuId={user.id} />
      </div>
    </main>
  )
}
