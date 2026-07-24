'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UploadImagem } from '@/components/UploadImagem'
import { atualizarPerfilAction } from '@/app/conta/actions'

type Props = {
  profileInicial: {
    nome_completo?: string | null
    telefone?: string | null
    avatar_url?: string | null
    email?: string | null
    role?: string | null
  }
}

export function PerfilForm({ profileInicial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [nome, setNome] = useState(profileInicial.nome_completo || '')
  const [telefone, setTelefone] = useState(profileInicial.telefone || '')
  const [avatar, setAvatar] = useState(profileInicial.avatar_url || '')

  function salvar() {
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await atualizarPerfilAction({
        nome_completo: nome,
        telefone: telefone || null,
        avatar_url: avatar || null,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setMsg('✓ Perfil atualizado.')
        router.refresh()
        setTimeout(() => setMsg(null), 2500)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Avatar / Foto de perfil */}
      <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
        <UploadImagem
          label="📷 Sua foto de perfil"
          valorAtual={avatar}
          onChange={setAvatar}
          pasta="perfil"
          ajuda="Foto quadrada (será cortada em círculo). Aparece no header, propostas e comunicações."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            Nome completo *
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sol/50"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={profileInicial.email || ''}
            disabled
            className="w-full px-3 py-2.5 bg-white/[0.02] border border-white/5 rounded-lg text-sm text-white/60 cursor-not-allowed"
          />
          <p className="text-[10px] text-white/40 mt-1">Email não pode ser alterado</p>
        </div>

        <div>
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            Telefone / WhatsApp
          </label>
          <input
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(48) 99999-9999"
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sol/50 placeholder:text-white/30"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
            Papel no sistema
          </label>
          <div className="flex items-center h-[42px] px-3 bg-white/[0.02] border border-white/5 rounded-lg">
            <span className="inline-block px-3 py-1 bg-sol/10 text-sol text-xs font-bold rounded-full uppercase tracking-wider">
              {profileInicial.role || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-white/10">
        <button
          onClick={salvar}
          disabled={pending || !nome.trim()}
          className="px-6 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {pending ? '⏳ Salvando...' : '💾 Salvar alterações'}
        </button>
        {msg && <span className="text-sm text-verde">{msg}</span>}
        {erro && <span className="text-sm text-coral">⚠️ {erro}</span>}
      </div>
    </div>
  )
}
