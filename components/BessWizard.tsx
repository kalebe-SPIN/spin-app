'use client'

/**
 * BessWizard — Kalebe 2026-09-09.
 *
 * Modo "kit BESS puro" (sem placas solares) do passo /kit. Ativado quando
 * o consultor escolhe "🔋 Sem placas — só BESS" no toggle superior do
 * KitPorUcClient. Composição:
 *
 *  1. Bateria       (obrigatório)  — categoria='bateria'
 *  2. Controladora  (obrigatório)  — categoria='controlador' ou inversor_hibrido
 *  3. Medidor       (obrigatório)  — categoria='multimedidor' ou smart_meter
 *  4. Caixas junção (opcional, N)  — categoria='caixa_juncao'
 *  5. Opcionais     (opcional, N)  — qualquer produto WEG (frete, EMBOX, cabos)
 *
 * Persistência: kit_selecionado.modo='bess_puro' + tipo_projeto='bess' via
 * salvarKitBessAction. Preço total calculado ao vivo (custo/venda WEG).
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
  opcionais: ProdutoBess[]        // frete, EMBOX, cabos, acessórios
  todos?: ProdutoBess[]            // fallback: TODOS os ativos, se um bucket vier vazio
  kitSalvo?: any | null            // pra pré-carregar quando editando
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
  // Fallback: se um bucket específico veio vazio (nomenclatura fora do
  // padrão ou catálogo incompleto), oferece TODOS os ativos pra escolha
  // manual. Melhor mostrar tudo que travar o consultor.
  const bat = baterias.length > 0 ? baterias : (todos || [])
  const ctrl = controladoras.length > 0 ? controladoras : (todos || [])
  const med = medidores.length > 0 ? medidores : (todos || [])
  const caixa = caixasJuncao.length > 0 ? caixasJuncao : (todos || [])
  // Opcionais: se meu bucket ficou vazio, mostra todos os ativos (menos os já
  // reconhecidos nos buckets específicos que apareceram).
  const opts = opcionais.length > 0 ? opcionais : (todos || [])
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // Pré-carrega se já existe kit salvo em modo BESS puro
  const kitPre = kitSalvo?.modo === 'bess_puro' ? kitSalvo : null
  const [bateria, setBateria]         = useState<ItemComposicao | null>(kitPre?.bateria || null)
  const [controladora, setControladora] = useState<ItemComposicao | null>(kitPre?.controladora || null)
  const [medidor, setMedidor]         = useState<ItemComposicao | null>(kitPre?.medidor || null)
  const [caixas, setCaixas]           = useState<ItemComposicao[]>(kitPre?.caixas_juncao || [])
  const [extras, setExtras]           = useState<ItemComposicao[]>(kitPre?.opcionais || [])

  const total = useMemo(() => {
    const linha = (i: ItemComposicao | null) => (i ? (i.preco_venda || 0) * (i.qtd || 1) : 0)
    const arr = (a: ItemComposicao[]) => a.reduce((s, i) => s + linha(i), 0)
    return linha(bateria) + linha(controladora) + linha(medidor) + arr(caixas) + arr(extras)
  }, [bateria, controladora, medidor, caixas, extras])

  const podeSalvar = !!bateria && !!controladora && !!medidor && !pending

  function salvar() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      const r = await salvarKitBessAction(projetoId, {
        bateria, controladora, medidor,
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
        Bateria + controladora + medidor são obrigatórios. Caixa de junção e opcionais são complementares.
      </div>

      {/* Debug: contagem por bucket. Útil quando um bucket vem vazio e o
          usuário precisa entender se é problema de catálogo ou nomenclatura. */}
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

      {/* Bateria */}
      <SelectItemBloco
        titulo="🔋 Bateria"
        subtitulo={baterias.length > 0 ? "Item central — SBW ou similar da WEG" : "Nenhuma bateria reconhecida — mostrando todos os produtos ativos"}
        obrigatorio
        produtos={bat}
        selecionado={bateria}
        onSelecionar={(p) => setBateria(p ? toItem(p) : null)}
        onQtdChange={(q) => setBateria(b => b ? { ...b, qtd: q } : null)}
      />

      {/* Controladora / Inversor Híbrido */}
      <SelectItemBloco
        titulo="⚙️ Controladora / Inversor Híbrido"
        subtitulo={controladoras.length > 0 ? "Converte DC da bateria pra AC — linha WEG SIW200H (mono) ou SIW400H (tri)" : "Nenhuma controladora reconhecida — mostrando todos os produtos ativos"}
        obrigatorio
        produtos={ctrl}
        selecionado={controladora}
        onSelecionar={(p) => setControladora(p ? toItem(p) : null)}
        onQtdChange={(q) => setControladora(c => c ? { ...c, qtd: q } : null)}
      />

      {/* Medidor */}
      <SelectItemBloco
        titulo="📊 Medidor"
        subtitulo={medidores.length > 0 ? "Multimedidor CHINT DTSU666 ou similar pra monitoramento" : "Nenhum medidor reconhecido — mostrando todos os produtos ativos"}
        obrigatorio
        produtos={med}
        selecionado={medidor}
        onSelecionar={(p) => setMedidor(p ? toItem(p) : null)}
        onQtdChange={(q) => setMedidor(m => m ? { ...m, qtd: q } : null)}
      />

      {/* Caixas de junção (múltiplas) */}
      <MultiSelectBloco
        titulo="🧰 Caixas de junção"
        subtitulo={caixasJuncao.length > 0 ? "EMBOX ou outras — opcional" : "Nenhuma caixa reconhecida — mostrando todos ativos"}
        produtos={caixa}
        selecionados={caixas}
        onChange={setCaixas}
      />

      {/* Opcionais (múltiplos) */}
      <MultiSelectBloco
        titulo="✨ Opcionais WEG"
        subtitulo={opcionais.length > 0 ? "Frete, cabos, acessórios da planilha WEG — opcional" : "Nenhum opcional reconhecido — mostrando todos ativos"}
        produtos={opts}
        selecionados={extras}
        onChange={setExtras}
      />

      {/* Total + salvar */}
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

