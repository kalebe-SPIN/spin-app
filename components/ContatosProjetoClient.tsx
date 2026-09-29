'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatarTelefoneExibicao, type PapelContato } from '@/lib/whatsapp/contatos-projeto'
import { formatarTelefone } from '@/lib/formatters'
import {
  adicionarContatoProjetoAction,
  atualizarPapelContatoAction,
  removerContatoProjetoAction,
} from '@/app/projetos/[id]/contatos-actions'

const PAPEIS: Array<{ v: PapelContato; l: string; cor: string }> = [
  { v: 'decisor', l: 'Decisor', cor: 'text-sol bg-sol/10 border-sol/30' },
  { v: 'financeiro', l: 'Financeiro', cor: 'text-verde bg-verde/10 border-verde/30' },
  { v: 'tecnico', l: 'Técnico', cor: 'text-weg-azul bg-weg-azul/10 border-weg-azul/30' },
  { v: 'outro', l: 'Outro', cor: 'text-white/60 bg-white/5 border-white/15' },
]
const ORIGEM: Record<string, string> = {
  whatsapp_cartao: 'cartão no WhatsApp', whatsapp_texto: 'número no WhatsApp', manual: 'cadastro manual',
}
const inputCls = 'bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'

export function ContatosProjetoClient({ projetoId, contatos }: { projetoId: string; contatos: any[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [abrirForm, setAbrirForm] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [papel, setPapel] = useState<PapelContato>('decisor')
  const [erro, setErro] = useState<string | null>(null)

  function adicionar() {
    setErro(null)
    start(async () => {
      const r = await adicionarContatoProjetoAction({ projeto_id: projetoId, nome, telefone, papel })
      if ('erro' in r) { setErro(r.erro); return }
      setNome(''); setTelefone(''); setAbrirForm(false)
      router.refresh()
    })
  }

  return (
    <section className="mb-6 bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider font-bold text-white/70">
          📇 Contatos do projeto <span className="text-white/40 font-normal normal-case">({contatos.length})</span>
        </h2>
        <button type="button" onClick={() => setAbrirForm((v) => !v)} className="text-[11px] text-sol hover:underline">
          {abrirForm ? 'fechar' : '+ adicionar'}
        </button>
      </div>

      {contatos.length === 0 && !abrirForm && (
        <p className="text-xs text-white/40">
          Decisor, financeiro ou outra pessoa do cliente. Quando o cliente manda um contato no WhatsApp, ele aparece aqui.
        </p>
      )}

      {contatos.length > 0 && (
        <ul className="space-y-1.5">
          {contatos.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
              <span className="font-bold text-white">{c.nome}</span>
              {c.telefone && <span className="text-white/60 font-mono text-xs">{formatarTelefoneExibicao(c.telefone)}</span>}
              <select
                value={c.papel}
                disabled={pending}
                onChange={(e) => start(async () => { await atualizarPapelContatoAction(c.id, projetoId, e.target.value as PapelContato); router.refresh() })}
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${PAPEIS.find((p) => p.v === c.papel)?.cor || ''} bg-transparent`}
              >
                {PAPEIS.map((p) => <option key={p.v} value={p.v} className="bg-noite text-white">{p.l}</option>)}
              </select>
              <span className="text-[10px] text-white/35 ml-auto">{ORIGEM[c.origem] || c.origem}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => { if (confirm(`Remover ${c.nome} dos contatos do projeto?`)) start(async () => { await removerContatoProjetoAction(c.id, projetoId); router.refresh() }) }}
                className="text-coral/60 hover:text-coral text-xs"
                title="Remover"
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      {abrirForm && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={`${inputCls} flex-1 min-w-[140px]`} />
          <input value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} placeholder="(48) 99999-9999" className={`${inputCls} w-40`} />
          <select value={papel} onChange={(e) => setPapel(e.target.value as PapelContato)} className={inputCls}>
            {PAPEIS.map((p) => <option key={p.v} value={p.v} className="bg-noite">{p.l}</option>)}
          </select>
          <button type="button" onClick={adicionar} disabled={pending || !nome.trim()} className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40">
            Salvar
          </button>
        </div>
      )}
      {erro && <p className="text-xs text-coral mt-2">⚠ {erro}</p>}
    </section>
  )
}
