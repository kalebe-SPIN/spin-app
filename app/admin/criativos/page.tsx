import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CriativosAdminClient, type CriativoRow } from '@/components/criativos/CriativosAdminClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminCriativosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
          <p className="text-white/60 text-sm mt-2">Somente admin gerencia criativos.</p>
        </div>
      </main>
    )
  }

  const { data: criativos } = await supabase
    .from('criativos_vendas')
    .select('id, tipo, titulo, descricao, categoria, arquivo_url, texto, mensagem_whatsapp_template, ativo, criado_em')
    .order('criado_em', { ascending: false })

  const bucketPublicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/criativos-vendas`

  return (
    <main className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-screen-2xl mx-auto">
        <nav className="mb-4">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/70">← Admin</Link>
        </nav>
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black text-white">
            📚 Biblioteca de <span className="text-sol">criativos</span>
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Imagens, vídeos, PDFs e mensagens de texto pra o vendedor usar na abordagem do cliente.
            Cadastrados aqui aparecem em <code className="text-sol">/biblioteca</code> e no botão dentro do card do CRM.
          </p>
        </header>

        <CriativosAdminClient
          criativos={(criativos || []) as CriativoRow[]}
          bucketPublicUrl={bucketPublicUrl}
        />
      </div>
    </main>
  )
}
