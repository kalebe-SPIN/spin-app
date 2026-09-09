'use client'

/**
 * BessWizard — Kalebe 2026-09-09 (v2 multi-item + busca).
 *
 * Modo "kit BESS puro" (sem placas solares). Ativado quando o consultor
 * escolhe "🔋 Sem placas — só BESS" no toggle superior do KitPorUcClient.
 *
 * Todas as 5 seções aceitam MÚLTIPLOS itens (Kalebe pediu: às vezes o
 * cliente precisa de 2 baterias diferentes ou 3 controladoras). Cada
 * seção tem campo de busca embutido pra filtrar produtos em tempo real.
 *
 * Persistência: kit_selecionado.modo='bess_puro' + arrays por segmento +
 * tipo_projeto='bess' via salvarKitBessAction.
 */

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarKitBessAction } from '@/app/projetos/[id]/kit/actions'

export type ProdutoBess = {
  id: string
  marca: string | null
  modelo: string
  categoria: string
  subcategoria: string | null
  potencia_kw: number | null
  preco_venda: number | null
  disponivel_estoque: boolean
}

type ItemComposicao = {
  id: string
  marca: string | null
  modelo: string
  potencia_kw: number | null
  qtd: number
  preco_venda: number
}

type Props = {
  projetoId: string
  baterias: ProdutoBess[]
  controladoras: ProdutoBess[]
  medidores: ProdutoBess[]
  caixasJuncao: ProdutoBess[]
  opcionais: ProdutoBess[]
  todos?: ProdutoBess[]
  kitSalvo?: any | null
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

function toItem(p: ProdutoBess, qtd = 1): ItemComposicao {
  return {
    id: p.id,
    marca: p.marca,
    modelo: p.modelo,
    potencia_kw: p.potencia_kw,
    qtd,
    preco_venda: Number(p.preco_venda) || 0,
  }
}

export function BessWizard({
  projetoId,
  baterias, controladoras, medidores, caixasJuncao, opcionais, todos,
  kitSalvo,
}: Props) {
  const bat = baterias.length > 0 ? baterias : (todos || [])
  const ctrl = controladoras.length > 0 ? controladoras : (todos || [])
  const med = medidores.length > 0 ? medidores : (todos || [])
  const caixa = caixasJuncao.length > 0 ? caixasJuncao : (todos || [])
  const opts = opcionais.length > 0 ? opcionais : (todos || [])
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // Pré-carrega kit salvo — aceita formato antigo (single) e novo (array)
  const kitPre = kitSalvo?.modo === 'bess_puro' ? kitSalvo : null
  const toArr = (x: any): ItemComposicao[] => {
    if (Array.isArray(x)) return x
    if (x && typeof x === 'object' && x.id) return [x]
    return []
  }
  const [bats, setBats]   = useState<ItemComposicao[]>(toArr(kitPre?.baterias ?? kitPre?.bateria))
  const [ctrls, setCtrls] = useState<ItemComposicao[]>(toArr(kitPre?.controladoras ?? kitPre?.controladora))
  const [meds, setMeds]   = useState<ItemComposicao[]>(toArr(kitPre?.medidores ?? kitPre?.medidor))
  const [caixas, setCaixas] = useState<ItemComposicao[]>(kitPre?.caixas_juncao || [])
  const [extras, setExtras] = useState<ItemComposicao[]>(kitPre?.opcionais || [])

  const total = useMemo(() => {
    const linha = (i: ItemComposicao) => (i.preco_venda || 0) * (i.qtd || 1)
    const arr = (a: ItemComposicao[]) => a.reduce((s, i) => s + linha(i), 0)
    return arr(bats) + arr(ctrls) + arr(meds) + arr(caixas) + arr(extras)
  }, [bats, ctrls, meds, caixas, extras])

  const podeSalvar = bats.length > 0 && ctrls.length > 0 && meds.length > 0 && !pending

  function salvar() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      const r = await salvarKitBessAction(projetoId, {
        baterias: bats,
        controladoras: ctrls,
        medidores: meds,
        caixas_juncao: caixas,
        opcionais: extras,
      })
      if ('erro' in r && r.erro) { setErro(r.erro); return }
      setMsg('Kit BESS salvo. Redirecionando pro orçamento…')
      setTimeout(() => router.push(`/projetos/${projetoId}/orcamento`), 800)
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-sol/10 border border-sol/30 rounded-xl p-4 text-sm text-white/80 leading-relaxed">
        🔋 <strong className="text-sol">Modo BESS puro</strong> — kit de backup sem placas solares.
        Bateria + controladora + medidor são obrigatórios (pode adicionar mais de 1).
        Caixa de junção e opcionais são complementares.
      </div>

      <details className="bg-white/[0.02] border border-white/10 rounded-xl px-4 py-2 text-xs">
        <summary className="cursor-pointer text-white/60 select-none">
          🔍 Diagnóstico do catálogo — {(todos || []).length} produtos ativos
        </summary>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-white/70">
          <span>🔋 Baterias: <strong className="text-sol">{baterias.length}</strong></span>
          <span>⚙️ Controladoras: <strong className="text-sol">{controladoras.length}</strong></span>
          <span>📊 Medidores: <strong className="text-sol">{medidores.length}</strong></span>
          <span>🧰 Caixas: <strong className="text-sol">{caixasJuncao.length}</strong></span>
          <span>✨ Opcionais: <strong className="text-sol">{opcionais.length}</strong></span>
        </div>
        {(todos || []).length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-white/50 text-[11px]">Ver lista completa</summary>
            <ul className="mt-1.5 max-h-40 overflow-y-auto text-[11px] text-white/60 font-mono space-y-0.5">
              {(todos || []).map(p => (
                <li key={p.id} className="truncate">
                  {p.marca ? `${p.marca} · ` : ''}{p.modelo}
                  <span className="text-white/30 ml-2">[{p.categoria}{p.subcategoria ? `/${p.subcategoria}` : ''}]</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </details>

      <BlocoBusca
        titulo="🔋 Bateria"
        subtitulo={baterias.length > 0 ? "SBW ou similar da WEG — adicione quantas quiser" : "Nenhuma bateria reconhecida — mostrando todos ativos"}
        obrigatorio
        produtos={bat}
        itens={bats}
        onChange={setBats}
      />

      <BlocoBusca
        titulo="⚙️ Controladora / Inversor Híbrido"
        subtitulo={controladoras.length > 0 ? "WEG SIW200H (mono) ou SIW400H (tri) — adicione quantas quiser" : "Nenhuma controladora reconhecida — mostrando todos ativos"}
        obrigatorio
        produtos={ctrl}
        itens={ctrls}
        onChange={setCtrls}
      />

      <BlocoBusca
        titulo="📊 Medidor"
        subtitulo={medidores.length > 0 ? "CHINT DTSU666 ou similar pra monitoramento" : "Nenhum medidor reconhecido — mostrando todos ativos"}
        obrigatorio
        produtos={med}
        itens={meds}
        onChange={setMeds}
      />

      <BlocoBusca
        titulo="🧰 Caixas de junção"
        subtitulo={caixasJuncao.length > 0 ? "EMBOX ou outras — opcional" : "Nenhuma caixa reconhecida — mostrando todos ativos"}
        produtos={caixa}
        itens={caixas}
        onChange={setCaixas}
      />

      <BlocoBusca
        titulo="✨ Opcionais WEG"
        subtitulo={opcionais.length > 0 ? "Frete, cabos, acessórios da planilha WEG — opcional" : "Nenhum opcional reconhecido — mostrando todos ativos"}
        produtos={opts}
        itens={extras}
        onChange={setExtras}
      />

      <div className="sticky bottom-4 bg-noite/95 backdrop-blur border border-sol/40 rounded-xl p-5 flex items-center justify-between gap-4 shadow-xl">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-white/50">Total estimado (custo WEG)</p>
          <p className="text-2xl font-mono font-black text-sol">{fmtBRL(total)}</p>
        </div>
        <div className="text-right">
          {erro && <p className="text-xs text-coral mb-1">⚠️ {erro}</p>}
          {msg && <p className="text-xs text-verde mb-1">✓ {msg}</p>}
          <button
            onClick={salvar}
            disabled={!podeSalvar}
            className="px-6 py-3 rounded-lg bg-sol text-noite font-bold text-sm hover:bg-sol/80 disabled:opacity-40 transition"
          >
            {pending ? 'Salvando…' : '💾 Salvar kit BESS'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Bloco unificado: campo de busca + lista de itens escolhidos + dropdown pra
 * adicionar. Aceita múltiplos itens do mesmo segmento (Kalebe 2026-09-09).
 */
function BlocoBusca({
  titulo, subtitulo, obrigatorio, produtos, itens, onChange,
}: {
  titulo: string
  subtitulo: string
  obrigatorio?: boolean
  produtos: ProdutoBess[]
  itens: ItemComposicao[]
  onChange: (arr: ItemComposicao[]) => void
}) {
  const [busca, setBusca] = useState('')
  const [selNovoId, setSelNovoId] = useState('')

  const subtotal = itens.reduce((s, i) => s + (i.preco_venda || 0) * (i.qtd || 1), 0)

  // Filtra produtos por termo de busca + remove já escolhidos
  const idsEscolhidos = new Set(itens.map(i => i.id))
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const base = produtos.filter(p => !idsEscolhidos.has(p.id))
    if (!t) return base
    return base.filter(p =>
      p.modelo?.toLowerCase().includes(t) ||
      p.marca?.toLowerCase().includes(t) ||
      p.subcategoria?.toLowerCase().includes(t) ||
      p.categoria?.toLowerCase().includes(t)
    )
  }, [produtos, itens, busca, idsEscolhidos])

  function adicionar() {
    const p = filtrados.find(x => x.id === selNovoId) || produtos.find(x => x.id === selNovoId)
    if (!p) return
    if (idsEscolhidos.has(p.id)) return
    onChange([...itens, toItem(p)])
    setSelNovoId('')
    setBusca('')
  }

  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">
            {titulo}
            {obrigatorio && <span className="text-coral ml-1">*</span>}
          </h3>
          <p className="text-xs text-white/50 mt-0.5">{subtitulo}</p>
          <p className="text-[10px] text-white/40 mt-0.5">
            {produtos.length > 0
              ? `${produtos.length} produto${produtos.length === 1 ? '' : 's'} no catálogo · ${itens.length} adicionado${itens.length === 1 ? '' : 's'}`
              : 'nenhum produto cadastrado'}
          </p>
        </div>
        {subtotal > 0 && (
          <p className="text-sm font-mono font-bold text-sol shrink-0">
            {fmtBRL(subtotal)}
          </p>
        )}
      </div>

      {/* Itens já adicionados */}
      {itens.length > 0 && (
        <div className="space-y-1.5">
          {itens.map((it, idx) => (
            <div key={`${it.id}-${idx}`} className="flex items-center gap-2 text-sm bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
              <span className="flex-1 truncate">
                {it.marca ? <span className="text-white/50">{it.marca} · </span> : null}
                <span className="text-white font-semibold">{it.modelo}</span>
                {it.potencia_kw ? <span className="text-white/40 ml-1">({it.potencia_kw}kW)</span> : null}
              </span>
              <input
                type="number" min={1} step={1} value={it.qtd}
                onChange={(e) => {
                  const q = Math.max(1, Math.round(Number(e.target.value) || 1))
                  onChange(itens.map((x, i) => i === idx ? { ...x, qtd: q } : x))
                }}
                className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-center text-xs text-white"
              />
              <span className="text-xs font-mono text-sol shrink-0 w-24 text-right">
                {fmtBRL((it.preco_venda || 0) * (it.qtd || 1))}
              </span>
              <button
                onClick={() => onChange(itens.filter((_, i) => i !== idx))}
                className="text-xs text-coral hover:text-coral/70 px-1"
                title="Remover"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Busca + dropdown + adicionar */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar modelo, marca…"
          className="bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
        />
        <select
          value={selNovoId}
          onChange={(e) => setSelNovoId(e.target.value)}
          className="bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
        >
          <option value="">
            {filtrados.length === 0
              ? (busca ? `— nenhum resultado pra "${busca}" —` : '— nenhum produto disponível —')
              : `— selecionar (${filtrados.length} opção${filtrados.length === 1 ? '' : 'es'}) —`}
          </option>
          {filtrados
            .slice().sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR'))
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.marca ? `${p.marca} · ` : ''}{p.modelo}
                {p.potencia_kw ? ` (${p.potencia_kw}kW)` : ''}
                {' — '}{fmtBRL(Number(p.preco_venda) || 0)}
              </option>
            ))
          }
        </select>
        <button
          onClick={adicionar}
          disabled={!selNovoId}
          className="px-4 py-2 rounded-lg bg-sol/15 border border-sol/40 text-sol text-sm font-bold hover:bg-sol/25 disabled:opacity-40 transition"
        >
          + Adicionar
        </button>
      </div>
    </section>
  )
}
