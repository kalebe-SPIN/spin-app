import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
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
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">Área exclusiva do administrador.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white">Admin</h1>
          <p className="text-white/60 mt-1 text-sm">Configurações centralizadas do portal.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AdminCard
            href="/admin/empresa"
            icon="🏢"
            titulo="Configurações da empresa"
            desc="Dados da Spin + responsável técnico (usados nos diagramas)."
          />
          <AdminCard
            href="/admin/usuarios"
            icon="👥"
            titulo="Usuários e permissões"
            desc="Autorizar consultores a gerar diagramas técnicos."
            emBreve
          />
          <AdminCard
            href="/admin/pricing"
            icon="💰"
            titulo="Painel de precificação"
            desc="Margens, custos, regras de desconto."
            emBreve
          />
          <AdminCard
            href="/admin/catalogo"
            icon="📊"
            titulo="Catálogo WEG"
            desc="Uploads de planilha, estoque e datasheets dos produtos."
          />
        </div>
      </div>
    </main>
  )
}

function AdminCard({
  href, icon, titulo, desc, emBreve,
}: {
  href: string; icon: string; titulo: string; desc: string; emBreve?: boolean
}) {
  const conteudo = (
    <div className={`p-6 bg-white/[0.03] border border-white/10 rounded-xl transition ${
      emBreve ? 'opacity-40 cursor-not-allowed' : 'hover:border-sol/40 hover:bg-white/[0.05]'
    }`}>
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-bold text-white mb-1 flex items-center gap-2">
        {titulo}
        {emBreve && <span className="text-[10px] uppercase font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded">em breve</span>}
      </h3>
      <p className="text-sm text-white/60">{desc}</p>
    </div>
  )

  return emBreve ? conteudo : <Link href={href}>{conteudo}</Link>
}
