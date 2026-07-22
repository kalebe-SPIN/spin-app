'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  atualizarFaixaAction,
  criarFaixaAction,
  removerFaixaAction,
} from '@/app/admin/precificacao/faixas/actions'
import type { Faixa } from '@/lib/precificacao/faixas'

const NOME_SERVICO: Record<string, string> = {
  limpeza_fotovoltaica: '🧹 Limpeza fotovoltaica',
  revisao_manutencao: '🔧 Revisão e manutenção',
}

export function FaixasPrecosClient({
  chaveServico,
  faixas,
}: {
  chaveServico: string
  faixas: Faixa[]
}) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function salvar(id: string, patch: any) {
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await atualizarFaixaAction(id, patch)
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setMsg('✓ Salvo')
        router.refresh()
        setTimeout(() => setMsg(null), 2000)
      }
    })
  }

  function remover(id: string) {
    if (!confirm('Remover essa faixa?')) return
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await removerFaixaAction(id)
      if ('erro' in res && res.erro) setErro(res.erro)
      else router.refresh()
    })
  }

  function adicionar() {
    const ultima = faixas[faixas.length - 1]
    const proxOrdem = (ultima?.ordem || 0) + 1
    const proxMin = (ultima?.faixa_max || 0) + 1
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await criarFaixaAction({
        chave_servico: chaveServico,
        unidade: ultima?.unidade || 'placas',
        faixa_min: proxMin,
        faixa_max: null,
        valor: 0,
        descricao: 'Nova faixa',
        ordem: proxOrdem,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
      else router.refresh()
    })
  }

  const unidadeExibida = faixas[0]?.unidade || 'placas'

  return (
    <section className="mb-8 bg-white/[0.03] border border-white/10 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">
            {NOME_SERVICO[chaveServico] || chaveServico}
          </h2>
          <p className="text-xs text-white/50">
            Cobrança por <strong className="text-sol">{unidadeExibida}</strong>
          </p>
        </div>
        <button
          onClick={adicionar}
          disabled={pending}
          className="text-xs px-3 py-1.5 bg-sol/20 border border-sol/40 text-sol font-bold rounded hover:bg-sol/30 disabled:opacity-40"
        >
          + Nova faixa
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-white/10">
            <th className="pb-2 text-[10px] uppercase text-white/50 font-bold w-16">#</th>
            <th className="pb-2 text-[10px] uppercase text-white/50 font-bold">Faixa ({unidadeExibida})</th>
            <th className="pb-2 text-[10px] uppercase text-white/50 font-bold">Valor (R$)</th>
            <th className="pb-2 text-[10px] uppercase text-white/50 font-bold">Descrição</th>
            <th className="pb-2 text-[10px] uppercase text-white/50 font-bold w-24">Ativo</th>
            <th className="pb-2 text-[10px] uppercase text-white/50 font-bold w-16"></th>
          </tr>
        </thead>
        <tbody>
          {faixas.map((f) => (
            <FaixaLinha key={f.id} f={f} onSalvar={salvar} onRemover={remover} pending={pending} />
          ))}
        </tbody>
      </table>

      {msg && <p className="text-xs text-verde mt-2">{msg}</p>}
      {erro && <p className="text-xs text-coral mt-2">⚠️ {erro}</p>}
    </section>
  )
}

function FaixaLinha({
  f, onSalvar, onRemover, pending,
}: {
  f: Faixa
  onSalvar: (id: string, patch: any) => void
  onRemover: (id: string) => void
  pending: boolean
}) {
  const [min, setMin] = useState(f.faixa_min)
  const [max, setMax] = useState<number | null>(f.faixa_max)
  const [valor, setValor] = useState(f.valor)
  const [desc, setDesc] = useState(f.descricao || '')
  const [ativo, setAtivo] = useState(f.ativo)

  const mudou =
    min !== f.faixa_min ||
    max !== f.faixa_max ||
    valor !== f.valor ||
    desc !== (f.descricao || '') ||
    ativo !== f.ativo

  return (
    <tr className="border-b border-white/5">
      <td className="py-2 text-white/40 text-xs">{f.ordem}</td>
      <td className="py-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={min}
            onChange={e => setMin(parseFloat(e.target.value) || 0)}
            className="w-16 px-1.5 py-1 bg-noite border border-white/15 rounded text-white text-xs"
          />
          <span className="text-white/40">-</span>
          <input
            type="number"
            value={max ?? ''}
            placeholder="∞"
            onChange={e => setMax(e.target.value ? parseFloat(e.target.value) : null)}
            className="w-16 px-1.5 py-1 bg-noite border border-white/15 rounded text-white text-xs"
          />
        </div>
      </td>
      <td className="py-2">
        <input
          type="number"
          step={50}
          value={valor}
          onChange={e => setValor(parseFloat(e.target.value) || 0)}
          className="w-24 px-1.5 py-1 bg-noite border border-white/15 rounded text-white text-xs font-bold"
        />
      </td>
      <td className="py-2">
        <input
          type="text"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          className="w-full px-1.5 py-1 bg-noite border border-white/15 rounded text-white text-xs"
        />
      </td>
      <td className="py-2 text-center">
        <input
          type="checkbox"
          checked={ativo}
          onChange={e => setAtivo(e.target.checked)}
          className="w-4 h-4 accent-verde"
        />
      </td>
      <td className="py-2">
        <div className="flex items-center gap-1">
          {mudou && (
            <button
              onClick={() => onSalvar(f.id, {
                faixa_min: min, faixa_max: max, valor, descricao: desc, ativo,
              })}
              disabled={pending}
              className="text-xs px-2 py-1 bg-verde/20 border border-verde/40 text-verde font-bold rounded"
              title="Salvar"
            >
              💾
            </button>
          )}
          <button
            onClick={() => onRemover(f.id)}
            disabled={pending}
            className="text-xs px-2 py-1 bg-coral/10 border border-coral/30 text-coral rounded hover:bg-coral/20"
            title="Remover"
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  )
}
