import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FaixasPrecosClient } from '@/components/FaixasPrecosClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function FaixasPrecosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
        </div>
      </main>
    )
  }

  const { data: faixas } = await supabase
    .from('faixas_precificacao_servicos')
    .select('*')
    .order('chave_servico')
    .order('ordem')

  const servicos = new Set((faixas || []).map((f: any) => f.chave_servico))

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/precificacao/servicos" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Parâmetros dos serviços
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Faixas de preço por serviço
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Referência rápida por tamanho de sistema. Serve pra cotação inicial e como piso mínimo opcional.
          </p>
        </header>

        {(!faixas || faixas.length === 0) && (
          <div className="p-8 bg-white/[0.02] border border-dashed border-white/10 rounded-lg text-center">
            <p className="text-white/40 text-sm">Nenhuma faixa cadastrada. Rode a Migration 051 no Supabase.</p>
          </div>
        )}

        {Array.from(servicos).map((chave: any) => {
          const faixasDoServico = (faixas || []).filter((f: any) => f.chave_servico === chave)
          return (
            <FaixasPrecosClient
              key={chave}
              chaveServico={chave}
              faixas={faixasDoServico}
            />
          )
        })}
      </div>
    </main>
  )
}
