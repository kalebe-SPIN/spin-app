import { redirect } from 'next/navigation'
import { getConviteAtual } from '@/lib/convite'
import { VagaStepper } from '@/components/vaga/VagaStepper'

/**
 * Layout da área autenticada do candidato (/vaga/*, exceto /vaga/login).
 * Header próprio (sem o PortalHeader interno) + stepper das 3 etapas.
 */
export default async function VagaPortalLayout({ children }: { children: React.ReactNode }) {
  const convite = await getConviteAtual()
  if (!convite) redirect('/vaga/login')

  const primeiroNome = convite.nome_candidato?.split(' ')[0] || 'candidato'

  return (
    <div className="min-h-screen">
      {/* Header do candidato */}
      <header className="border-b border-white/10 bg-white/[0.02] backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sol font-black text-lg">SPIN</span>
            <span className="text-white/40 text-xs font-mono uppercase tracking-widest hidden sm:inline">
              convite de trabalho
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50 hidden sm:inline">Olá, {primeiroNome}</span>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/50 hover:text-coral transition-colors">
                Sair
              </button>
            </form>
          </div>
        </div>
        {/* Stepper */}
        <div className="max-w-4xl mx-auto px-6 pb-4 pt-1 overflow-x-auto">
          <VagaStepper status={convite.status} />
        </div>
      </header>

      {children}
    </div>
  )
}
