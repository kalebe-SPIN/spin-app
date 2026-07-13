import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FaturaSemFaturaTabs } from '@/components/FaturaSemFaturaTabs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function FaturaPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Passo 2 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Fatura & consumo
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Escolha entre analisar a fatura CELESC ou entrar com dados rápidos
          </p>
        </header>

        <FaturaSemFaturaTabs
          projetoId={projeto.id}
          analiseSalva={projeto.analise_fatura}
          beneficiariasSalvas={projeto.beneficiarias || []}
          origemAtual={projeto.origem_dimensionamento}
        />
      </div>
    </main>
  )
}
