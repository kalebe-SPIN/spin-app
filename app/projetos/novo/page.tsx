import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NovoProjetoForm } from '@/components/NovoProjetoForm'

/**
 * Novo projeto — /projetos/novo
 *
 * Passo 1 do workflow: dados básicos do cliente + UC.
 * Após salvar, redireciona pra /projetos/[id] (próximos passos).
 */
export default async function NovoProjetoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <Link href="/projetos" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Projetos
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Novo projeto
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Passo 1 de 8 — Dados do cliente
          </p>
        </header>

        {/* Stepper */}
        <Stepper passoAtual={1} />

        {/* Form */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <NovoProjetoForm consultorId={user.id} />
        </div>
      </div>
    </main>
  )
}

function Stepper({ passoAtual }: { passoAtual: number }) {
  const passos = [
    { n: 1, label: 'Cliente' },
    { n: 2, label: 'Fatura' },
    { n: 3, label: 'Telhado' },
    { n: 4, label: 'Padrão' },
    { n: 5, label: 'Dimensionar' },
    { n: 6, label: 'Kit' },
    { n: 7, label: 'Lista CA' },
    { n: 8, label: 'Orçamento' },
  ]

  return (
    <div className="mb-8 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-fit">
        {passos.map((p, idx) => (
          <div key={p.n} className="flex items-center gap-2 flex-shrink-0">
            <div className={`
              flex flex-col items-center gap-1.5
            `}>
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors
                ${p.n === passoAtual
                  ? 'bg-sol text-noite border-sol'
                  : p.n < passoAtual
                  ? 'bg-verde/20 text-verde border-verde/40'
                  : 'bg-transparent text-white/40 border-white/20'
                }
              `}>
                {p.n < passoAtual ? '✓' : p.n}
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap
                ${p.n === passoAtual ? 'text-sol' : 'text-white/40'}
              `}>
                {p.label}
              </span>
            </div>
            {idx < passos.length - 1 && (
              <div className={`h-px w-8 ${p.n < passoAtual ? 'bg-verde/40' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
