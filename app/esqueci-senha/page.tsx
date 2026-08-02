'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/**
 * Reset de senha via email nativo do Supabase.
 * Usuário digita email → recebe link → cai em /definir-senha pra escolher nova senha.
 */
export default function EsqueciSenhaPage() {
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function handleEnviar() {
    setErro(null)
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email.trim())) {
      setErro('Digite um email válido')
      return
    }
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/definir-senha`,
      })
      if (error) {
        setErro(error.message)
        return
      }
      setEnviado(true)
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 max-w-md w-full space-y-4">
        <div className="text-center mb-2">
          <p className="text-3xl mb-2">🔑</p>
          <h1 className="text-2xl font-black text-white">Esqueci minha senha</h1>
          <p className="text-xs text-white/60 mt-2">
            Digite seu email cadastrado. Enviaremos um link pra você definir uma nova senha.
          </p>
        </div>

        {enviado ? (
          <div className="p-4 bg-verde/10 border border-verde/30 rounded-lg text-center space-y-2">
            <p className="text-2xl">📬</p>
            <p className="text-sm text-verde font-semibold">Email enviado</p>
            <p className="text-xs text-white/60">
              Se este email está cadastrado no sistema, você receberá um link
              em alguns minutos. Verifique sua caixa de spam também.
            </p>
            <p className="text-[10px] text-white/40 mt-2">
              Se não chegar em 10 minutos, entre em contato com Kalebe pelo WhatsApp
              — ele pode gerar um link manual pra você.
            </p>
            <Link href="/login" className="inline-block mt-3 text-xs text-sol hover:underline">
              ← Voltar ao login
            </Link>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">Seu email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleEnviar() }}
              />
            </div>

            {erro && (
              <div className="p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
                ⚠️ {erro}
              </div>
            )}

            <button
              onClick={handleEnviar}
              disabled={pending || !email}
              className="w-full py-2.5 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition text-sm"
            >
              {pending ? 'Enviando...' : '📩 Enviar link de recuperação'}
            </button>

            <div className="text-center pt-2">
              <Link href="/login" className="text-xs text-white/50 hover:text-white transition">
                ← Voltar ao login
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
