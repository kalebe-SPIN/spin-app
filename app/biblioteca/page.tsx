import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BibliotecaClient } from '@/components/criativos/BibliotecaClient'
import type { CriativoRow } from '@/components/criativos/CriativosAdminClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Biblioteca de criativos — leitura pra qualquer usuário autenticado.
 * Vendedor consome pra enviar aos clientes por WhatsApp.
 */
export default async function BibliotecaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: criativos } = await supabase
    .from('criativos_vendas')
    .select('id, tipo, titulo, descricao, categoria, arquivo_url, texto, mensagem_whatsapp_template, ativo, criado_em')
    .eq('ativo', true)
    .order('criado_em', { ascending: false })

  const bucketPublicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/criativos-vendas`

  return (
    <main className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-screen-2xl mx-auto">
        <nav className="mb-4">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/70">← Dashboard</Link>
        </nav>
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black text-white">
            📚 <span className="text-sol">Biblioteca</span> de vendas
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Escolhe um criativo e envia pro cliente pelo WhatsApp em 1 clique.
          </p>
        </header>

        <BibliotecaClient
          criativos={(criativos || []) as CriativoRow[]}
          bucketPublicUrl={bucketPublicUrl}
        />
      </div>
    </main>
  )
}
