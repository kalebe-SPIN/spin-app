'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarCidadeAction,
  editarCidadeAction,
  toggleAtivoCidadeAction,
  excluirCidadeAction,
} from '@/app/admin/precificacao/cidades/actions'

export type CidadeRow = {
  id: string
  cidade: string
  uf: string
  km: number
  observacao: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export function CidadesAdminClient({ cidades }: { cidades: CidadeRow[] }) {
  const [modoNovo, setModoNovo] = useState(false)

  const ativas = cidades.filter((c) => c.ativo)
  const inativas = cidades.filter((c) => !c.ativo)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">
          <strong className="text-white">{ativas.length}</strong> cidades ativas ·{' '}
          <strong className="text-white/50">{inativas.length}</strong> inativas
        </p>
        {!modoNovo && (
          <button
            onClick={() => setModoNovo(true)}
            className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro"
          >
            + Nova cidade
          </button>
        )}
      </div>

      {modoNovo && <FormNovo onFechar={() => setModoNovo(false)} />}

      {/* Tabela */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_60px_80px_1fr_auto] gap-3 px-4 py-2 border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/40 font-bold">
          <div>Cidade</div>
          <div>UF</div>
          <div className="text-right">KM</div>
          <div>Observação</div>
          <div></div>
        </div>
        {cidades.length === 0 ? (
          <p className="text-sm text-white/40 italic text-center py-8">Nenhuma cidade cadastrada.</p>
        ) : (
          cidades.map((c) => <LinhaCidade key={c.id} cidade={c} />)
        )}
      </div>
    </div>
  )
}

function FormNovo({ onFechar }: { onFechar: () => void }) {
  const router = useRouter()
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('SC')
  const [km, setKm] = useState<number>(0)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await criarCidadeAction({ cidade, uf, km, observacao: obs || null })
      if (r?.erro) { setErro(r.erro); return }
      router.refresh()
      onFechar()
    })
  }

  return (
    <div className="p-4 bg-white/[0.03] border border-sol/25 rounded-xl">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px] gap-3 mb-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Cidade</label>
          <input value={cidade} onChange={(e) => setCidade(e.target.value)}
            placeholder="Ex: Chapecó"
            className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded text-sm text-white" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">UF</label>
          <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2}
            className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded text-sm text-white uppercase" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">KM (até sede)</label>
          <input type="number" min={0} step={1} value={km || ''} onChange={(e) => setKm(Number(e.target.value))}
            className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded text-sm text-white text-right" />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Observação (opcional)</label>
        <input value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Ex: pedágio · fim do atendimento"
          className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded text-sm text-white" />
      </div>
      {erro && <p className="text-xs text-coral mb-2">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onFechar} className="px-3 py-1.5 text-sm text-white/60 hover:text-white">Cancelar</button>
        <button onClick={salvar} disabled={isPending}
          className="px-4 py-1.5 bg-sol text-noite-0 font-bold text-sm rounded hover:bg-sol-claro disabled:opacity-50">
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

function LinhaCidade({ cidade }: { cidade: CidadeRow }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(cidade.cidade)
  const [uf, setUf] = useState(cidade.uf)
  const [km, setKm] = useState<number>(cidade.km)
  const [obs, setObs] = useState(cidade.observacao || '')
  const [isPending, startTransition] = useTransition()

  function salvar() {
    startTransition(async () => {
      await editarCidadeAction(cidade.id, { cidade: nome, uf, km, observacao: obs || null })
      setEditando(false)
      router.refresh()
    })
  }

  function toggle() {
    startTransition(async () => {
      await toggleAtivoCidadeAction(cidade.id, !cidade.ativo)
      router.refresh()
    })
  }

  function excluir() {
    if (!confirm(`Excluir "${cidade.cidade}/${cidade.uf}"?`)) return
    startTransition(async () => {
      await excluirCidadeAction(cidade.id)
      router.refresh()
    })
  }

  if (editando) {
    return (
      <div className="grid grid-cols-[1fr_60px_80px_1fr_auto] gap-3 px-4 py-2 border-b border-white/5 items-center bg-white/[0.05]">
        <input value={nome} onChange={(e) => setNome(e.target.value)}
          className="px-2 py-1 bg-white/5 border border-white/15 rounded text-sm text-white" />
        <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2}
          className="px-2 py-1 bg-white/5 border border-white/15 rounded text-sm text-white uppercase" />
        <input type="number" min={0} value={km} onChange={(e) => setKm(Number(e.target.value))}
          className="px-2 py-1 bg-white/5 border border-white/15 rounded text-sm text-white text-right" />
        <input value={obs} onChange={(e) => setObs(e.target.value)}
          className="px-2 py-1 bg-white/5 border border-white/15 rounded text-sm text-white" />
        <div className="flex gap-1">
          <button onClick={() => setEditando(false)} className="text-xs text-white/50 hover:text-white">×</button>
          <button onClick={salvar} disabled={isPending}
            className="text-xs px-2 py-1 bg-sol text-noite-0 font-bold rounded disabled:opacity-50">✓</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-[1fr_60px_80px_1fr_auto] gap-3 px-4 py-2 border-b border-white/5 items-center text-sm ${!cidade.ativo ? 'opacity-40' : ''}`}>
      <div className="text-white font-semibold">{cidade.cidade}</div>
      <div className="text-white/60">{cidade.uf}</div>
      <div className="text-sol tabular-nums text-right">{cidade.km}km</div>
      <div className="text-white/50 text-xs truncate">{cidade.observacao || '—'}</div>
      <div className="flex gap-1">
        <button onClick={toggle} disabled={isPending}
          title={cidade.ativo ? 'Desativar (some do simulador)' : 'Ativar'}
          className={`text-[10px] px-2 py-0.5 rounded border ${
            cidade.ativo ? 'bg-verde/15 text-verde border-verde/30' : 'bg-white/5 text-white/40 border-white/10'
          }`}>
          {cidade.ativo ? 'ativo' : 'inativo'}
        </button>
        <button onClick={() => setEditando(true)} className="text-xs text-white/50 hover:text-white px-2">✏</button>
        <button onClick={excluir} disabled={isPending} className="text-xs text-coral hover:text-coral/80 px-2">🗑</button>
      </div>
    </div>
  )
}
