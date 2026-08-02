'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cadastrarParceiroAction } from './actions'
import { formatarTelefone } from '@/lib/formatters'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const

export default function CadastroParceiroPage() {
  const [pending, startTransition] = useTransition()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState<string>('SC')
  const [experiencia, setExperiencia] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  function handleEnviar() {
    setErro(null)
    startTransition(async () => {
      const res = await cadastrarParceiroAction({
        nome_completo: nome,
        email,
        telefone,
        cidade,
        uf,
        experiencia_solar: experiencia,
      })
      if ('erro' in res) {
        setErro(res.erro)
      } else {
        setSucesso(true)
      }
    })
  }

  if (sucesso) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-verde/10 border border-verde/30 rounded-xl p-8 max-w-lg w-full text-center space-y-4">
          <p className="text-5xl">🎉</p>
          <h1 className="text-2xl font-black text-white">Cadastro recebido</h1>
          <p className="text-sm text-white/80 leading-relaxed">
            Enviamos um <strong className="text-verde">email pra {email}</strong> com o link
            pra você definir sua senha e completar o acesso.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-left text-xs text-white/70 space-y-2">
            <p><strong className="text-sol">📮 Próximos passos:</strong></p>
            <p>1. Confira seu email (e a caixa de spam) — chega em 1-5min</p>
            <p>2. Clique no link e defina sua senha</p>
            <p>3. Aguarde a Spin aprovar seu cadastro (você recebe outro email)</p>
            <p>4. Depois de aprovado, seu perfil aparece na vitrine pública 🌞</p>
          </div>
          <p className="text-[10px] text-white/40">
            Não recebeu o email? Chama a Spin no WhatsApp: (48) 3263-0182
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🤝</p>
          <h1 className="text-3xl font-black text-white">
            Seja um <span className="text-sol">parceiro Spin</span>
          </h1>
          <p className="text-sm text-white/60 mt-2">
            Representante credenciado, aparece na vitrine, recebe leads da sua região.
            Cadastro sujeito à aprovação da Spin Solar.
          </p>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">Nome completo *</label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Como aparecerá no seu perfil público"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">WhatsApp *</label>
            <input
              type="tel"
              value={telefone}
              onChange={e => setTelefone(formatarTelefone(e.target.value))}
              placeholder="(48) 99999-9999"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-white/70 mb-1">Cidade principal *</label>
              <input
                type="text"
                value={cidade}
                onChange={e => setCidade(e.target.value)}
                placeholder="Ex: Florianópolis"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">UF *</label>
              <select
                value={uf}
                onChange={e => setUf(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
              >
                {UFS.map(u => <option key={u} value={u} style={{ backgroundColor: '#050B16' }}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">
              Experiência com solar (opcional)
            </label>
            <input
              type="text"
              value={experiencia}
              onChange={e => setExperiencia(e.target.value)}
              placeholder="Ex: Residencial, 3 anos, 20 projetos"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>

          {erro && (
            <div className="p-3 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
              ⚠️ {erro}
            </div>
          )}

          <button
            onClick={handleEnviar}
            disabled={pending || !nome || !email || !telefone || !cidade}
            className="w-full py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition text-sm"
          >
            {pending ? 'Enviando...' : '🚀 Enviar cadastro'}
          </button>

          <p className="text-[10px] text-white/40 text-center">
            Ao continuar você aceita ser contatado pela Spin Solar
            para conclusão do cadastro. Cadastro sujeito à análise.
          </p>
        </div>

        <div className="text-center mt-4">
          <Link href="/login" className="text-xs text-white/50 hover:text-white transition">
            Já tem cadastro? Faça login →
          </Link>
        </div>
      </div>
    </main>
  )
}
