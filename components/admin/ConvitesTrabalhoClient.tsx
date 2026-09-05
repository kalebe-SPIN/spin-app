'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarConviteAction,
  liberarAcessoAction,
  redefinirSenhaCandidatoAction,
  alterarTipoPropostaAction,
  excluirConviteAction,
} from '@/app/admin/vagas/actions'

type TipoProposta = 'comercial' | 'campo' | 'solar' | 'credenciamento'

type Convite = {
  id: string
  nome_candidato: string
  email_candidato: string
  telefone: string | null
  zona: string | null
  cargo: string
  status: string
  entradas_usadas: number
  max_entradas: number
  bloqueado: boolean
  tipo_proposta: TipoProposta | null
  created_at: string
}

const TIPO_INFO: Record<TipoProposta, { label: string; emoji: string; cor: string }> = {
  comercial:      { label: 'Consultor Comercial', emoji: '💼', cor: 'text-sol bg-sol/10 border-sol/25' },
  campo:          { label: 'Prof. de Campo',      emoji: '🔧', cor: 'text-weg-azul bg-weg-azul/10 border-weg-azul/25' },
  solar:          { label: 'Consultor Comercial', emoji: '💼', cor: 'text-sol bg-sol/10 border-sol/25' },
  credenciamento: { label: 'Credenciamento',      emoji: '⭐', cor: 'text-verde bg-verde/10 border-verde/25' },
}

const STATUS_LABEL: Record<string, { txt: string; cor: string }> = {
  enviado: { txt: 'Aguardando', cor: 'text-white/50 bg-white/5 border-white/10' },
  proposta_aceita: { txt: 'Proposta aceita', cor: 'text-sol bg-sol/10 border-sol/25' },
  contrato_assinado: { txt: 'Contrato assinado', cor: 'text-sol bg-sol/10 border-sol/25' },
  docs_enviados: { txt: 'Documentos enviados', cor: 'text-verde bg-verde/10 border-verde/25' },
  concluido: { txt: 'Concluído', cor: 'text-verde bg-verde/10 border-verde/25' },
  recusado: { txt: 'Recusado', cor: 'text-coral bg-coral/10 border-coral/25' },
}

