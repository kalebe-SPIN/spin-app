import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SeletorTiposClient } from '@/components/SeletorTiposClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TiposProjetoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Tipos já selecionados
  const { data: itensExistentes } = await supabase
    .from('projeto_itens')
    .select('tipo')
    .eq('projeto_id', projeto.id)
    .neq('status', 'removido')

  const tiposJaEscolhidos = (itensExistentes || []).map((x) => x.tipo as any)

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Tipos de proposta
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            O que a Spin vai fornecer?
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Escolha um ou mais itens — pode combinar solar + BESS + serviços numa mesma proposta
          </p>
        </header>

        <SeletorTiposClient
          projetoId={projeto.id}
          tiposJaEscolhidos={tiposJaEscolhidos}
        />
      </div>
    </main>
  )
}
