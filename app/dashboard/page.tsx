import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { StatsProjetos } from '@/components/stats/StatsProjetos'
import { StatsCatalogo } from '@/components/stats/StatsCatalogo'
import { StatsHomologacoes } from '@/components/stats/StatsHomologacoes'
import { StatsAgenda } from '@/components/stats/StatsAgenda'

/**
 * Dashboard — /dashboard
 *
 * Página protegida: só usuários logados acessam.
 * Server Component pra verificar auth direto no servidor (sem flash de conteúdo).
 *
 * No futuro, vai mostrar conteúdo diferente baseado no papel:
 * - admin: gestão geral, catálogo, usuários
 * - representante: meus leads, link de afiliação, comissões
 * - instalador: instalações agendadas, checklist
 */
export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Se não logado, manda pra login
  if (!user) {
    redirect('/login')
  }

  // Busca perfil do usuário (com role) — tabela profiles
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
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              Olá, <span className="text-sol">{profile?.nome_completo?.split(' ')[0] || 'parceiro'}</span>
            </h1>
            <p className="text-white/60 mt-1">
              Bem-vindo ao portal interno Spin Solar
              {profile?.role && (
                <span className="ml-2 text-xs uppercase tracking-wider bg-sol/10 text-sol px-2 py-1 rounded-full font-bold">
                  {profile.role}
                </span>
              )}
            </p>
          </div>

          {/* Avatar + menu */}
          <div className="flex items-center gap-3">
            <a
              href="/conta"
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Minha conta
            </a>
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

        {/* Cards de atalho */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DashboardCard
            titulo="📋 Projetos"
            desc="Workflow completo: fatura → telhado → kit → orçamento → PDF."
            disponivel={true}
            href="/projetos"
          >
            <StatsProjetos />
          </DashboardCard>
          <DashboardCard
            titulo="OCR Fatura CELESC"
            desc="Análise standalone de fatura. Integrado ao fluxo de Projetos."
            disponivel={false}
            href="/cliente/ocr"
          />
          <DashboardCard
            titulo="Meus Leads"
            desc="Acompanhe leads atribuídos via link de afiliação."
            disponivel={false}
            href="/parceiro/leads"
          />
          {mostraAdmin && (
            <>
              <DashboardCard
                titulo="📊 Catálogo WEG (Admin)"
                desc="Upload de planilha, PDF de estoque e datasheets dos produtos."
                disponivel={true}
                adminOnly
                href="/admin/catalogo"
              >
                <StatsCatalogo />
              </DashboardCard>
              <DashboardCard
                titulo="💰 Precificação (Admin)"
                desc="Margens, comissões, tabelas, descontos — painel de controle."
                disponivel={false}
                adminOnly
                href="/admin/precificacao"
              />
              <DashboardCard
                titulo="⚡ Homologações CELESC"
                desc="Pipeline de aprovação — 6 etapas por projeto aceito."
                disponivel={true}
                adminOnly
                href="/admin/homologacoes"
              >
                <StatsHomologacoes />
              </DashboardCard>
            </>
          )}
          <DashboardCard
            titulo="👩‍💼 Agenda (Bianca)"
            desc="Sua secretária executiva IA — eventos, tarefas e resumo diário."
            disponivel={true}
            href="/agenda"
          >
            <StatsAgenda />
          </DashboardCard>
          <DashboardCard
            titulo="Configurações"
            desc="Sua conta, perfil profissional, foto."
            disponivel={true}
            href="/conta"
          />
        </div>

        {/* ERP Módulos */}
        <div className="mt-10 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-sol">ERP Módulos</h2>
          <p className="text-xs text-white/50 mt-0.5">CRM, financeiro, operações, fiscal e pós-venda</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <ModuloAtalho href="/crm" emoji="👥" titulo="CRM" desc="Clientes + leads" />
          {mostraAdmin && (
            <ModuloAtalho href="/financeiro" emoji="💰" titulo="Financeiro" desc="Receber + pagar" adminOnly />
          )}
          <ModuloAtalho href="/operacoes" emoji="🔧" titulo="Operações" desc="Compras + equipe" />
          {mostraAdmin && (
            <ModuloAtalho href="/fiscal" emoji="📄" titulo="Fiscal" desc="NF + contratos" adminOnly />
          )}
          <ModuloAtalho href="/pos-venda" emoji="🛠️" titulo="Pós-venda" desc="OS + garantias" />
        </div>

        {/* Aviso construção */}
        <div className="mt-12 p-6 bg-sol/5 border border-sol/20 rounded-xl">
          <p className="text-sm text-white/70">
            🚧 <strong className="text-sol">Sistema em construção.</strong> As funcionalidades acima
            estão sendo migradas do menu-spin público pra cá. Em breve, todas estarão ativas.
          </p>
        </div>
      </div>
    </main>
  )
}

/**
 * Card de atalho do dashboard.
 * Quando `disponivel=false`, fica disabled visualmente.
 */
function ModuloAtalho({
  href, emoji, titulo, desc, adminOnly,
}: {
  href: string; emoji: string; titulo: string; desc: string; adminOnly?: boolean
}) {
  return (
    <a
      href={href}
      className="relative p-3 rounded-lg bg-white/[0.03] border border-white/10 hover:border-sol/40 hover:bg-white/[0.06] transition-all block"
    >
      {adminOnly && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-bold uppercase text-weg-azul bg-white px-1 py-0.5 rounded">
          Admin
        </span>
      )}
      <div className="text-2xl mb-1">{emoji}</div>
      <p className="text-sm font-bold text-white">{titulo}</p>
      <p className="text-[10px] text-white/50 mt-0.5">{desc}</p>
    </a>
  )
}

function DashboardCard({
  titulo,
  desc,
  disponivel = false,
  adminOnly = false,
  href,
  children,
}: {
  titulo: string
  desc: string
  disponivel?: boolean
  adminOnly?: boolean
  href: string
  children?: React.ReactNode
}) {
  const Tag = disponivel ? 'a' : 'div'
  return (
    <Tag
      href={disponivel ? href : undefined}
      className={`
        relative p-6 rounded-xl border transition-all flex flex-col
        ${disponivel
          ? 'bg-white/5 border-white/10 hover:border-sol/40 hover:bg-white/[0.07] cursor-pointer'
          : 'bg-white/[0.02] border-white/5 opacity-60 cursor-not-allowed'
        }
      `}
    >
      {adminOnly && (
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-weg-azul bg-white px-2 py-0.5 rounded-full">
          Admin
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
