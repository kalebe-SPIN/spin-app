import LoginForm from '@/components/LoginForm'

/**
 * Página de login — /login
 *
 * Layout limpo com 2 colunas em desktop:
 * - Esquerda: branding Spin + WEG (mesmo padrão visual do menu-spin)
 * - Direita: formulário de login
 *
 * Em mobile: empilhado, branding em cima.
 */
export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col md:flex-row">
      {/* Coluna esquerda — branding */}
      <section className="flex-1 flex flex-col justify-center items-center p-8 md:p-12 bg-gradient-to-br from-noite-0 via-noite to-noite-0 border-b md:border-b-0 md:border-r border-white/5">
        <div className="max-w-md w-full text-center md:text-left">
          {/* Logo Spin (placeholder — substituir por imagem real) */}
          <div className="inline-block mb-8">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter2 text-white">
              SPIN <span className="text-sol">SOLAR</span>
            </h1>
            <div className="mt-2 text-xs uppercase tracking-widest text-white/50 font-semibold">
              Portal Interno · Acesso Restrito
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-4">
            <span className="text-white/70">Bem-vindo ao</span><br />
            <span>sistema da Spin</span>
          </h2>

          <p className="text-white/60 leading-relaxed mb-6">
            Acesso exclusivo para <strong className="text-white">representantes</strong>,{' '}
            <strong className="text-white">instaladores</strong> e equipe interna.
          </p>

          {/* Badge "Integrador WEG" — credibilidade */}
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-white rounded-lg shadow-lg">
            <span className="text-weg-azul font-black text-xs uppercase tracking-wider">
              Revendedor e Integrador Autorizado
            </span>
            <span className="text-weg-azul/70 text-[10px] font-semibold">WEG · 9 anos</span>
          </div>

          {/* Link voltar pra vitrine */}
          <a
            href="https://menu.spinsolar.com.br/on-grid"
            className="block mt-8 text-sm text-white/40 hover:text-sol transition-colors"
          >
            ← Voltar pro catálogo público
          </a>
        </div>
      </section>

      {/* Coluna direita — formulário */}
      <section className="flex-1 flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2">Entrar no sistema</h2>
          <p className="text-white/50 text-sm mb-8">
            Use o email e senha cadastrados pelo admin.
          </p>

          <LoginForm />

          {/* Rodapé do form */}
          <p className="mt-8 text-xs text-white/40 text-center">
            Esqueceu acesso ou precisa criar conta?{' '}
            <a
              href="https://wa.me/554832630182?text=Olá Spin Solar! Sou parceiro e preciso de acesso ao sistema."
              target="_blank"
              rel="noopener noreferrer"
              className="text-sol hover:text-sol-claro underline"
            >
              Fale com o admin
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}
