'use client'

import { useEffect, useState } from 'react'
import { listarCidadesAction, cadastrarCidadeAction, type CidadeRegistro } from '@/app/inbox/cidades-actions'

/**
 * Cidade da conversa por menu suspenso (Kalebe 2026-10-14): lista do cadastro
 * de cidades (A→Z) + "Cadastrar nova cidade" quando ainda não existe.
 */
let cache: CidadeRegistro[] | null = null

const campo = 'px-2 py-0.5 rounded-full bg-white/5 border border-white/25 text-[11px] text-white focus:outline-none'

export function SeletorCidade({ cidadeAtual, ufAtual, onEscolher, onCancelar, campoFormulario }: {
  cidadeAtual: string | null
  ufAtual: string | null
  /** km: distância até a sede no cadastro (vira o deslocamento das propostas) */
  onEscolher: (c: { cidade: string; uf: string; km: number }) => void
  onCancelar?: () => void
  /** Dentro de formulário de proposta: campo do tamanho dos outros, sem o ✕ */
  campoFormulario?: string
}) {
  const [cidades, setCidades] = useState<CidadeRegistro[] | null>(cache)
  const [nova, setNova] = useState<null | { cidade: string; uf: string; km: string }>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (cache) return
    listarCidadesAction().then((r) => {
      if ('erro' in r) { setErro(r.erro); return }
      cache = r.cidades; setCidades(r.cidades)
    })
  }, [])

  const atual = (cidades || []).find((c) => cidadeAtual && c.cidade.toLowerCase() === cidadeAtual.toLowerCase() && (!ufAtual || c.uf === ufAtual.toUpperCase()))
  const valor = atual?.id || (cidadeAtual ? 'atual' : '')

  async function salvarNova() {
    if (!nova) return
    setSalvando(true); setErro(null)
    try {
      const km = Number(String(nova.km).replace(',', '.'))
      const r = await cadastrarCidadeAction({ cidade: nova.cidade, uf: nova.uf, km })
      if ('erro' in r) { setErro(r.erro); return }
      cache = [...(cache || []).filter((c) => c.id !== r.cidade.id), r.cidade].sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR'))
      setCidades(cache)
      onEscolher({ cidade: r.cidade.cidade, uf: r.cidade.uf, km: r.cidade.km })
    } finally { setSalvando(false) }
  }

  if (nova) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); salvarNova() }} className="flex flex-wrap items-center gap-1">
        <input autoFocus value={nova.cidade} onChange={(e) => setNova({ ...nova, cidade: e.target.value })} placeholder="Nova cidade" className={`${campo} w-32`} />
        <input value={nova.uf} onChange={(e) => setNova({ ...nova, uf: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" className={`${campo} w-10 uppercase`} />
        <input value={nova.km} onChange={(e) => setNova({ ...nova, km: e.target.value })} inputMode="decimal" placeholder="km até Tijucas" title="Distância até a sede (Tijucas) — vira o deslocamento das propostas" className={`${campo} w-28`} />
        <button type="submit" disabled={salvando || !nova.cidade.trim() || nova.uf.length !== 2 || nova.km.trim() === ''}
          className="px-2 py-0.5 rounded-full bg-verde text-white text-[11px] font-bold disabled:opacity-40">{salvando ? '…' : 'Cadastrar'}</button>
        <button type="button" onClick={() => { setNova(null); setErro(null) }} className="px-1.5 text-white/50 text-[11px]">✕</button>
        {erro && <span className="text-[11px] text-coral">{erro}</span>}
      </form>
    )
  }

  return (
    <span className={campoFormulario ? 'block space-y-1' : 'flex items-center gap-1'}>
      <select autoFocus={!campoFormulario} value={valor} disabled={!cidades}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'nova') { setNova({ cidade: '', uf: ufAtual || 'SC', km: '' }); return }
          const c = (cidades || []).find((x) => x.id === v)
          if (c) onEscolher({ cidade: c.cidade, uf: c.uf, km: c.km })
        }}
        className={campoFormulario || `${campo} max-w-[220px]`}>
        <option value="" className="bg-noite">{cidades ? 'Escolha a cidade…' : 'Carregando…'}</option>
        {cidadeAtual && !atual && <option value="atual" className="bg-noite">{cidadeAtual}{ufAtual ? `/${ufAtual}` : ''} (sem cadastro)</option>}
        {(cidades || []).map((c) => <option key={c.id} value={c.id} className="bg-noite">{c.cidade}/{c.uf}</option>)}
        <option value="nova" className="bg-noite">＋ Cadastrar nova cidade…</option>
      </select>
      {onCancelar && <button type="button" onClick={onCancelar} className="px-1.5 text-white/50 text-[11px]" aria-label="Cancelar">✕</button>}
      {erro && <span className="text-[11px] text-coral">{erro}</span>}
    </span>
  )
}
