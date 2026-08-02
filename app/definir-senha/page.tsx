'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/**
 * Página onde o usuário cai após clicar no link do email:
 *  - do convite (inviteUserByEmail)
 *  - do reset senha (resetPasswordForEmail)
 * O Supabase já autenticou o usuário via hash na URL — só define nova senha.
 */
export default function DefinirSenhaPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sessaoOk, setSessaoOk] = useState<boolean | null>(null)
  const [emailUsuario, setEmailUsuario] = useState<string | null>(null)

  // Verifica se tem sessão ativa (Supabase auto-loga via hash da URL)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setSessaoOk(true)
        setEmailUsuario(data.session.user.email || null)
      } else {
        setSessaoOk(false)
      }
    })
  }, [])

  function handleSalvar() {
    setErro(null)
    if (senha.length < 8) { setErro('Senha precisa ter pelo menos 8 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) {
        setErro(error.message)
        return
      }
      router.push('/dashboard')
    })
  }

  if (sessaoOk === null) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-white/60 text-sm">Verificando link...</p>
      </main>
    )
  }

  if (sessaoOk === false) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-coral/10 border border-coral/30 rounded-xl p-6 max-w-md w-full text-center space-y-3">
          <p className="text-2xl">🔗</p>
          <h1 className="text-xl font-bold text-coral">Link expirado ou inválido</h1>
          <p className="text-sm text-white/60">
            O link que você clicou expirou ou já foi usado.
            Peça ao admin pra gerar um novo pelo painel de usuários.
          </p>
          <Link href="/login" className="inline-block mt-3 px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg">
            Ir pro login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 max-w-md w-full space-y-4">
        <div className="text-center mb-2">
          <p className="text-3xl mb-2">🔐</p>
          <h1 className="text-2xl font-black text-white">Defina sua senha</h1>
          {emailUsuario && (
            <p className="text-xs text-white/50 mt-1">Conta: <strong className="text-white/80">{emailUsuario}</strong></p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Nova senha *</label>
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Mín 8 caracteres"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Confirme a senha *</label>
          <input
            type="password"
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            placeholder="Repita a senha"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
            onKeyDown={e => { if (e.key === 'Enter') handleSalvar() }}
          />
        </div>

        {erro && (
          <div className="p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
            ⚠️ {erro}
          </div>
        )}

        <button
          onClick={handleSalvar}
          disabled={pending || !senha || !confirmar}
          className="w-full py-2.5 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition text-sm"
        >
          {pending ? 'Salvando...' : '✓ Definir senha e entrar'}
        </button>

        <p className="text-[10px] text-white/40 text-center">
          Ao continuar você aceita os termos de uso do portal Spin Solar.
        </p>
      </div>
    </main>
  )
}
