'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { compartilharLevantamentoAction, removerCompartilhamentoAction } from '@/app/levantamentos/actions'
import { cardCls, inputCls } from './ui'

export type PessoaCampo = { id: string; nome: string }

/**
 * Acesso do campo (Kalebe 2026-10-27): o admin confere/corrige os dados que
 * vieram do projeto e concede o formulário a um ou mais usuários do setor
 * campo. Quem recebe ganha o link no sino e no WhatsApp; só essas pessoas
 * abrem e completam o levantamento.
 */
export function CompartilharLevantamento({ levantamentoId, compartilhados, campo }: {
  levantamentoId: string
  compartilhados: PessoaCampo[]
  campo: PessoaCampo[]   // usuários do campo ativos, A→Z
}) {
  const router = useRouter()
  const [escolhido, setEscolhido] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [tirando, setTirando] = useState<string | null>(null)
  const disponiveis = campo.filter((p) => !compartilhados.some((c) => c.id === p.id))

  async function conceder() {
    if (!escolhido) return
    setOcupado(true); setMsg(null)
    const nome = campo.find((p) => p.id === escolhido)?.nome || 'o técnico'
    const r = await compartilharLevantamentoAction(levantamentoId, escolhido)
    setOcupado(false)
    if ('erro' in r) { setMsg({ ok: false, texto: r.erro }); return }
    setMsg({ ok: true, texto: `Acesso concedido a ${nome}. O link foi para o sino${r.whatsapp ? ' e para o WhatsApp' : ''} dele.` })
    setEscolhido('')
    router.refresh()
  }

  async function tirar(id: string) {
    setOcupado(true); setMsg(null); setTirando(null)
    const r = await removerCompartilhamentoAction(levantamentoId, id)
    setOcupado(false)
    if ('erro' in r) { setMsg({ ok: false, texto: r.erro }); return }
    router.refresh()
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/levantamentos/${levantamentoId}`)
      setMsg({ ok: true, texto: 'Link copiado. Só abre para quem recebeu o acesso.' })
    } catch {
      setMsg({ ok: false, texto: 'Não consegui copiar. Copie o endereço da barra do navegador.' })
    }
  }

  return (
    <section className={`${cardCls} space-y-3 border-sol/40`}>
      <div>
        <h2 className="text-sm font-bold text-white">Acesso do campo</h2>
        <p className="text-xs text-white/60">
          Confira e corrija os dados que vieram do projeto (o formulário salva sozinho). Depois conceda o acesso: o técnico recebe o link no sino e no WhatsApp, completa o restante e envia.
        </p>
      </div>

      {compartilhados.length > 0 ? (
        <ul className="space-y-1.5">
          {compartilhados.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
              <span className="text-sm text-white min-w-0 truncate">✓ {p.nome}</span>
              {tirando === p.id
                ? <button type="button" disabled={ocupado} onClick={() => tirar(p.id)} className="px-2.5 py-1 bg-coral text-white text-xs font-bold rounded">Confirmar</button>
                : <button type="button" disabled={ocupado} onClick={() => setTirando(p.id)} className="px-2.5 py-1 border border-white/15 text-white/60 text-xs rounded">Tirar acesso</button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-white/50">Ninguém do campo tem acesso ainda.</p>
      )}

      {disponiveis.length > 0 ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={`${inputCls} border-white/15`} aria-label="Usuário do campo">
            <option value="">Escolha quem vai fazer a visita…</option>
            {disponiveis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <button type="button" onClick={conceder} disabled={!escolhido || ocupado} className="px-4 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 shrink-0">
            {ocupado ? 'Concedendo…' : 'Conceder acesso'}
          </button>
        </div>
      ) : !campo.length ? (
        <p className="text-xs text-white/60">Não há usuário ativo com perfil de campo (profissional de campo ou instalador). Cadastre em Administração → Usuários.</p>
      ) : null}

      <button type="button" onClick={copiarLink} className="px-3 py-1.5 border border-white/15 text-white/80 text-xs rounded-lg">Copiar link do levantamento</button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-white/80' : 'text-coral'}`}>{msg.ok ? '' : '⚠ '}{msg.texto}</p>}
    </section>
  )
}
