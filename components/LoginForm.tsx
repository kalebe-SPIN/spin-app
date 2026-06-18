'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Formulário de login do portal interno.
 * Usa email + senha (Supabase Auth).
 *
 * Quem pode logar:
 * - admin (Kalebe e equipe Spin)
 * - representante (vendedores credenciados)
 * - instalador (equipe técnica)
 * - colaborador (suporte interno)
 *
 * Cliente final NÃO tem login aqui — vai direto pelo menu.spinsolar.com.br
 */
export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      // Tradução de mensagens comuns pro português
      const msg = error.message.toLowerCase().includes('invalid')
        ? 'Email ou senha incorretos. Confira e tente novamente.'
        : error.message
      setErro(msg)
      setLoading(false)
      return
    }

    // Login bem sucedido — vai pro dashboard
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md">
      {/* Email */}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-semibold text-white/80">
          Email
        </label>
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

      {/* Senha */}
      <div className="flex flex-col gap-2">
        <label htmlFor="senha" className="text-sm font-semibold text-white/80">
          Senha
        </label>
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

      {/* Erro */}
      {erro && (
        <div className="px-4 py-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          {erro}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 px-6 py-3 bg-sol text-noite-0 font-bold rounded-lg hover:bg-sol-claro transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Entrando...' : 'Entrar no sistema'}
      </button>

      {/* Link "esqueci senha" — implementar depois */}
      <a
        href="#"
        className="text-center text-sm text-white/50 hover:text-sol transition-colors mt-2"
      >
        Esqueci minha senha
      </a>
    </form>
  )
}
