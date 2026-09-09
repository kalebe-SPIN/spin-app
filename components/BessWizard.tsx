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

import { useState, useMemo, useTransition, useRef, useEffect } from 'react'
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
  placas?: ProdutoBess[]           // MIN 2 unidades por questão tributária (Kalebe 2026-09-09)
  todos?: ProdutoBess[]
  kitSalvo?: any | null
}

const MIN_PLACAS_TRIBUTARIA = 2  // regra fixa Kalebe

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
  baterias, controladoras, medidores, caixasJuncao, opcionais, placas, todos,
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
  const [listaCa, setListaCa] = useState<ItemComposicao[]>(kitPre?.lista_ca || [])
  // Placa fotovoltaica: min 2 unidades por tributação. Single-select (só 1 modelo).
  // Se já veio kit salvo com placas, pré-carrega a primeira.
  const placaSalva: ItemComposicao | null = Array.isArray(kitPre?.placas) && kitPre.placas[0]?.id
    ? { ...kitPre.placas[0], qtd: Math.max(MIN_PLACAS_TRIBUTARIA, Number(kitPre.placas[0].qtd) || MIN_PLACAS_TRIBUTARIA) }
    : null
  const [placaEsc, setPlacaEsc] = useState<ItemComposicao | null>(placaSalva)

  const total = useMemo(() => {
    const linha = (i: ItemComposicao) => (i.preco_venda || 0) * (i.qtd || 1)
    const arr = (a: ItemComposicao[]) => a.reduce((s, i) => s + linha(i), 0)
    const placaTot = placaEsc ? linha(placaEsc) : 0
    return placaTot + arr(bats) + arr(ctrls) + arr(meds) + arr(caixas) + arr(extras) + arr(listaCa)
  }, [placaEsc, bats, ctrls, meds, caixas, extras, listaCa])

  const podeSalvar = !!placaEsc
    && placaEsc.qtd >= MIN_PLACAS_TRIBUTARIA
    && bats.length > 0 && ctrls.length > 0 && meds.length > 0 && !pending

  function salvar() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      const r = await salvarKitBessAction(projetoId, {
        baterias: bats,
        controladoras: ctrls,
        medidores: meds,
        caixas_juncao: caixas,
        opcionais: extras,
        lista_ca: listaCa,
        placas: placaEsc ? [placaEsc] : [],
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

      {/* Placa fotovoltaica — mínimo 2 unidades por tributação */}
      <BlocoPlacaTributaria
        placas={placas || []}
        selecionada={placaEsc}
        onChange={setPlacaEsc}
      />

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

      {/* Lista CA — materiais elétricos complementares (mesmo modelo do on-grid).
          Diferente dos opcionais WEG (kit): entram na base impostável, sofrem
          margem + comissão + imposto na proposta. */}
      <BlocoBusca
        titulo="🔌 Lista CA (materiais elétricos)"
        subtitulo={
          `Disjuntor, DPS, cabos, conectores, condulete etc — entra na base impostável (${
            (todos || []).length
          } produtos ativos)`
        }
        produtos={todos || []}
        itens={listaCa}
        onChange={setListaCa}
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
 * Bloco especial da placa fotovoltaica no kit BESS puro. Kalebe 2026-09-09:
 * mesmo em BESS puro precisa ter placa fotovoltaica pra manter tributação
 * de geração distribuída (CFOP/NCM). Mínimo 2 unidades.
 * Consultor escolhe UM MODELO só, e o sistema já sugere qtd = 2.
 * Qtd pode aumentar (3, 4…) mas não pode cair abaixo de 2.
 */
function BlocoPlacaTributaria({
  placas, selecionada, onChange,
}: {
  placas: ProdutoBess[]
  selecionada: ItemComposicao | null
  onChange: (i: ItemComposicao | null) => void
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const ord = placas.slice().sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR'))
    if (!t) return ord
    return ord.filter(p =>
      p.modelo?.toLowerCase().includes(t) || p.marca?.toLowerCase().includes(t)
    )
  }, [placas, busca])

  useEffect(() => {
    if (!aberto) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [aberto])

  function escolher(p: ProdutoBess) {
    onChange(toItem(p, MIN_PLACAS_TRIBUTARIA))
    setBusca('')
    setAberto(false)
  }

  const subtotal = selecionada ? (selecionada.preco_venda || 0) * (selecionada.qtd || MIN_PLACAS_TRIBUTARIA) : 0

  return (
    <section className="bg-gradient-to-br from-sol/10 to-sol/[0.03] border border-sol/40 rounded-xl p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">
            ☀️ Placa fotovoltaica <span className="text-coral ml-1">*</span>
          </h3>
          <p className="text-xs text-white/70 mt-0.5">
            Obrigatória em BESS puro por questão tributária — mantém regime de geração
            distribuída. Mínimo <strong className="text-sol">{MIN_PLACAS_TRIBUTARIA} unidades</strong>.
            Você escolhe o modelo, o sistema já adiciona {MIN_PLACAS_TRIBUTARIA}× (pode aumentar depois).
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">
            {placas.length > 0
              ? `${placas.length} placa${placas.length === 1 ? '' : 's'} no catálogo`
              : 'nenhuma placa cadastrada'}
          </p>
        </div>
        {subtotal > 0 && (
          <p className="text-sm font-mono font-bold text-sol shrink-0">{fmtBRL(subtotal)}</p>
        )}
      </div>

      {/* Item escolhido — mostra card + qtd editável */}
      {selecionada && (
        <div className="flex items-center gap-2 text-sm bg-sol/10 border border-sol/30 rounded-lg px-3 py-2">
          <span className="flex-1 truncate">
            {selecionada.marca ? <span className="text-white/50">{selecionada.marca} · </span> : null}
            <span className="text-white font-semibold">{selecionada.modelo}</span>
            {selecionada.potencia_kw ? (
              <span className="text-white/40 ml-1">({(selecionada.potencia_kw * 1000).toFixed(0)}Wp)</span>
            ) : null}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">qtd</span>
            <input
              type="number" min={MIN_PLACAS_TRIBUTARIA} step={1}
              value={selecionada.qtd}
              onChange={(e) => {
                const q = Math.max(MIN_PLACAS_TRIBUTARIA, Math.round(Number(e.target.value) || MIN_PLACAS_TRIBUTARIA))
                onChange({ ...selecionada, qtd: q })
              }}
              className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-center text-xs text-white"
              title={`Mínimo ${MIN_PLACAS_TRIBUTARIA} por tributação`}
            />
          </div>
          <span className="text-xs font-mono text-sol shrink-0 w-24 text-right">{fmtBRL(subtotal)}</span>
          <button
            onClick={() => onChange(null)}
            className="text-xs text-coral hover:text-coral/70 px-1"
            title="Trocar modelo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Combobox pra escolher (ou trocar) modelo */}
      {!selecionada && (
        <div ref={containerRef} className="relative">
          <div className="relative">
            <input
              type="text"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setAberto(true) }}
              onFocus={() => setAberto(true)}
              placeholder="🔎 Buscar modelo de placa fotovoltaica…"
              className="w-full bg-white/5 border border-sol/30 focus:border-sol/70 rounded-lg px-3 py-2 pr-9 text-white text-sm focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setAberto(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs"
              tabIndex={-1}
            >
              {aberto ? '▲' : '▼'}
            </button>
          </div>

          {aberto && (
            <div className="absolute z-30 mt-1.5 left-0 right-0 bg-noite border border-sol/40 rounded-lg shadow-2xl overflow-hidden max-h-72 flex flex-col">
              <div className="px-3 py-1.5 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-widest font-bold text-white/50 flex items-center justify-between gap-2">
                <span>
                  {filtradas.length === 0
                    ? (busca ? `nenhum resultado pra "${busca}"` : 'nenhuma placa disponível')
                    : `${filtradas.length} placa${filtradas.length === 1 ? '' : 's'} disponíve${filtradas.length === 1 ? 'l' : 'is'}`}
                </span>
                {filtradas.length > 0 && (
                  <span className="text-sol">clicar adiciona {MIN_PLACAS_TRIBUTARIA}× ao kit</span>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {filtradas.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => escolher(p)}
                    className="w-full text-left px-3 py-2 hover:bg-sol/10 focus:bg-sol/15 border-b border-white/5 last:border-b-0 transition"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">
                          {p.marca ? <span className="text-white/50 text-xs">{p.marca} · </span> : null}
                          <span className="font-semibold">{p.modelo}</span>
                          {p.potencia_kw ? (
                            <span className="text-white/50 ml-1 text-xs">({(p.potencia_kw * 1000).toFixed(0)}Wp)</span>
                          ) : null}
                        </p>
                      </div>
                      <p className="text-sm font-mono font-bold text-sol shrink-0">
                        {fmtBRL(Number(p.preco_venda) || 0)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
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
  const [qtdNova, setQtdNova] = useState(1)  // qtd a ser aplicada ao próximo item adicionado
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const subtotal = itens.reduce((s, i) => s + (i.preco_venda || 0) * (i.qtd || 1), 0)

  // Filtra produtos por termo de busca + remove já escolhidos
  const idsEscolhidos = new Set(itens.map(i => i.id))
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const base = produtos.filter(p => !idsEscolhidos.has(p.id))
    const ordenados = base.slice().sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR'))
    if (!t) return ordenados
    return ordenados.filter(p =>
      p.modelo?.toLowerCase().includes(t) ||
      p.marca?.toLowerCase().includes(t) ||
      p.subcategoria?.toLowerCase().includes(t) ||
      p.categoria?.toLowerCase().includes(t)
    )
  }, [produtos, itens, busca, idsEscolhidos])

  // Fecha painel ao clicar fora
  useEffect(() => {
    if (!aberto) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [aberto])

  function adicionar(p: ProdutoBess) {
    if (idsEscolhidos.has(p.id)) return
    onChange([...itens, toItem(p, Math.max(1, Math.round(qtdNova) || 1))])
    setBusca('')
    setQtdNova(1)
    setAberto(false)
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

      {/* Combobox custom — dark, sem <select> nativo. Campo de qtd ao lado
          define quantas unidades vão junto quando adicionar a próxima linha. */}
      <div ref={containerRef} className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setAberto(true) }}
              onFocus={() => setAberto(true)}
              placeholder={`🔎 Buscar e adicionar${itens.length > 0 ? ' outro item' : ''}…`}
              className="w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 pr-9 text-white text-sm focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setAberto(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs"
              tabIndex={-1}
            >
              {aberto ? '▲' : '▼'}
            </button>
          </div>
          {/* Quantidade inicial — vai na próxima linha adicionada */}
          <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.02] border border-white/10 rounded-lg px-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">qtd</span>
            <input
              type="number" min={1} step={1} value={qtdNova}
              onChange={(e) => setQtdNova(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="w-14 bg-transparent text-white text-sm text-center focus:outline-none py-2"
              title="Quantidade da próxima linha adicionada"
            />
          </div>
        </div>

        {aberto && (
          <div className="absolute z-30 mt-1.5 left-0 right-0 bg-noite border border-sol/40 rounded-lg shadow-2xl overflow-hidden max-h-72 flex flex-col">
            <div className="px-3 py-1.5 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-widest font-bold text-white/50 flex items-center justify-between gap-2">
              <span>
                {filtrados.length === 0
                  ? (busca ? `nenhum resultado pra "${busca}"` : 'nenhum produto disponível')
                  : `${filtrados.length} opç${filtrados.length === 1 ? 'ão' : 'ões'} disponíve${filtrados.length === 1 ? 'l' : 'is'}`}
              </span>
              {filtrados.length > 0 && (
                <span className="text-sol">clicar adiciona {qtdNova}× ao kit</span>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              {filtrados.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => adicionar(p)}
                  className="w-full text-left px-3 py-2 hover:bg-sol/10 focus:bg-sol/15 border-b border-white/5 last:border-b-0 transition"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {p.marca ? <span className="text-white/50 text-xs">{p.marca} · </span> : null}
                        <span className="font-semibold">{p.modelo}</span>
                        {p.potencia_kw ? <span className="text-white/50 ml-1 text-xs">({p.potencia_kw}kW)</span> : null}
                      </p>
                      <p className="text-[10px] text-white/40 mt-0.5 truncate">
                        {p.categoria}{p.subcategoria ? ` · ${p.subcategoria}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-mono font-bold text-sol shrink-0">
                      {fmtBRL(Number(p.preco_venda) || 0)}
                    </p>
                  </div>
                </button>
              ))}
              {filtrados.length === 0 && (
                <div className="p-4 text-center text-white/40 text-xs">
                  {busca
                    ? <>Nada casou com "<span className="text-white/60">{busca}</span>". Limpe a busca ou tente outro termo.</>
                    : 'Sem produtos disponíveis pra adicionar.'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
