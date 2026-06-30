import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PadraoForm } from '@/components/PadraoForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PadraoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    console.error('[padrao/page] Erro Supabase:', error)
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-2xl font-bold text-coral mb-2">Erro ao carregar projeto</h1>
          <p className="text-white/70 text-sm mb-4">{error.message}</p>
          <p className="text-white/40 text-xs">Code: {error.code}</p>
          <Link href={`/projetos/${params.id}`} className="mt-4 inline-block px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10">
            ← Voltar ao projeto
          </Link>
        </div>
      </main>
    )
  }

  if (!projeto) notFound()

  // Sugere tipo_ligacao da fatura (se já analisada)
  const tipoLigacaoSugerido = projeto.analise_fatura?.tipo_ligacao || null

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
              Passo 4 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Padrão de entrada CELESC
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Foto do quadro, padrão de entrada, aterramento, distância
          </p>
        </header>

        <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-xl p-4 mb-6">
          <p className="text-sm text-white/80">
            Esses dados alimentam a <strong className="text-white">auditoria de conformidade</strong> do
            dimensionamento — se o padrão atual comporta a potência do projeto OU se precisa upgrade.
          </p>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <PadraoForm
            projetoId={projeto.id}
            padraoSalvo={projeto.padrao_entrada}
            tipoLigacaoSugerido={tipoLigacaoSugerido}
          />
        </div>
      </div>
    </main>
  )
}
