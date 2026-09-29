import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModuloHub } from '@/components/ModuloHub'
import { carregarFluxo } from '@/lib/financeiro/dados'

export const dynamic = 'force-dynamic'

export default async function FinanceiroHubPage() {
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
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
          <p className="text-white/60 text-sm mt-2">Financeiro é exclusivo do admin.</p>
        </div>
      </main>
    )
  }

  const hojeYMD = new Date().toISOString().slice(0, 10)

  const [
    { count: receberAbertas },
    { count: receberVencidas },
    { count: pagarAbertas },
    { count: pagarVencidas },
  ] = await Promise.all([
    supabase.from('contas_receber').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
    supabase.from('contas_receber').select('id', { count: 'exact', head: true }).eq('status', 'aberta').lt('data_vencimento', hojeYMD),
    supabase.from('contas_pagar').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
    supabase.from('contas_pagar').select('id', { count: 'exact', head: true }).eq('status', 'aberta').lt('data_vencimento', hojeYMD),
  ])

  // Fluxo de caixa: vendas aguardando programação + previstos atrasados (silencioso sem a migration 127)
  const fluxo = { pendentes: 0, atrasados: 0 }
  try {
    const dados = await carregarFluxo()
    if (!('erro' in dados)) {
      fluxo.pendentes = dados.pendentes.length
      fluxo.atrasados = dados.lancamentos.filter((l) => !l.data_realizada && l.data_prevista < hojeYMD).length
    }
  } catch {}

  return (
    <ModuloHub
      titulo="Financeiro"
      icone="💰"
      descricao="Contas a receber, pagar, fluxo de caixa e DRE"
      cards={[
        {
          href: '/financeiro/contas-receber',
          emoji: '📥',
          titulo: 'Contas a Receber',
          desc: 'Parcelas das propostas aceitas e recebíveis.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10 flex gap-3">
              <div><span className="text-xl font-black text-verde">{receberAbertas || 0}</span><span className="text-[10px] uppercase text-white/50 ml-1">abertas</span></div>
              <div><span className="text-xl font-black text-coral">{receberVencidas || 0}</span><span className="text-[10px] uppercase text-white/50 ml-1">vencidas</span></div>
            </div>
          ),
          restrito: true,
          emBreve: true,
        },
        {
          href: '/financeiro/contas-pagar',
          emoji: '📤',
          titulo: 'Contas a Pagar',
          desc: 'Fornecedores, salários, custos fixos.',
          stats: (
            <div className="mt-3 pt-2 border-t border-white/10 flex gap-3">
              <div><span className="text-xl font-black text-coral">{pagarAbertas || 0}</span><span className="text-[10px] uppercase text-white/50 ml-1">abertas</span></div>
              <div><span className="text-xl font-black text-coral">{pagarVencidas || 0}</span><span className="text-[10px] uppercase text-white/50 ml-1">vencidas</span></div>
            </div>
          ),
          restrito: true,
          emBreve: true,
        },
        {
          // Kalebe 2026-09-29: fluxo de caixa previsto × realizado
          href: '/financeiro/fluxo-caixa',
          emoji: '📊',
          titulo: 'Fluxo de Caixa',
          desc: 'Previsto × realizado, custos e despesas, passivo bancário, impostos, capital de giro e fornecedores — integrado às vendas.',
          stats: fluxo.pendentes > 0 || fluxo.atrasados > 0 ? (
            <div className="mt-3 pt-2 border-t border-white/10 flex gap-3">
              <div><span className="text-xl font-black text-sol">{fluxo.pendentes}</span><span className="text-[10px] uppercase text-white/50 ml-1">vendas a programar</span></div>
              <div><span className="text-xl font-black text-coral">{fluxo.atrasados}</span><span className="text-[10px] uppercase text-white/50 ml-1">atrasados</span></div>
            </div>
          ) : undefined,
          restrito: true,
        },
        {
          href: '/financeiro/dre',
          emoji: '📈',
          titulo: 'DRE Simplificada',
          desc: 'Receita − custos − impostos = lucro. Mês/trimestre.',
          restrito: true,
          emBreve: true,
        },
        {
          href: '/financeiro/categorias',
          emoji: '🏷️',
          titulo: 'Categorias',
          desc: 'Classificação de receitas e despesas.',
          restrito: true,
          emBreve: true,
        },
      ]}
    />
  )
}
