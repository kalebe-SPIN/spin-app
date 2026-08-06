'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Trocar senha temporária → definitiva.
 * Rota pra onde middleware redireciona quando user_metadata.must_change_password === true.
 * Diferente de /definir-senha (usada pra link mágico): aqui usuário já está logado.
 */
export default function TrocarSenhaPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setEmail(data.user.email || null)
    })
  }, [router])

  function handleSalvar() {
    setErro(null)
    if (senha.length < 8) { setErro('Senha precisa ter no mínimo 8 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }
    // Heurística: senha temp tem formato "xxx-xxx-xxx" (11 chars com 2 hífens)
    if (/^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/.test(senha)) {
      setErro('Essa parece ser a senha temporária que você recebeu. Crie uma senha NOVA, só sua, sem hífens.')
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      // Atualiza senha + marca metadata que não precisa mais trocar
      const { error } = await supabase.auth.updateUser({
        password: senha,
        data: { must_change_password: false },
      })
      if (error) {
        // Traduz mensagens comuns do Supabase pra português
        const msg = error.message.toLowerCase()
        if (msg.includes('different from the old') || msg.includes('same as the old')) {
          setErro('A nova senha precisa ser DIFERENTE da senha temporária que você recebeu. Escolha uma senha nova que só você conheça.')
        } else if (msg.includes('at least') && msg.includes('character')) {
          setErro('Senha muito curta. Use pelo menos 8 caracteres.')
        } else if (msg.includes('weak') || msg.includes('pwned') || msg.includes('leaked')) {
          setErro('Essa senha é considerada fraca ou já apareceu em vazamentos. Escolha outra combinação.')
        } else {
          setErro(error.message)
        }
        return
      }
      router.push('/dashboard')
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 max-w-md w-full space-y-4">
        <div className="text-center mb-2">
          <p className="text-3xl mb-2">🔐</p>
          <h1 className="text-2xl font-black text-white">Defina sua senha</h1>
          <p className="text-xs text-white/60 mt-2 leading-relaxed">
            Primeiro acesso — crie uma senha nova, só sua.
          </p>
          {email && (
            <p className="text-[10px] text-white/40 mt-1">Conta: <strong className="text-white/70">{email}</strong></p>
          )}
        </div>

        <div className="p-3 bg-sol/10 border border-sol/30 rounded-lg text-xs text-white/80 leading-relaxed">
          ⚠️ <strong className="text-sol">Atenção:</strong> a nova senha NÃO pode ser igual à
          senha temporária que você recebeu no WhatsApp. Escolha uma senha nova, só sua.
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Nova senha *</label>
          <input
            type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true"
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
            type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true"
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            placeholder="Repita"
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
          {pending ? 'Salvando...' : '✓ Salvar e entrar'}
        </button>
      </div>
    </main>
  )
}
