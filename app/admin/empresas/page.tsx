import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EmpresasAdminClient } from '@/components/admin/EmpresasAdminClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Empresas e fornecedores (Kalebe 2026-10-19 — multiempresa): cada CNPJ/marca
 * tem o fornecedor que define catálogo e kit; a proposta sai com a marca da
 * empresa escolhida no kit. Clientes, Spinzap e precificação são os mesmos.
 */
export default async function AdminEmpresasPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto border border-coral/40 rounded-xl p-6">
          <h1 className="text-xl font-bold text-white">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">Só administradores cadastram empresas e fornecedores.</p>
        </div>
      </main>
    )
  }
  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-lg mx-auto">
        <header className="mb-6">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">← Voltar ao admin</Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">Empresas e fornecedores</h1>
          <p className="text-white/60 mt-1 text-sm">
            Cada empresa (CNPJ e marca) tem o fornecedor que define o catálogo e a montagem do kit. Na hora do kit,
            quem monta a proposta escolhe a empresa — o PDF sai com a marca dela e o cliente ganha a etiqueta no Spinzap.
            Clientes, conversas, agenda e precificação são os mesmos pras duas.
          </p>
        </header>
        <EmpresasAdminClient />
      </div>
    </main>
  )
}
