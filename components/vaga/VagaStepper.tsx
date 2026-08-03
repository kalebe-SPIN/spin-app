'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Status = 'enviado' | 'proposta_aceita' | 'contrato_assinado' | 'docs_enviados' | 'concluido' | 'recusado'

const ETAPAS = [
  { href: '/vaga/proposta', label: 'Proposta', num: 1 },
  { href: '/vaga/contrato', label: 'Contrato', num: 2 },
  { href: '/vaga/documentos', label: 'Documentos', num: 3 },
] as const

/** Quantas etapas já foram concluídas, conforme o status do convite. */
function etapasConcluidas(status: Status): number {
  switch (status) {
    case 'proposta_aceita': return 1
    case 'contrato_assinado': return 2
    case 'docs_enviados':
    case 'concluido': return 3
    default: return 0
  }
}

export function VagaStepper({ status }: { status: Status }) {
  const pathname = usePathname()
  const concluidas = etapasConcluidas(status)

  return (
    <nav className="w-full">
      <ol className="flex items-center gap-2 md:gap-4">
        {ETAPAS.map((etapa, i) => {
          const feito = etapa.num <= concluidas
          const atual = pathname.startsWith(etapa.href)
          // Libera navegar até 1 etapa além da última concluída
          const liberado = etapa.num <= concluidas + 1

          const bolinha = feito ? (
            <span className="w-7 h-7 rounded-full bg-verde/20 border border-verde/50 text-verde flex items-center justify-center text-sm font-bold">✓</span>
          ) : (
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border ${
              atual ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/50 border-white/15'
            }`}>{etapa.num}</span>
          )

          const conteudo = (
            <span className="flex items-center gap-2">
              {bolinha}
              <span className={`text-sm font-semibold hidden sm:inline ${
                atual ? 'text-white' : feito ? 'text-verde' : 'text-white/50'
              }`}>{etapa.label}</span>
            </span>
          )

          return (
            <li key={etapa.href} className="flex items-center gap-2 md:gap-4">
              {liberado ? (
                <Link href={etapa.href} className="hover:opacity-80 transition-opacity">{conteudo}</Link>
              ) : (
                <span className="opacity-60 cursor-not-allowed" title="Conclua a etapa anterior">{conteudo}</span>
              )}
              {i < ETAPAS.length - 1 && (
                <span className={`h-px w-6 md:w-12 ${etapa.num <= concluidas ? 'bg-verde/40' : 'bg-white/10'}`} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