export function ConvitesTrabalhoClient({ convites }: { convites: Convite[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [zona, setZona] = useState('')
  const [cidades, setCidades] = useState('')
  const [tipoProposta, setTipoProposta] = useState<TipoProposta>('comercial')
  const [erro, setErro] = useState<string | null>(null)
  const [cred, setCred] = useState<{ email: string; senha: string; link: string } | null>(null)

  function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCred(null)
    startTransition(async () => {
      const listaCidades = cidades.split(',').map((c) => c.trim()).filter(Boolean)
      const res = await criarConviteAction({ nome, email, telefone, zona, cidades: listaCidades, tipo_proposta: tipoProposta })
      if ('erro' in res) { setErro(res.erro); return }
      setCred({ email: res.email, senha: res.senha, link: res.link })
      setNome(''); setEmail(''); setTelefone(''); setZona(''); setCidades(''); setTipoProposta('comercial')
      router.refresh()
    })
  }

  function liberar(id: string) {
    startTransition(async () => { await liberarAcessoAction(id); router.refresh() })
  }

  function redefinir(id: string) {
    startTransition(async () => {
      const res = await redefinirSenhaCandidatoAction(id)
      if ('sucesso' in res) alert(`Nova senha: ${res.senha}\n\nEnvie ao candidato. Os 2 acessos foram renovados.`)
      else alert(res.erro)
      router.refresh()
    })
  }

  function trocarTipo(id: string, novo: TipoProposta) {
    startTransition(async () => {
      const res = await alterarTipoPropostaAction(id, novo)
      if ('erro' in res) alert(res.erro)
      router.refresh()
    })
  }

  function excluir(c: Convite) {
    if (!confirm(`Excluir o convite de ${c.nome_candidato}? Esta ação remove também a conta do candidato se ele ainda não foi promovido.`)) return
    startTransition(async () => {
      const res = await excluirConviteAction(c.id)
      if ('erro' in res) { alert(res.erro); return }
      if (!res.usuarioRemovido) {
        alert('Convite excluído. A conta do usuário permaneceu (já foi promovido ou pertence a outro role).')
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      {/* Formulário de novo convite */}
      <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Novo convite</h2>
        <form onSubmit={criar} className="grid sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm font-semibold text-white/80">Tipo de proposta</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([['comercial', '💼 Consultor Comercial'], ['credenciamento', '⭐ Credenciamento'], ['campo', '🔧 Profissional de Campo']] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTipoProposta(v)}
                  className={`py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                    tipoProposta === v ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-white/80">Nome do candidato</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Nome completo" className="input-spin" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-white/80">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="candidato@email.com" className="input-spin" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-white/80">Telefone (opcional)</label>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(48) 9....." className="input-spin" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-white/80">Zona de atuação (opcional)</label>
            <input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Ex.: Grande Florianópolis" className="input-spin" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm font-semibold text-white/80">Cidades de atuação (separadas por vírgula)</label>
            <input value={cidades} onChange={(e) => setCidades(e.target.value)} placeholder="Ex.: Florianópolis, Itajaí, Blumenau, Joinville" className="input-spin" />
            <p className="text-xs text-white/40">Aparecem com bandeirinha no mapa de SC na proposta.</p>
          </div>

          {erro && <div className="sm:col-span-2 px-4 py-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">{erro}</div>}

          <div className="sm:col-span-2">
            <button type="submit" disabled={pending} className="px-6 py-3 bg-sol text-noite-0 font-bold rounded-lg hover:bg-sol-claro transition-colors disabled:opacity-50">
              {pending ? 'Gerando acesso...' : 'Gerar login + senha'}
            </button>
          </div>
        </form>

        {/* Credenciais geradas (mostradas uma vez) */}
        {cred && (
          <div className="mt-6 p-5 bg-verde/[0.06] border border-verde/25 rounded-xl">
            <p className="text-verde font-bold mb-3">✓ Acesso criado — copie e envie ao candidato agora</p>
            <div className="space-y-2 text-sm font-mono">
              <CredLinha rotulo="Link" valor={cred.link} />
              <CredLinha rotulo="Email" valor={cred.email} />
              <CredLinha rotulo="Senha" valor={cred.senha} />
            </div>
            <p className="text-xs text-white/50 mt-3">
              O login funciona só 2 vezes e depois expira. A senha não fica visível de novo — se perder, use “Redefinir senha”.
            </p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(
                  `Sua proposta na Spin Solar:\n${cred.link}\nEmail: ${cred.email}\nSenha: ${cred.senha}\n(O acesso funciona 2 vezes.)`
                )
              }}
              className="mt-3 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors"
            >
              📋 Copiar mensagem pronta
            </button>
          </div>
        )}
      </section>

      {/* Lista de convites */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Candidatos ({convites.length})</h2>
        {convites.length === 0 ? (
          <p className="text-white/40 text-sm">Nenhum convite ainda.</p>
        ) : (
          <div className="grid gap-3">
            {convites.map((c) => {
              const st = STATUS_LABEL[c.status] || STATUS_LABEL.enviado
              const expirado = c.bloqueado || c.entradas_usadas >= c.max_entradas
              // 'solar' e 'comercial' foram unificados em Consultor Comercial → exibe 'comercial'
              const tipoAtual: TipoProposta = (c.tipo_proposta === 'solar' ? 'comercial' : (c.tipo_proposta as TipoProposta)) || 'comercial'
              const tInfo = TIPO_INFO[tipoAtual]
              return (
                <div key={c.id} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  <a href={`/admin/vagas/${c.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                    <p className="text-white font-semibold">{c.nome_candidato}</p>
                    <p className="text-white/50 text-sm truncate">{c.email_candidato}{c.zona ? ` · ${c.zona}` : ''}</p>
                  </a>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Tipo de proposta (editável inline via <select>) */}
                    <label className="relative">
                      <select
                        value={tipoAtual}
                        onChange={(e) => trocarTipo(c.id, e.target.value as TipoProposta)}
                        disabled={pending}
                        title="Trocar o tipo de proposta que o candidato vê"
                        className={`appearance-none text-xs font-bold pl-2.5 pr-6 py-1 rounded-full border cursor-pointer ${tInfo.cor} disabled:opacity-50`}
                      >
                        {(['comercial', 'credenciamento', 'campo'] as TipoProposta[]).map((k) => (
                          <option key={k} value={k} className="bg-noite text-white">
                            {TIPO_INFO[k].emoji} {TIPO_INFO[k].label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] opacity-60">▾</span>
                    </label>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${st.cor}`}>{st.txt}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${expirado ? 'text-coral bg-coral/10 border-coral/25' : 'text-white/50 bg-white/5 border-white/10'}`}>
                      {c.entradas_usadas}/{c.max_entradas} acessos{expirado ? ' · expirado' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => liberar(c.id)} disabled={pending} className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50">
                      Liberar +2
                    </button>
                    <button onClick={() => redefinir(c.id)} disabled={pending} className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50">
                      Redefinir senha
                    </button>
                    <a href={`/admin/vagas/${c.id}`} className="text-xs px-3 py-1.5 bg-sol/15 border border-sol/40 text-sol rounded-lg hover:bg-sol/25 transition-colors">
                      Detalhes →
                    </a>
                    <button
                      onClick={() => excluir(c)}
                      disabled={pending}
                      title="Excluir convite e conta do candidato"
                      className="text-xs px-3 py-1.5 bg-coral/10 border border-coral/25 rounded-lg text-coral hover:bg-coral/20 transition-colors disabled:opacity-50"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function CredLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/40 w-14 shrink-0">{rotulo}:</span>
      <span className="text-white break-all">{valor}</span>
    </div>
  )
}
