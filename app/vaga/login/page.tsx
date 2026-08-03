'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { entrarComoCandidatoAction } from '../actions'

/**
 * Login do candidato — /vaga/login
 *
 * É pra cá que o link enviado ao candidato aponta. O acesso é o login+senha
 * gerado pelo admin, que funciona SÓ 2 vezes e depois expira.
 */
export default function VagaLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    startTransition(async () => {
      const res = await entrarComoCandidatoAction({ email, senha })
      if ('erro' in res) {
        setErro(res.erro)
        return
      }
      if (res.entradasRestantes <= 0) {
        setAviso('Este é o seu último acesso — depois de sair, o login expira. Conclua as etapas agora.')
      }
      router.push('/vaga')
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen flex flex-col md:flex-row">
      {/* Branding */}
      <section className="flex-1 flex flex-col justify-center items-center p-8 md:p-12 bg-gradient-to-br from-noite-0 via-noite to-noite-0 border-b md:border-b-0 md:border-r border-white/5">
        <div className="max-w-md w-full text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter2 text-white">
            SPIN <span className="text-sol">SOLAR</span>
          </h1>
          <div className="mt-2 text-xs uppercase tracking-widest text-white/50 font-semibold">
            Convite de trabalho · Acesso do candidato
          </div>

          <h2 className="mt-8 text-2xl md:text-3xl font-bold text-white leading-tight mb-4">
            <span className="text-white/70">Você foi convidado para</span><br />
            <span>uma vaga na Spin.</span>
          </h2>

          <p className="text-white/60 leading-relaxed mb-6">
            Use o <strong className="text-white">login e senha</strong> que você recebeu no
            convite. Dentro você vai ler a proposta, assinar o contrato e enviar seus documentos.
          </p>

          <div className="inline-flex items-center gap-3 px-4 py-2 bg-sol/10 border border-sol/30 rounded-lg">
            <span className="text-sol text-xs font-bold uppercase tracking-wider">⏱ Acesso limitado</span>
            <span className="text-white/60 text-[11px]">Este login funciona apenas 2 vezes</span>
          </div>
        </div>
      </section>

      {/* Formulário */}
      <section className="flex-1 flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2">Entrar</h2>
          <p className="text-white/50 text-sm mb-8">Acesse com as credenciais do seu convite.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-semibold text-white/80">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-sol transition-colors"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="senha" className="text-sm font-semibold text-white/80">Senha</label>
              <input
                id="senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-sol transition-colors"
              />
            </div>

            {erro && (
              <div className="px-4 py-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
                {erro}
              </div>
            )}
            {aviso && (
              <div className="px-4 py-3 bg-sol/10 border border-sol/30 rounded-lg text-sm text-sol">
                {aviso}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-2 px-6 py-3 bg-sol text-noite-0 font-bold rounded-lg hover:bg-sol-claro transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? 'Entrando...' : 'Entrar e ver a proposta'}
            </button>
          </form>

          <p className="mt-8 text-xs text-white/40 text-center">
            Problema no acesso?{' '}
            <a
              href="https://wa.me/554832630182?text=Olá Spin! Tive um problema no acesso ao meu convite de trabalho."
              target="_blank"
              rel="noopener noreferrer"
              className="text-sol hover:text-sol-claro underline"
            >
              Fale com a Spin
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}
