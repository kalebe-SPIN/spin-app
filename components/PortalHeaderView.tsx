import Link from 'next/link'
import type { ModoVisualizacao } from '@/lib/modo-visualizacao'
import { AlternarModoButton } from '@/components/AlternarModoButton'
import { SinoBianca } from '@/components/SinoBianca'
import { MenuMobileHeader } from '@/components/MenuMobileHeader'
import { AbasPorArea } from '@/components/AbasPorArea'
import { AlertaMensagensInbox } from '@/components/AlertaMensagensInbox'
import { NavPortal, type LinkNav } from '@/components/NavPortal'
import { AlternarTema } from '@/components/AlternarTema'
import { LancamentoRapido } from '@/components/financeiro/LancamentoRapido'

/**
 * Parte visual do cabeçalho (Kalebe 2026-09-30) — o PortalHeader busca os
 * dados e passa pra cá.
 * Largura: menu completo a partir de 1024px; abaixo, ☰. Logo nunca encolhe.
 */
export function PortalHeaderView({
  linksNav, logoUrl, sugestoesPendentes, ehAdminReal, modoAtivo, nome, avatarUrl,
}: {
  linksNav: LinkNav[]
  logoUrl: string | null
  sugestoesPendentes: number
  ehAdminReal: boolean
  modoAtivo: ModoVisualizacao
  nome: string
  avatarUrl: string | null
}) {
  return (
    <header className="bg-white/[0.02] border-b border-white/10 sticky top-0 z-40 backdrop-blur">
      {/* Kalebe 2026-09-29: cada área do portal na sua própria aba + atualiza ao voltar */}
      <AbasPorArea />
      {/* Kalebe 2026-09-30: alerta na tela quando chega mensagem no inbox */}
      <AlertaMensagensInbox />
      {/* Kalebe 2026-10-01: "Registrar saída" de qualquer tela (só quem vê o Financeiro) */}
      {linksNav.some((l) => l.href === '/financeiro') && <LancamentoRapido />}
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6 py-1 md:py-1.5 flex items-center justify-between gap-2 md:gap-3">
        {/* Esquerda: ☰ (telas < 1024px) + logo + menu */}
        <div className="flex items-center gap-2 lg:gap-4 min-w-0">
          <MenuMobileHeader links={linksNav} />

          {/* Logo nunca encolhe (antes o menu esmagava até sumir) */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              // Kalebe 2026-09-30: logo em BRANCO (filtro — segue a logo cadastrada) e 30% maior.
              // 2026-10-01: no modo claro volta à cor original (.logo-portal no globals.css)
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Spin Solar" className="logo-portal h-[42px] sm:h-[47px] md:h-[57px] w-auto max-w-[125px] sm:max-w-[182px] object-contain brightness-0 invert" />
            ) : (
              <span className="text-sol font-black text-base md:text-lg">SPIN</span>
            )}
          </Link>

          <NavPortal links={linksNav} />
        </div>

        {/* Direita: sino + modo + usuário */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <SinoBianca contadorInicial={sugestoesPendentes} />
          {ehAdminReal && <AlternarModoButton modoAtual={modoAtivo} />}
          {/* Kalebe 2026-10-01: modo noturno ou claro, escolha de cada usuário */}
          <AlternarTema />

          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <div className="text-right hidden xl:block">
              <p className="text-xs font-semibold text-white leading-tight truncate max-w-[140px]">{nome || 'Usuário'}</p>
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
              title={nome || 'Minha conta'}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                (nome || 'U').charAt(0).toUpperCase()
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
