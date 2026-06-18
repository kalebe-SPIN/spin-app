import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Página de perfil do usuário logado — /conta
 *
 * Mostra:
 * - Dados cadastrais (nome, email, telefone, papel)
 * - Permite editar (próxima iteração)
 * - Mostra "minha foto pública" se vendedor (vai aparecer na vitrine)
 *
 * Acesso: usuário logado vê o próprio perfil.
 */
export default async function ContaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-8">
          <a
            href="/dashboard"
            className="text-sm text-white/50 hover:text-sol transition-colors"
          >
            ← Voltar ao dashboard
          </a>
        </nav>

        {/* Header */}
        <header className="mb-12">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
            Minha conta
          </h1>
          <p className="text-white/60">
            Dados cadastrais e preferências do seu acesso ao Spin
          </p>
        </header>

        {/* Card de dados */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 md:p-8 mb-6">
          <h2 className="text-lg font-bold text-white mb-6">Dados pessoais</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CampoExibicao label="Nome completo" valor={profile?.nome_completo || '—'} />
            <CampoExibicao label="Email" valor={user.email || '—'} />
            <CampoExibicao label="Telefone" valor={profile?.telefone || '—'} />
            <CampoExibicao label="Papel no sistema" valor={profile?.role || '—'} badge />
          </div>

          {/* Botão editar — implementação na próxima iteração */}
          <button
            disabled
            className="mt-8 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white/40 cursor-not-allowed"
          >
            Editar dados (em breve)
          </button>
        </div>

        {/* Card "Perfil público" — só pra vendedores/instaladores */}
        {(profile?.role === 'vendedor' || profile?.role === 'representante' || profile?.role === 'instalador') && (
          <div className="bg-sol/5 border border-sol/20 rounded-xl p-6 md:p-8">
            <h2 className="text-lg font-bold text-sol mb-2">⭐ Seu perfil público</h2>
            <p className="text-sm text-white/70 leading-relaxed mb-4">
              Como representante/instalador, você terá um perfil público visível no{' '}
              <a href="https://menu.spinsolar.com.br" target="_blank" rel="noopener" className="text-sol underline">
                menu.spinsolar.com.br
              </a>
              {' '}— clientes podem te escolher diretamente como consultor.
            </p>
            <p className="text-xs text-white/40">
              🚧 Configuração disponível em breve (foto, bio, cidades atendidas).
            </p>
          </div>
        )}

        {/* Card "perigo" — sair */}
        <div className="mt-12 p-4 bg-coral/5 border border-coral/20 rounded-xl">
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-coral hover:text-coral/80 transition-colors"
            >
              Encerrar sessão
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

/**
 * Campo somente-leitura (vai virar editável na próxima iteração).
 */
function CampoExibicao({
  label,
  valor,
  badge = false,
}: {
  label: string
  valor: string
  badge?: boolean
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-1">
        {label}
      </dt>
      <dd>
        {badge ? (
          <span className="inline-block px-3 py-1 bg-sol/10 text-sol text-sm font-bold rounded-full uppercase tracking-wider">
            {valor}
          </span>
        ) : (
          <span className="text-white font-medium">{valor}</span>
        )}
      </dd>
    </div>
  )
}
