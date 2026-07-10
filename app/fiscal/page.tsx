import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModuloHub } from '@/components/ModuloHub'

export const dynamic = 'force-dynamic'

export default async function FiscalHubPage() {
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
          <p className="text-white/60 text-sm mt-2">Fiscal é exclusivo do admin.</p>
        </div>
      </main>
    )
  }

  const [
    { count: notas },
    { count: contratos },
    { count: documentos },
  ] = await Promise.all([
    supabase.from('notas_fiscais').select('id', { count: 'exact', head: true }).eq('status', 'emitida'),
    supabase.from('contratos').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
    supabase.from('documentos_projeto').select('id', { count: 'exact', head: true }),
  ])

  return (
    <ModuloHub
      titulo="Fiscal & Legal"
      icone="📄"
      descricao="Notas fiscais, contratos e documentos"
      cards={[
        {
          href: '/fiscal/notas',
          emoji: '🧾',
          titulo: 'Notas Fiscais',
          desc: 'Emissão NFe (produto) e NFSe (serviço).',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-verde">{notas || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">emitidas</span>
            </div>
          ),
          restrito: true,
          emBreve: true,
        },
        {
          href: '/fiscal/contratos',
          emoji: '📜',
          titulo: 'Contratos',
          desc: 'Modelos + assinatura digital + versionamento.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-sol">{contratos || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">ativos</span>
            </div>
          ),
          restrito: true,
          emBreve: true,
        },
        {
          href: '/fiscal/documentos',
          emoji: '📎',
          titulo: 'Documentos',
          desc: 'Anexos organizados por projeto e cliente.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10">
              <span className="text-xl font-black text-white">{documentos || 0}</span>
              <span className="text-[10px] uppercase text-white/50 ml-1">arquivos</span>
            </div>
          ),
          emBreve: true,
        },
      ]}
    />
  )
}
