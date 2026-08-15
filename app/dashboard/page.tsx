import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { StatsProjetos } from '@/components/stats/StatsProjetos'
import { StatsHomologacoes } from '@/components/stats/StatsHomologacoes'
import { StatsAgenda } from '@/components/stats/StatsAgenda'
import { StatsCRM } from '@/components/stats/StatsCRM'
import { StatsOperacoes } from '@/components/stats/StatsOperacoes'
import { StatsPosVenda } from '@/components/stats/StatsPosVenda'

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

  // Candidato não tem portal interno — vai pra própria área
  if (profile?.role === 'candidato') redirect('/vaga')

  const { modo } = await getModoVisualizacao()
  const mostraAdmin = profile?.role === 'admin' && modo === 'admin'

  // Vendedor de serviços tem dashboard próprio focado em desempenho + resultado + meta.
  // Aciona por MODO (não role) — admin que alterna pra "Vendedor Serv." no toggle
  // vê a experiência do vendedor pra validar. Vendedor real sempre cai aqui
  // porque getModoVisualizacao força modo=role quando não é admin.
  if (modo === 'vendedor_servicos') {
    const { DashboardVendedorServicos } = await import('@/components/DashboardVendedorServicos')
    return <DashboardVendedorServicos userId={user.id} nome={profile?.nome_completo || 'Vendedor'} />
  }

  // Profissional de campo ainda não tem dashboard próprio — o fluxo dele é
  // executar OS na agenda. Manda direto pra /agenda até criarmos DashboardCampo.
  if (modo === 'profissional_campo') redirect('/agenda')

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

        {/* Sec. 1: JORNADA DO CLIENTE — linha do tempo (LEAD → PÓS-VENDA)
            Admin vê 6 etapas (com Homologações CELESC ④); demais veem 5. */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
              🛤️ Jornada do cliente
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              Linha do tempo — do primeiro toque até a garantia
              {mostraAdmin && <span className="text-weg-azul ml-1">(visão administrador · inclui homologação CELESC)</span>}
            </p>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${mostraAdmin ? 'lg:grid-cols-6' : 'lg:grid-cols-4'}`}>
            <DashboardCard
              etapa={1}
              titulo="⚡ Orçamento Rápido"
              desc="Estimativa em 30s a partir de kWh/mês, R$/mês ou qtd de placas. Envia WhatsApp e converte em projeto."
              disponivel={true}
              href="/orcamento-rapido"
              destaque
            />
            <DashboardCard
              etapa={2}
              titulo="📋 Projetos"
              desc="Consolida o interesse do lead — dimensionamento, kit, proposta técnica com PDF oficial."
              disponivel={true}
              href="/projetos"
            >
              <StatsProjetos />
            </DashboardCard>
            <DashboardCard
              etapa={3}
              titulo="🎯 CRM"
              desc="Proposta oficial vira negociação — funil de fechamento até o contrato assinado."
              disponivel={true}
              href={mostraAdmin ? '/crm/pipeline' : '/crm'}
            >
              <StatsCRM />
            </DashboardCard>
            {mostraAdmin && (
              <DashboardCard
                etapa={4}
                titulo="⚡ Homologação CELESC"
                desc="Contrato assinado → 6 etapas de aprovação junto à distribuidora."
                disponivel={true}
                adminOnly
                href="/admin/homologacoes"
              >
                <StatsHomologacoes />
              </DashboardCard>
            )}
            <DashboardCard
              etapa={mostraAdmin ? 5 : 4}
              titulo="🔨 Operações"
              desc="Obras e serviços contratados — agendamento até entrega."
              disponivel={true}
              href="/execucoes"
            >
              <StatsOperacoes />
            </DashboardCard>
            {mostraAdmin && (
              <DashboardCard
                etapa={6}
                titulo="🛠️ Pós-venda"
                desc="OS, garantias, monitoramento O&M — depois da entrega."
                disponivel={true}
                adminOnly
                href="/pos-venda"
              >
                <StatsPosVenda />
              </DashboardCard>
            )}
          </div>
        </section>

        {/* Sec. 2: UTILITÁRIOS TRANSVERSAIS — atravessam todas as fases */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
              🧰 Utilitários transversais
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              Ferramentas que atravessam a jornada inteira
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
  titulo, desc, disponivel = false, adminOnly = false, href, children, destaque = false, etapa,
}: {
  titulo: string
  desc: string
  disponivel?: boolean
  adminOnly?: boolean
  href: string
  children?: React.ReactNode
  destaque?: boolean
  etapa?: number
}) {
  const Tag = disponivel ? 'a' : 'div'
  return (
    <Tag
      href={disponivel ? href : undefined}
      className={`
        relative p-5 rounded-xl border transition-all flex flex-col
        ${disponivel
          ? destaque
            ? 'bg-gradient-to-br from-coral/10 to-sol/5 border-coral/40 hover:border-coral/70 cursor-pointer'
            : 'bg-white/5 border-white/10 hover:border-sol/40 hover:bg-white/[0.07] cursor-pointer'
          : 'bg-white/[0.02] border-white/5 opacity-60 cursor-not-allowed'
        }
      `}
    >
      {typeof etapa === 'number' && (
        <span className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-sol text-noite text-xs font-black flex items-center justify-center shadow-lg ring-2 ring-noite">
          {etapa}
        </span>
      )}
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
      <h3 className="text-base font-bold text-white mb-1.5">{titulo}</h3>
      <p className="text-xs text-white/60 leading-relaxed">{desc}</p>
      {!disponivel && (
        <span className="mt-3 inline-block text-xs uppercase tracking-wider text-white/40 font-semibold">
          Em breve
        </span>
      )}
      {children}
    </Tag>
  )
}
