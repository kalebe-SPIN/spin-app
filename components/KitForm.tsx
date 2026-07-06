'use client'

import { useState, useTransition, useMemo } from 'react'
import { salvarKitAction, type KitSelecionado } from '@/app/projetos/[id]/kit/actions'

type Produto = {
  id: string
  codigo_weg: string
  modelo: string
  fabricante: string | null
  descricao_curta: string
  specs: any
  disponivel_estoque: boolean
  precos_produtos: Array<{ preco_venda: number; vigente_de: string }>
}

type Props = {
  projetoId: string
  potCcSugeridaKwp: number
  placas: Produto[]
  inversores: Produto[]
  kitSalvo: KitSelecionado | null
}

export function KitForm({ projetoId, potCcSugeridaKwp, placas, inversores, kitSalvo }: Props) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const [placaId, setPlacaId] = useState<string | null>(kitSalvo?.placa?.id || null)
  const [inversorId, setInversorId] = useState<string | null>(kitSalvo?.inversor?.id || null)
  const [qtdInversores, setQtdInversores] = useState<number>(kitSalvo?.qtd_inversores || 1)
  const [observacoes, setObservacoes] = useState<string>(kitSalvo?.observacoes || '')
  const [mostrarIndisponiveis, setMostrarIndisponiveis] = useState(false)

  // Preço vigente de um produto (o mais recente)
  const precoDe = (p: Produto) => {
    const ps = p.precos_produtos || []
    if (!ps.length) return 0
    return ps.slice().sort((a, b) => (a.vigente_de < b.vigente_de ? 1 : -1))[0].preco_venda
  }

  const placaSelecionada = placas.find(p => p.id === placaId)
  const inversorSelecionado = inversores.find(i => i.id === inversorId)

  // Quantidade de placas necessária pra atingir potência sugerida
  const qtdPlacas = useMemo(() => {
    if (!placaSelecionada) return 0
    const wp = placaSelecionada.specs?.potencia_wp || 0
    if (wp <= 0) return 0
    return Math.ceil((potCcSugeridaKwp * 1000) / wp)
  }, [placaSelecionada, potCcSugeridaKwp])

  const potenciaCcKwp = useMemo(() => {
    if (!placaSelecionada) return 0
    const wp = placaSelecionada.specs?.potencia_wp || 0
    return (qtdPlacas * wp) / 1000
  }, [qtdPlacas, placaSelecionada])

  const potenciaCaKw = useMemo(() => {
    if (!inversorSelecionado) return 0
    const kw = inversorSelecionado.specs?.potencia_kw || 0
    return kw * qtdInversores
  }, [inversorSelecionado, qtdInversores])

  const fciPct = useMemo(() => {
    if (potenciaCaKw <= 0) return 0
    return (potenciaCcKwp / potenciaCaKw) * 100
  }, [potenciaCcKwp, potenciaCaKw])

  const precoTotal = useMemo(() => {
    let total = 0
    if (placaSelecionada) total += precoDe(placaSelecionada) * qtdPlacas
    if (inversorSelecionado) total += precoDe(inversorSelecionado) * qtdInversores
    return total
  }, [placaSelecionada, qtdPlacas, inversorSelecionado, qtdInversores])

  // Filtrar inversores compatíveis com a potência CC
  const inversoresCompativeis = useMemo(() => {
    if (potenciaCcKwp <= 0) return inversores
    return inversores.filter(inv => {
      const kw = inv.specs?.potencia_kw || 0
      // FCI aceitável: 100% a 145% (padrão Spin)
      const fciMin = potenciaCcKwp / (kw * 1.45)  // qtd_inv min
      const fciMax = potenciaCcKwp / (kw * 1.00)  // qtd_inv max
      // Se existir qualquer qtd inteira entre min e max, é compatível
      return Math.ceil(fciMin) <= Math.floor(fciMax) || kw >= potenciaCcKwp * 0.7
    })
  }, [inversores, potenciaCcKwp])

  const placasVisiveis = mostrarIndisponiveis ? placas : placas.filter(p => p.disponivel_estoque)
  const inversoresVisiveis = mostrarIndisponiveis ? inversoresCompativeis : inversoresCompativeis.filter(i => i.disponivel_estoque)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!placaSelecionada || !inversorSelecionado) {
      setErro('Escolha uma placa E um inversor.')
      return
    }
    if (fciPct < 80 || fciPct > 160) {
      setErro(`FCI ${fciPct.toFixed(0)}% fora da faixa aceitável (80-160%). Ajuste quantidades.`)
      return
    }

    const kit: KitSelecionado = {
      placa: {
        id: placaSelecionada.id,
        codigo_weg: placaSelecionada.codigo_weg,
        modelo: placaSelecionada.modelo,
        potencia_wp: placaSelecionada.specs?.potencia_wp || 0,
        preco_venda: precoDe(placaSelecionada),
      },
      qtd_placas: qtdPlacas,
      potencia_cc_kwp: potenciaCcKwp,
      inversor: {
        id: inversorSelecionado.id,
        codigo_weg: inversorSelecionado.codigo_weg,
        modelo: inversorSelecionado.modelo,
        potencia_kw: inversorSelecionado.specs?.potencia_kw || 0,
        preco_venda: precoDe(inversorSelecionado),
      },
      qtd_inversores: qtdInversores,
      potencia_ca_kw: potenciaCaKw,
      fci_pct: fciPct,
      observacoes: observacoes.trim() || null,
    }

    startTransition(async () => {
      const result = await salvarKitAction(projetoId, kit)
      if (result && !result.sucesso) {
        setErro(result.erro || 'Erro ao salvar')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Toggle indisponíveis */}
      <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
        <input
          type="checkbox"
          checked={mostrarIndisponiveis}
          onChange={e => setMostrarIndisponiveis(e.target.checked)}
          className="rounded"
        />
        Mostrar produtos indisponíveis em estoque
      </label>

      {/* Placas */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-sol">☀️</span> Placa fotovoltaica
          <span className="text-xs font-normal text-white/40">({placasVisiveis.length} opções)</span>
        </h2>
        <div className="space-y-2">
          {placasVisiveis.map(p => (
            <ProdutoCard
              key={p.id}
              produto={p}
              selecionado={placaId === p.id}
              onSelect={() => setPlacaId(p.id)}
              tipo="placa"
              precoUnitario={precoDe(p)}
            />
          ))}
          {placasVisiveis.length === 0 && (
            <div className="p-4 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
              Nenhuma placa disponível em estoque. Marque "mostrar indisponíveis" pra ver todas.
            </div>
          )}
        </div>
      </section>

      {/* Cálculo intermediário */}
      {placaSelecionada && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-white/[0.02] border border-white/10 rounded-lg p-4">
          <Metric label="Qtd placas" value={qtdPlacas.toString()} />
          <Metric label="Potência CC" value={`${potenciaCcKwp.toFixed(2)} kWp`} highlight />
          <Metric label="Subtotal placas" value={`R$ ${(precoDe(placaSelecionada) * qtdPlacas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
        </div>
      )}

      {/* Inversores */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-weg-azul">⚡</span> Inversor
          <span className="text-xs font-normal text-white/40">({inversoresVisiveis.length} compatíveis)</span>
        </h2>
        <div className="space-y-2">
          {inversoresVisiveis.map(i => (
            <ProdutoCard
              key={i.id}
              produto={i}
              selecionado={inversorId === i.id}
              onSelect={() => setInversorId(i.id)}
              tipo="inversor"
              precoUnitario={precoDe(i)}
            />
          ))}
          {inversoresVisiveis.length === 0 && (
            <div className="p-4 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
              Nenhum inversor compatível disponível. Marque "mostrar indisponíveis" ou revise a potência.
            </div>
          )}
        </div>
      </section>

      {/* Quantidade de inversores (se selecionou) */}
      {inversorSelecionado && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
              Quantidade de inversores
            </span>
            <input
              type="number"
              min="1"
              max="10"
              value={qtdInversores}
              onChange={e => setQtdInversores(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Potência CA" value={`${potenciaCaKw.toFixed(2)} kW`} />
            <Metric
              label="FCI"
              value={`${fciPct.toFixed(0)}%`}
              highlight={fciPct >= 100 && fciPct <= 130}
              coral={fciPct < 80 || fciPct > 160}
            />
          </div>
        </div>
      )}

      {/* Observações */}
      <label className="block">
        <span className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">
          Observações do consultor (opcional)
        </span>
        <textarea
          rows={2}
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          placeholder="Ex: cliente preferiu placa monofacial, quer inversor híbrido pra futura expansão..."
          className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white"
        />
      </label>

      {/* Total */}
      {precoTotal > 0 && (
        <div className="p-4 bg-verde/10 border border-verde/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-white/80">Total do kit (placas + inversor):</span>
          <span className="text-2xl font-black text-verde">
            R$ {precoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 text-sm text-coral">
          ❌ {erro}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={isPending || !placaSelecionada || !inversorSelecionado}
          className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? 'Salvando...' : 'Confirmar kit → Passo 7 Lista CA'}
        </button>
      </div>
    </form>
  )
}

function ProdutoCard({
  produto, selecionado, onSelect, tipo, precoUnitario,
}: {
  produto: Produto
  selecionado: boolean
  onSelect: () => void
  tipo: 'placa' | 'inversor'
  precoUnitario: number
}) {
  const potencia = tipo === 'placa'
    ? `${produto.specs?.potencia_wp || 0} Wp`
    : `${produto.specs?.potencia_kw || 0} kW`
  const extra = tipo === 'inversor' ? produto.specs?.tensao_desc : produto.fabricante

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition ${
        selecionado
          ? 'bg-sol/15 border-sol/60 ring-1 ring-sol/40'
          : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-white text-sm">{produto.modelo}</span>
            <span className="text-xs font-mono text-white/40">{produto.codigo_weg}</span>
            {produto.disponivel_estoque ? (
              <span className="text-[10px] font-bold text-verde bg-verde/10 border border-verde/30 rounded px-1.5 py-0.5">
                ● ESTOQUE
              </span>
            ) : (
              <span className="text-[10px] font-bold text-coral bg-coral/10 border border-coral/30 rounded px-1.5 py-0.5">
                ● INDISPONÍVEL
              </span>
            )}
          </div>
          <p className="text-xs text-white/60">{produto.descricao_curta}</p>
          {extra && <p className="text-xs text-white/40 mt-0.5">{extra}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-white">{potencia}</p>
          <p className="text-xs text-sol font-mono">R$ {precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>
    </button>
  )
}

function Metric({ label, value, highlight, coral }: { label: string; value: string; highlight?: boolean; coral?: boolean }) {
  const cor = coral ? 'text-coral' : highlight ? 'text-sol' : 'text-white'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${cor}`}>{value}</p>
    </div>
  )
}
