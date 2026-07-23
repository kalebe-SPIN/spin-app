import Link from 'next/link'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { AlternarModoButton } from '@/components/AlternarModoButton'

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

  const modoAtivo = modo

  return (
    <header className="bg-white/[0.02] border-b border-white/10 sticky top-0 z-40 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        {/* Logo + nome */}
        <div className="flex items-center gap-4">
          <Link href="/projetos" className="flex items-center gap-2">
            <span className="text-sol font-black text-lg">SPIN</span>
            <span className="text-white/40 text-xs font-mono uppercase tracking-widest">
              portal
            </span>
          </Link>

          {/* Nav links — dependem do modo */}
          <nav className="hidden md:flex items-center gap-1 ml-6">
            <NavLink href="/dashboard" label="📊 Dashboard" />
            <NavLink href="/projetos" label="Projetos" />
            <NavLink href="/crm/pipeline" label="🎯 CRM" />
            <NavLink href="/agenda" label="📅 Agenda" />
            {modoAtivo === 'admin' && ehAdminReal && (
              <NavLink href="/admin" label="⚙️ Admin" />
            )}
          </nav>
        </div>

        {/* Direita: modo + usuário */}
        <div className="flex items-center gap-3">
          {ehAdminReal && <AlternarModoButton modoAtual={modoAtivo} />}

          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white leading-tight">
                {perfil.nome || 'Usuário'}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                {modoAtivo === 'admin' ? 'Administrador' : 'Consultor'}
              </p>
            </div>
            <Link
              href="/conta"
              className="w-8 h-8 rounded-full bg-sol/20 border border-sol/40 flex items-center justify-center text-xs font-bold text-sol"
            >
              {(perfil.nome || 'U').charAt(0).toUpperCase()}
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
