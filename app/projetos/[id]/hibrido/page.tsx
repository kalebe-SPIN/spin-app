import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { HibridoWizard } from '@/components/HibridoWizard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function HibridoPage({
  params, searchParams,
}: {
  params: { id: string }
  searchParams: { item?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social, padrao_entrada')
    .eq('id', params.id)
    .single()

  if (!projeto) notFound()

  const tipoLigacao = (projeto.padrao_entrada?.tipo_ligacao || 'monofasico') as any

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-verde/10 text-verde">
              Sistema Híbrido · BESS
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            🔋 Dimensionamento híbrido com armazenamento
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Análise de demanda → Composição WEG (inversor SIW + baterias SBW)
          </p>
        </header>

        <HibridoWizard
          projetoId={projeto.id}
          itemId={searchParams.item}
          tipoLigacao={tipoLigacao}
        />
      </div>
    </main>
  )
}
