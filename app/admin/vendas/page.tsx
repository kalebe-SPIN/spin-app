import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { VendasManuaisClient } from '@/components/admin/VendasManuaisClient'

/**
 * /admin/vendas — cadastro/descadastro manual de vendas (Kalebe 2026-09-11).
 * Só admin. As vendas somam automaticamente nos blocos do /dashboard.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function VendasManuaisPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  // Fetch vendas do mês corrente + últimos 60 dias, ordenado por data
  const dSessentaAtras = new Date()
  dSessentaAtras.setDate(dSessentaAtras.getDate() - 60)
  const dSessentaIso = dSessentaAtras.toISOString().slice(0, 10)

  const { data: vendas } = await supabase
    .from('vendas_manuais')
    .select('*, criador:criada_por(nome_completo), vendedor:vendedor_id(nome_completo)')
    .gte('data_venda', dSessentaIso)
    .order('data_venda', { ascending: false })
    .limit(500)

  // Fetch consultores + admins (ativos) pra dropdown de vendedor
  const { data: vendedores } = await supabase
    .from('profiles')
    .select('id, nome_completo, role')
    .in('role', ['admin', 'representante', 'consultor'])
    .eq('ativo', true)
    .order('nome_completo')

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Vendas manuais
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Cadastro do admin — vendas que fecharam fora do fluxo normal.
            Somam automaticamente no painel do mês.
          </p>
        </header>

        <VendasManuaisClient
          vendasIniciais={(vendas || []) as any[]}
          vendedores={(vendedores || []) as any[]}
        />
      </div>
    </main>
  )
}
