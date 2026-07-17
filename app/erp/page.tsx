import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModuloHub } from '@/components/ModuloHub'

// Helper local pra stats dos cards
function MiniStat({ valor, label, cor = 'branco' }: { valor: number; label: string; cor?: string }) {
  const cores: Record<string, string> = {
    sol: 'text-sol', verde: 'text-verde', coral: 'text-coral', branco: 'text-white',
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-lg font-black ${cores[cor] || cores.branco}`}>{valor}</span>
      <span className="text-[10px] text-white/50">{label}</span>
    </div>
  )
}

export const dynamic = 'force-dynamic'

/**
 * Hub ERP — agrupa os módulos administrativos da Spin numa tela única.
 * Financeiro · Fiscal · Operações · Pós-venda · CRM · Admin.
 */
export default async function ErpHubPage() {
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
          <p className="text-white/60 text-sm mt-2">ERP é exclusivo do admin.</p>
        </div>
      </main>
    )
  }

  // Contagens rápidas — defensivas, tabelas podem não existir ainda
  async function safeCount(fn: () => any): Promise<number> {
    try {
      const r = await fn()
      return r?.count || 0
    } catch {
      return 0
    }
  }

  const [projetosAtivos, contasPagar, notasFiscais, tarefasOperacao, clientesPosVenda] = await Promise.all([
    safeCount(() =>
      supabase.from('projetos').select('id', { count: 'exact', head: true })
        .not('status', 'in', '(cancelado,recusado,perdido,expirado)')),
    safeCount(() =>
      supabase.from('contas_pagar').select('id', { count: 'exact', head: true }).eq('status', 'pendente')),
    safeCount(() =>
      supabase.from('notas_fiscais').select('id', { count: 'exact', head: true })
        .gte('data_emissao', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))),
    safeCount(() =>
      supabase.from('projetos').select('id', { count: 'exact', head: true }).eq('status', 'em_execucao')),
    safeCount(() =>
      supabase.from('projetos').select('id', { count: 'exact', head: true }).eq('status', 'ativo_pos_venda')),
  ])

  return (
    <ModuloHub
      titulo="ERP · Sistema de Gestão"
      icone="🏢"
      descricao="Financeiro, fiscal, operações, pós-venda — tudo integrado."
      cards={[
        {
          href: '/financeiro',
          emoji: '💰',
          titulo: 'Financeiro',
          desc: 'Contas a pagar/receber, fluxo de caixa, comissões, DRE.',
          stats: <MiniStat valor={contasPagar} label="contas pendentes" cor="sol" />,
        },
        {
          href: '/fiscal',
          emoji: '📊',
          titulo: 'Fiscal',
          desc: 'Notas fiscais, impostos (Simples/Lucro), obrigações acessórias.',
          stats: <MiniStat valor={notasFiscais} label="notas 30d" />,
        },
        {
          href: '/operacoes',
          emoji: '🚧',
          titulo: 'Operações',
          desc: 'Instalações em execução, cronograma, equipe de campo.',
          stats: <MiniStat valor={tarefasOperacao} label="em execução" cor="sol" />,
        },
        {
          href: '/pos-venda',
          emoji: '🔧',
          titulo: 'Pós-venda',
          desc: 'Clientes ativos, monitoramento, ordens de serviço, manutenção.',
          stats: <MiniStat valor={clientesPosVenda} label="em pós-venda" cor="verde" />,
        },
        {
          href: '/crm',
          emoji: '👥',
          titulo: 'CRM',
          desc: 'Clientes, pipeline comercial, leads, interações.',
          stats: <MiniStat valor={projetosAtivos} label="projetos ativos" cor="sol" />,
        },
        {
          href: '/admin',
          emoji: '⚙️',
          titulo: 'Administração',
          desc: 'Configurações da empresa, usuários, catálogo WEG, precificação.',
        },
      ]}
    />
  )
}
