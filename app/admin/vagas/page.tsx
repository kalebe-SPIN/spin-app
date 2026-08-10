import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ConvitesTrabalhoClient } from '@/components/admin/ConvitesTrabalhoClient'

export const dynamic = 'force-dynamic'

/** Admin — Convites de trabalho (recrutamento). */
export default async function AdminVagasPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
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

  const { data: convites } = await supabase
    .from('convites_trabalho')
    .select('id, nome_candidato, email_candidato, telefone, zona, cargo, status, entradas_usadas, max_entradas, bloqueado, tipo_proposta, created_at')
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <nav className="mb-6">
          <Link href="/admin" className="text-sm text-white/50 hover:text-sol transition-colors">← Voltar ao admin</Link>
        </nav>
        <header className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white">🤝 Convites de trabalho</h1>
            <p className="text-white/60 mt-1 text-sm">
              Gere o acesso do candidato. Ele entra em <span className="text-sol">app.spinsolar.com.br/vaga/login</span>,
              lê a proposta, assina o contrato e envia os documentos. O login funciona só 2 vezes e depois expira.
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            <Link
              href="/admin/vagas/previa?tipo=solar"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-sol/15 border border-sol/40 text-sol font-semibold rounded-lg hover:bg-sol/25 transition-colors whitespace-nowrap text-sm"
            >
              👁 Prévia — Vendas Solar ↗
            </Link>
            <Link
              href="/admin/vagas/previa?tipo=comercial"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-sol/15 border border-sol/40 text-sol font-semibold rounded-lg hover:bg-sol/25 transition-colors whitespace-nowrap text-sm"
            >
              👁 Prévia — Comercial O&M ↗
            </Link>
            <Link
              href="/admin/vagas/previa?tipo=campo"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-weg-azul/15 border border-weg-azul/40 text-white font-semibold rounded-lg hover:bg-weg-azul/25 transition-colors whitespace-nowrap text-sm"
            >
              👁 Prévia — Profissional de Campo ↗
            </Link>
          </div>
        </header>

        <ConvitesTrabalhoClient convites={convites || []} />
      </div>
    </main>
  )
}