function SelectItemBloco({
  titulo, subtitulo, obrigatorio, produtos, selecionado, onSelecionar, onQtdChange,
}: {
  titulo: string; subtitulo: string; obrigatorio?: boolean
  produtos: ProdutoBess[]
  selecionado: ItemComposicao | null
  onSelecionar: (p: ProdutoBess | null) => void
  onQtdChange: (qtd: number) => void
}) {
  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-white">{titulo}
            {obrigatorio && <span className="text-coral ml-1">*</span>}
          </h3>
          <p className="text-xs text-white/50 mt-0.5">{subtitulo}</p>
          <p className="text-[10px] text-white/40 mt-0.5">
            {produtos.length > 0
              ? `${produtos.length} produto${produtos.length === 1 ? '' : 's'} no catálogo`
              : 'nenhum produto cadastrado'}
          </p>
        </div>
        {selecionado && (
          <p className="text-sm font-mono font-bold text-sol">
            {fmtBRL((selecionado.preco_venda || 0) * (selecionado.qtd || 1))}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <select
          value={selecionado?.id || ''}
          onChange={(e) => {
            const p = produtos.find(x => x.id === e.target.value) || null
            onSelecionar(p)
          }}
          className="flex-1 bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
        >
          <option value="">— Selecione —</option>
          {produtos
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
        {selecionado && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/50">qtd</span>
            <input
              type="number" min={1} step={1}
              value={selecionado.qtd}
              onChange={(e) => onQtdChange(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="w-16 bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-2 py-2 text-white text-sm text-center focus:outline-none"
            />
          </div>
        )}
      </div>

      {produtos.length === 0 && (
        <p className="text-xs text-coral mt-2">⚠️ Nenhum produto disponível nessa categoria. Cadastre em /admin/catalogo.</p>
      )}
    </section>
  )
}

function MultiSelectBloco({
  titulo, subtitulo, produtos, selecionados, onChange,
}: {
  titulo: string; subtitulo: string
  produtos: ProdutoBess[]
  selecionados: ItemComposicao[]
  onChange: (arr: ItemComposicao[]) => void
}) {
  const [novoId, setNovoId] = useState('')
  function adicionar() {
    const p = produtos.find(x => x.id === novoId)
    if (!p) return
    if (selecionados.some(s => s.id === p.id)) return
    onChange([...selecionados, toItem(p)])
    setNovoId('')
  }
  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <div className="mb-3">
        <h3 className="text-base font-bold text-white">{titulo}</h3>
        <p className="text-xs text-white/50 mt-0.5">{subtitulo}</p>
      </div>

      {selecionados.length > 0 && (
        <div className="space-y-2 mb-3">
          {selecionados.map((s, idx) => (
            <div key={s.id} className="flex items-center gap-2 text-sm bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
              <span className="flex-1 truncate">{s.marca ? `${s.marca} · ` : ''}{s.modelo}</span>
              <input
                type="number" min={1} step={1} value={s.qtd}
                onChange={(e) => {
                  const q = Math.max(1, Math.round(Number(e.target.value) || 1))
                  onChange(selecionados.map((x, i) => i === idx ? { ...x, qtd: q } : x))
                }}
                className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-center text-xs"
              />
              <span className="text-xs font-mono text-sol shrink-0 w-24 text-right">
                {fmtBRL((s.preco_venda || 0) * (s.qtd || 1))}
              </span>
              <button
                onClick={() => onChange(selecionados.filter((_, i) => i !== idx))}
                className="text-xs text-coral hover:text-coral/70 px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select
          value={novoId}
          onChange={(e) => setNovoId(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
        >
          <option value="">— Adicionar item —</option>
          {produtos
            .filter(p => !selecionados.some(s => s.id === p.id))
            .slice().sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR'))
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.marca ? `${p.marca} · ` : ''}{p.modelo} — {fmtBRL(Number(p.preco_venda) || 0)}
              </option>
            ))
          }
        </select>
        <button
          onClick={adicionar}
          disabled={!novoId}
          className="px-4 py-2 rounded-lg bg-sol/10 border border-sol/30 text-sol text-sm font-bold hover:bg-sol/20 disabled:opacity-40 transition"
        >
          + Adicionar
        </button>
      </div>
    </section>
  )
}
