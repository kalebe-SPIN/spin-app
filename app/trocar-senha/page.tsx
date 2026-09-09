'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Trocar senha temporária → definitiva.
 * Rota pra onde middleware redireciona quando user_metadata.must_change_password === true.
 * Diferente de /definir-senha (usada pra link mágico): aqui usuário já está logado.
 *
 * Kalebe 2026-09-09: caso Nilson não conseguia trocar (falso positivo "senha
 * igual à temporária"). Root cause provável: copiava a temp do WhatsApp com
 * espaço/quebra invisível, digitava outra achando ser diferente, mas na
 * verdade estava usando a mesma. Fixes:
 *   - Botão 👁 mostrar/ocultar (deixa o usuário conferir)
 *   - Trim automático (whitespace invisível grudado no copy/paste)
 *   - Contador de chars pra dar feedback
 *   - Removida heurística boba xxx-xxx-xxx (não pegava esse caso e
 *     causava falso positivo em senhas legítimas com hífen)
 *   - Mensagem melhor quando Supabase recusa: sugere digitar sem copiar
 */
/** Gera uma senha aleatória forte, legível (sem chars confundíveis).
 *  Chamada pelo botão "🎲 Gerar senha forte" — garante colisão zero com
 *  a senha temp anterior, hist. de senhas ou vazamentos comuns.
 */
function gerarSenhaForte(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const especiais = '@#$%&*!?'
  const bytes = new Uint8Array(14)
  crypto.getRandomValues(bytes)
  const base = Array.from(bytes.slice(0, 13), b => alfabeto[b % alfabeto.length])
  base.push(especiais[bytes[13] % especiais.length])
  // Embaralha pra não ficar sempre com especial no fim
  for (let i = base.length - 1; i > 0; i--) {
    const j = bytes[i % bytes.length] % (i + 1)
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  return base.join('')
}

export default function TrocarSenhaPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [erroCru, setErroCru] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setEmail(data.user.email || null)
    })
  }, [router])

  function preencherAleatoria() {
    const nova = gerarSenhaForte()
    setSenha(nova)
    setConfirmar(nova)
    setMostrar(true)
    setErro(null)
    setErroCru(null)
  }

  function handleSalvar() {
    setErro(null)
    setErroCru(null)
    // Trim whitespace invisível — WhatsApp/copy-paste às vezes deixa espaço no fim
    const senhaLimpa = senha.trim()
    const confirmarLimpa = confirmar.trim()
    if (senhaLimpa.length < 8) { setErro('Senha precisa ter no mínimo 8 caracteres.'); return }
    if (senhaLimpa !== confirmarLimpa) { setErro('As senhas não coincidem. Cheque se digitou a mesma coisa nos 2 campos.'); return }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: senhaLimpa,
        data: { must_change_password: false },
      })
      if (error) {
        console.error('[trocar-senha] updateUser error:', error)
        setErroCru(error.message)  // guarda literal pra mostrar no debug
        const msg = error.message.toLowerCase()
        if (msg.includes('different from the old') || msg.includes('same as the old') || msg.includes('same_password')) {
          setErro(
            'O Supabase recusou porque essa senha bate com uma senha ANTERIOR ' +
            'do seu histórico (a temp, ou alguma que você já usou). ' +
            'Clique em "🎲 Gerar senha forte" acima pra uma senha aleatória — resolve na hora.'
          )
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
          senha temporária que você recebeu no WhatsApp nem a nenhuma que você já usou antes.
        </div>

        <button
          type="button"
          onClick={preencherAleatoria}
          className="w-full py-2 bg-verde/10 border border-verde/30 hover:bg-verde/20 rounded-lg text-verde text-xs font-bold transition"
        >
          🎲 Gerar senha forte pra mim
        </button>
        <p className="text-[10px] text-white/40 -mt-2 leading-relaxed">
          Cria uma senha aleatória forte, mostra na tela pra você anotar, e resolve
          qualquer conflito com senha anterior. Anote no seu gerenciador antes de salvar.
        </p>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-white/70">Nova senha *</label>
            <button
              type="button" onClick={() => setMostrar(m => !m)}
              className="text-[10px] text-sol hover:text-sol/80 font-semibold"
            >
              {mostrar ? '🙈 Ocultar' : '👁 Mostrar'}
            </button>
          </div>
          <input
            type={mostrar ? 'text' : 'password'}
            autoComplete="new-password" data-lpignore="true" data-1p-ignore="true"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Mín 8 caracteres"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm font-mono focus:border-sol focus:outline-none"
            autoFocus
          />
          <p className="text-[10px] text-white/40 mt-1">
            {senha.trim().length} caractere{senha.trim().length === 1 ? '' : 's'}
            {senha !== senha.trim() && <span className="text-sol ml-2">(espaço invisível será removido)</span>}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Confirme a senha *</label>
          <input
            type={mostrar ? 'text' : 'password'}
            autoComplete="new-password" data-lpignore="true" data-1p-ignore="true"
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            placeholder="Repita"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm font-mono focus:border-sol focus:outline-none"
            onKeyDown={e => { if (e.key === 'Enter') handleSalvar() }}
          />
        </div>

        {erro && (
          <div className="p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral leading-relaxed">
            ⚠️ {erro}
            {erroCru && (
              <details className="mt-2 opacity-70">
                <summary className="cursor-pointer text-[10px] uppercase tracking-wider">Detalhe técnico</summary>
                <code className="text-[10px] block mt-1 font-mono break-all">{erroCru}</code>
              </details>
            )}
          </div>
        )}

        <button
          onClick={handleSalvar}
          disabled={pending || !senha.trim() || !confirmar.trim()}
          className="w-full py-2.5 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition text-sm"
        >
          {pending ? 'Salvando...' : '✓ Salvar e entrar'}
        </button>

        <p className="text-[10px] text-white/40 text-center leading-relaxed">
          Se continuar com erro, avise o admin pra gerar uma NOVA senha temporária pra você.
        </p>
      </div>
    </main>
  )
}
