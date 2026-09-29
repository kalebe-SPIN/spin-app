import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModuloHub } from '@/components/ModuloHub'
import { carregarFluxo } from '@/lib/financeiro/dados'
import { brl, hojeBR } from '@/lib/financeiro/fluxo'

export const dynamic = 'force-dynamic'

/**
 * Hub do Financeiro (Kalebe 2026-09-29): tudo roda sobre o fluxo de caixa
 * (previsto × realizado). Contas a pagar/receber, passivo e fornecedores são
 * vistas filtradas do mesmo fluxo.
 */
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

  const hoje = hojeBR()
  const r = { pendentes: 0, receber: 0, receberAtraso: 0, receberValor: 0, pagar: 0, pagarAtraso: 0, pagarValor: 0, passivo: 0, contratos: 0, fornecedores: 0 }
  let erro: string | null = null
  try {
    const dados = await carregarFluxo()
    if ('erro' in dados) erro = dados.erro || 'Falha ao carregar o fluxo'
    else {
      const abertos = dados.lancamentos.filter((l) => !l.data_realizada)
      const rec = abertos.filter((l) => l.direcao === 'entrada')
      const pag = abertos.filter((l) => l.direcao === 'saida')
      r.pendentes = dados.pendentes.length
      r.receber = rec.length
      r.receberAtraso = rec.filter((l) => l.data_prevista < hoje).length
      r.receberValor = rec.reduce((s, l) => s + l.valor_previsto, 0)
      r.pagar = pag.length
      r.pagarAtraso = pag.filter((l) => l.data_prevista < hoje).length
      r.pagarValor = pag.reduce((s, l) => s + l.valor_previsto, 0)
      r.passivo = pag.filter((l) => l.grupo === 'passivo_bancario').reduce((s, l) => s + l.valor_previsto, 0)
      r.contratos = dados.passivos.length
      r.fornecedores = dados.fornecedores.filter((f) => f.ativo).length
    }
  } catch (e: any) {
    erro = e?.message || 'Falha ao carregar o fluxo'
  }

  const Stats = ({ itens }: { itens: Array<{ v: string | number; rotulo: string; cor: string }> }) => (
    <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap gap-x-3 gap-y-1">
      {itens.map((i) => (
        <div key={i.rotulo}><span className={`text-lg font-black ${i.cor}`}>{i.v}</span><span className="text-[10px] uppercase text-white/50 ml-1">{i.rotulo}</span></div>
      ))}
    </div>
  )
  const url = (aba: string) => `/financeiro/fluxo-caixa?aba=${aba}`

  return (
    <ModuloHub
      titulo="Financeiro"
      icone="💰"
      descricao={erro ? `⚠️ ${erro}` : 'Fluxo de caixa previsto × realizado, integrado às vendas do sistema'}
      cards={[
        {
          href: url('mensal'),
          emoji: '📊',
          titulo: 'Fluxo de Caixa',
          desc: 'Visão mensal previsto × realizado, saldo projetado e capital de giro.',
          stats: <Stats itens={[
            { v: r.pendentes, rotulo: 'vendas a programar', cor: 'text-sol' },
            { v: r.receberAtraso + r.pagarAtraso, rotulo: 'atrasados', cor: 'text-coral' },
          ]} />,
          restrito: true,
        },
        {
          href: url('receber'),
          emoji: '📥',
          titulo: 'Contas a Receber',
          desc: 'Parcelas das vendas fechadas e outras entradas previstas.',
          stats: <Stats itens={[
            { v: r.receber, rotulo: `em aberto · ${brl(r.receberValor)}`, cor: 'text-verde' },
            { v: r.receberAtraso, rotulo: 'atrasadas', cor: 'text-coral' },
          ]} />,
          restrito: true,
        },
        {
          href: url('pagar'),
          emoji: '📤',
          titulo: 'Contas a Pagar',
          desc: 'Fornecedores, impostos, pessoal, comissões e custos fixos.',
          stats: <Stats itens={[
            { v: r.pagar, rotulo: `em aberto · ${brl(r.pagarValor)}`, cor: 'text-coral' },
            { v: r.pagarAtraso, rotulo: 'atrasadas', cor: 'text-coral' },
          ]} />,
          restrito: true,
        },
        {
          href: url('programar'),
          emoji: '🧾',
          titulo: 'Vendas a programar',
          desc: 'Vendas fechadas no sistema: condição de recebimento + custos do orçamento como previsto.',
          stats: <Stats itens={[{ v: r.pendentes, rotulo: 'aguardando', cor: 'text-sol' }]} />,
          restrito: true,
        },
        {
          href: url('passivo'),
          emoji: '🏦',
          titulo: 'Passivo bancário',
          desc: 'Empréstimos, financiamentos, capital de giro bancário e cartão — parcelas e saldo devedor.',
          stats: <Stats itens={[
            { v: brl(r.passivo), rotulo: 'saldo devedor', cor: 'text-coral' },
            { v: r.contratos, rotulo: 'contratos', cor: 'text-white' },
          ]} />,
          restrito: true,
        },
        {
          href: url('fornecedores'),
          emoji: '🏭',
          titulo: 'Fornecedores',
          desc: 'Cadastro de fornecedores com o que há a pagar e o que já foi pago.',
          stats: <Stats itens={[{ v: r.fornecedores, rotulo: 'ativos', cor: 'text-white' }]} />,
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
      ]}
    />
  )
}
