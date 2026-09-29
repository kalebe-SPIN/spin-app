import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { carregarFluxo } from '@/lib/financeiro/dados'
import { FluxoCaixaClient } from '@/components/financeiro/FluxoCaixaClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * /financeiro/fluxo-caixa — previsto × realizado, integrado às vendas do
 * sistema (Kalebe 2026-09-29). Exclusivo do admin.
 */
export default async function FluxoCaixaPage({ searchParams }: { searchParams: { aba?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
          <p className="text-white/60 text-sm mt-2">Fluxo de caixa é exclusivo do admin.</p>
        </div>
      </main>
    )
  }

  const dados = await carregarFluxo()

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-5">
          <Link href="/financeiro" className="text-xs text-white/40 hover:text-white/60 mb-1 inline-block">← Financeiro</Link>
          <h1 className="text-2xl md:text-3xl font-black text-white">📊 Fluxo de caixa</h1>
          <p className="text-white/60 text-xs mt-0.5">
            Tudo entra como <strong>previsto</strong>; ao pagar ou receber de fato, clique em <strong>✓ Efetivar</strong> e informe o valor real.
            Vendas fechadas no sistema chegam em “Vendas a programar” com os custos do orçamento.
          </p>
        </header>
        {'erro' in dados ? (
          <div className="bg-sol/10 border border-sol/30 rounded-xl p-5 text-sm text-sol">⚠️ {dados.erro}</div>
        ) : (
          <FluxoCaixaClient dados={dados} abaInicial={searchParams?.aba} />
        )}
      </div>
    </main>
  )
}
