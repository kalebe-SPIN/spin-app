import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { StatsProjetos } from '@/components/stats/StatsProjetos'
import { StatsHomologacoes } from '@/components/stats/StatsHomologacoes'
import { StatsAgenda } from '@/components/stats/StatsAgenda'

/**
 * Dashboard — OPERAÇÃO em tempo real.
 *
 * Filosofia: mostra a orquestra tocando.
 *   - Projetos ativos em cada fase
 *   - Homologações CELESC em andamento
 *   - Agenda do dia (Bianca)
 *   - Módulos operacionais do ERP (CRM, financeiro, etc)
 *
 * Configuração e estrutura da empresa vive em /admin.
 */
export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome_completo, role, telefone')
    .eq('id', user.id)
    .single()

  const { modo } = await getModoVisualizacao()
  const mostraAdmin = profile?.role === 'admin' && modo === 'admin'

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              Olá, <span className="text-sol">{profile?.nome_completo?.split(' ')[0] || 'parceiro'}</span>
            </h1>
            <p className="text-white/60 mt-1">
              Painel operacional — a orquestra tocando
              {profile?.role && (
                <span className="ml-2 text-xs uppercase tracking-wider bg-sol/10 text-sol px-2 py-1 rounded-full font-bold">
                  {profile.role}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {mostraAdmin && (
              <Link
                href="/admin"
                className="px-4 py-2 bg-weg-azul/10 border border-weg-azul/30 text-weg-azul text-sm font-semibold rounded-lg hover:bg-weg-azul/20 transition"
                title="Configurações estruturais da empresa"
              >
                ⚙️ Administração
              </Link>
            )}
            <Link
              href="/conta"
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              Minha conta
            </Link>
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white/60 hover:text-coral transition-colors"
              >
                Sair
              </button>
            </form>
          </div>
        </header>

        {/* Sec. 1: OPERAÇÃO CORRENTE — o que está rodando agora */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
                🎼 Operação corrente
              </h2>
              <p className="text-xs text-white/50 mt-0.5">
                Projetos ativos, pipeline CELESC e agenda do dia
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardCard
              titulo="📋 Projetos"
              desc="Todos os projetos em andamento — proposta, negociação, venda, execução."
              disponivel={true}
              href="/projetos"
            >
              <StatsProjetos />
            </DashboardCard>

            {mostraAdmin && (
              <DashboardCard
                titulo="⚡ Homologações CELESC"
                desc="Pipeline de aprovação — 6 etapas por projeto vendido, atraso vs prazo."
                disponivel={true}
                adminOnly
                href="/admin/homologacoes"
              >
                <StatsHomologacoes />
              </DashboardCard>
            )}

            <DashboardCard
              titulo="👩‍💼 Agenda + Bianca"
              desc="Tarefas do dia, eventos, respostas de clientes, sugestões da IA."
              disponivel={true}
              href="/agenda"
            >
              <StatsAgenda />
            </DashboardCard>
          </div>
        </section>

        {/* Sec. 2: Módulos operacionais — engrenagens do atendimento */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
              🏭 Módulos operacionais
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              Do primeiro contato até a garantia — engrenagens do atendimento
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardCard
              titulo="🎯 CRM"
              desc="Clientes, leads e pipeline comercial — do primeiro contato até a venda."
              disponivel={true}
              href="/crm/pipeline"
            >
              <StatsCRM />
            </DashboardCard>
            <DashboardCard
              titulo="🔨 Operações"
              desc="Pipeline de obras e serviços contratados — agendamento até entrega."
              disponivel={true}
              href="/execucoes"
              destaque
            >
              <StatsOperacoes />
            </DashboardCard>
            <DashboardCard
              titulo="🛠️ Pós-venda"
              desc="OS, garantias, monitoramento O&M — depois da entrega."
              disponivel={true}
              href="/pos-venda"
            >
              <StatsPosVenda />
            </DashboardCard>
          </div>
        </section>

        {/* Sec. 3: Meus Leads (parceiro) */}
        {profile?.role !== 'admin' && (
          <section className="mb-10">
            <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-4">
              🎯 Meu trabalho
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DashboardCard
                titulo="Meus Leads"
                desc="Acompanhe leads atribuídos via link de afiliação."
                disponivel={false}
                href="/parceiro/leads"
              />
              <DashboardCard
                titulo="OCR Fatura CELESC"
                desc="Análise standalone de fatura."
                disponivel={false}
                href="/cliente/ocr"
              />
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function ModuloAtalho({
  href, emoji, titulo, desc, adminOnly, destaque,
}: {
  href: string; emoji: string; titulo: string; desc: string; adminOnly?: boolean; destaque?: boolean
}) {
  return (
    <a
      href={href}
      className={`relative p-4 rounded-lg border transition-all block ${
        destaque
          ? 'bg-gradient-to-br from-coral/10 to-sol/5 border-coral/40 hover:border-coral/70'
          : 'bg-white/[0.03] border-white/10 hover:border-sol/40 hover:bg-white/[0.06]'
      }`}
    >
      {adminOnly && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-bold uppercase text-weg-azul bg-white px-1 py-0.5 rounded">
          Admin
        </span>
      )}
      {destaque && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold uppercase text-coral bg-coral/10 border border-coral/30 px-1.5 py-0.5 rounded">
          Novo
        </span>
      )}
      <div className="text-2xl mb-1.5">{emoji}</div>
      <p className="text-sm font-bold text-white">{titulo}</p>
      <p className="text-[10px] text-white/60 mt-0.5">{desc}</p>
    </a>
  )
}

function DashboardCard({
  titulo, desc, disponivel = false, adminOnly = false, href, children, destaque = false,
}: {
  titulo: string
  desc: string
  disponivel?: boolean
  adminOnly?: boolean
  href: string
  children?: React.ReactNode
  destaque?: boolean
}) {
  const Tag = disponivel ? 'a' : 'div'
  return (
    <Tag
      href={disponivel ? href : undefined}
      className={`
        relative p-6 rounded-xl border transition-all flex flex-col
        ${disponivel
          ? destaque
            ? 'bg-gradient-to-br from-coral/10 to-sol/5 border-coral/40 hover:border-coral/70 cursor-pointer'
            : 'bg-white/5 border-white/10 hover:border-sol/40 hover:bg-white/[0.07] cursor-pointer'
          : 'bg-white/[0.02] border-white/5 opacity-60 cursor-not-allowed'
        }
      `}
    >
      {adminOnly && (
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-weg-azul bg-white px-2 py-0.5 rounded-full">
          Admin
        </span>
      )}
      {destaque && !adminOnly && (
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-coral bg-coral/10 border border-coral/30 px-2 py-0.5 rounded-full">
          Novo
        </span>
      )}
      <h3 className="text-lg font-bold text-white mb-2">{titulo}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{desc}</p>
      {!disponivel && (
        <span className="mt-3 inline-block text-xs uppercase tracking-wider text-white/40 font-semibold">
          Em breve
        </span>
      )}
      {children}
    </Tag>
  )
}
