import Link from 'next/link'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { AlternarModoButton } from '@/components/AlternarModoButton'
import { createClient } from '@/lib/supabase/server'
import { SinoBianca } from '@/components/SinoBianca'
import { MenuMobileHeader } from '@/components/MenuMobileHeader'

/**
 * Header global do portal.
 * Só renderiza se o usuário está autenticado.
 * Mostra:
 *   - Nome do usuário
 *   - Links de navegação
 *   - Botão de alternar modo (só admin)
 *   - Sair
 */
export async function PortalHeader() {
  const { modo, ehAdminReal, perfil } = await getModoVisualizacao()

  if (!perfil) return null // não logado — sem header
  if (perfil.role === 'candidato') return null // candidato tem layout próprio em /vaga

  const modoAtivo = modo

  // Contador de sugestoes pendentes da Bianca + logo da empresa (silencioso em falha)
  let sugestoesPendentes = 0
  let logoUrl: string | null = null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { count } = await supabase
        .from('bianca_comunicacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', user.id)
        .eq('status', 'sugerida')
      sugestoesPendentes = count || 0
    }
    const { data: emp } = await supabase
      .from('configuracoes_empresa')
      .select('logo_url')
      .eq('singleton', true)
      .maybeSingle()
    logoUrl = emp?.logo_url || null
  } catch {}

  // Monta links pra passar tanto pro desktop quanto pro drawer mobile
  const linksNav = [
    { href: '/dashboard', label: '📊 Dashboard' },
    ...(modoAtivo !== 'representante' && modoAtivo !== 'profissional_campo'
      ? [{ href: '/projetos', label: '📋 Projetos' }] : []),
    {
      href:
        modoAtivo === 'representante' ? '/crm/servicos'
        : modoAtivo === 'admin' ? '/crm/pipeline'
        : '/crm',
      label: '🎯 CRM',
    },
    { href: '/agenda', label: '📅 Agenda' },
    ...(modoAtivo === 'admin' && ehAdminReal
      ? [{ href: '/admin', label: '⚙️ Admin' }] : []),
  ]

  return (
    <header className="bg-white/[0.02] border-b border-white/10 sticky top-0 z-40 backdrop-blur">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-2 md:py-3 flex items-center justify-between gap-2 md:gap-4">
        {/* Esquerda: hamburger mobile + logo + nav desktop */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <MenuMobileHeader links={linksNav} />

          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Spin Solar"
                className="h-10 md:h-12 w-auto object-contain"
              />
            ) : (
              <span className="text-sol font-black text-base md:text-lg">SPIN</span>
            )}
            <span className="text-white/40 text-[10px] md:text-xs font-mono uppercase tracking-widest hidden xs:inline">
              portal
            </span>
          </Link>

          {/* Nav links desktop — hidden em mobile (substituído por drawer) */}
          <nav className="hidden md:flex items-center gap-1 ml-4 lg:ml-6">
            {linksNav.map(l => <NavLink key={l.href} href={l.href} label={l.label} />)}
          </nav>
        </div>

        {/* Direita: modo + usuário */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <SinoBianca contadorInicial={sugestoesPendentes} />
          {ehAdminReal && <AlternarModoButton modoAtual={modoAtivo} />}

          <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-white/10">
            <div className="text-right hidden lg:block">
              <p className="text-xs font-semibold text-white leading-tight truncate max-w-[140px]">
                {(perfil as { nome_completo?: string }).nome_completo || 'Usuário'}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                {modoAtivo === 'admin' ? 'Administrador'
                  : modoAtivo === 'representante' ? 'Representante Spin'
                  : modoAtivo === 'profissional_campo' ? 'Profissional de campo'
                  : 'Consultor'}
              </p>
            </div>
            <Link
              href="/conta"
              className="w-8 h-8 rounded-full overflow-hidden bg-sol/20 border border-sol/40 flex items-center justify-center text-xs font-bold text-sol shrink-0"
              title={(perfil as { nome_completo?: string }).nome_completo || 'Minha conta'}
            >
              {(perfil as { avatar_url?: string | null }).avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(perfil as { avatar_url?: string | null }).avatar_url!}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                ((perfil as { nome_completo?: string }).nome_completo || 'U').charAt(0).toUpperCase()
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm text-white/60 hover:text-white hover:bg-white/5 rounded-md transition"
    >
      {label}
    </Link>
  )
}
