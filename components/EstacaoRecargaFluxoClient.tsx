'use client'

import { useMemo, useState, useTransition } from 'react'
import { salvarVeRecargaAction, type VeRecargaSelecionada } from '@/app/projetos/[id]/ve/actions'

type Wallbox = {
  id: string
  codigo_weg: string
  modelo: string
  descricao_curta: string
  specs: any
  disponivel_estoque: boolean
  url_datasheet?: string | null
  precos_produtos: Array<{ preco_venda: number; vigente_de: string }>
}

type Acessorio = {
  id: string
  codigo_weg: string
  modelo: string
  descricao_curta: string
  categoria: string
  subcategoria: string | null
  specs: any
  precos_produtos: Array<{ preco_venda: number; vigente_de: string }>
}

type Props = {
  projetoId: string
  wallboxes: Wallbox[]
  acessorios: Acessorio[]
  selecaoSalva?: VeRecargaSelecionada | null
  margemPadraoPct: number
}

function fmtR$(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtNum(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function extrairPotenciaKw(w: Wallbox): number {
  const specs = w.specs || {}
  if (typeof specs.potencia_kw === 'number') return specs.potencia_kw
  if (typeof specs.potencia_nominal_ca_kw === 'number') return specs.potencia_nominal_ca_kw
  // Deduz do modelo "WEMOB Home Plus 7.4" → 7.4
  const m = String(w.modelo || '').match(/(\d+(?:[.,]\d+)?)\s*kW?/i)
  return m ? parseFloat(m[1].replace(',', '.')) : 0
}

function precoAtual(precos: Array<{ preco_venda: number; vigente_de: string }>): number {
  if (!precos || precos.length === 0) return 0
  const ordenados = [...precos].sort((a, b) => new Date(b.vigente_de).getTime() - new Date(a.vigente_de).getTime())
  return Number(ordenados[0].preco_venda) || 0
}

export function EstacaoRecargaFluxoClient({
  projetoId, wallboxes, acessorios, selecaoSalva, margemPadraoPct,
}: Props) {
  const [wallboxId, setWallboxId] = useState<string>(selecaoSalva?.wallbox?.id || '')
  const [qtd, setQtd] = useState<number>(selecaoSalva?.qtd || 1)
  const [margemPct, setMargemPct] = useState<number>(selecaoSalva?.margem_pct ?? margemPadraoPct)
  const [acessSelecionados, setAcessSelecionados] = useState<Array<{ id: string; qtd: number }>>(
    (selecaoSalva?.acessorios || []).map(a => ({ id: a.id, qtd: a.qtd })),
  )
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const wallboxEscolhido = wallboxes.find(w => w.id === wallboxId) || null

  // Filtro de acessórios úteis pra VE — recomendo disjuntor + DPS + cabo
  const acessoriosSugeridos = useMemo(() => acessorios.slice(0, 30), [acessorios])

  const calc = useMemo(() => {
    if (!wallboxEscolhido) {
      return { precoWallboxTotal: 0, precoAcessTotal: 0, precoBruto: 0, precoFinalCliente: 0 }
    }
    const precoUnitWallbox = precoAtual(wallboxEscolhido.precos_produtos)
    const precoWallboxTotal = precoUnitWallbox * qtd

    let precoAcessTotal = 0
    for (const sel of acessSelecionados) {
      const acess = acessorios.find(a => a.id === sel.id)
      if (!acess) continue
      const preco = precoAtual(acess.precos_produtos)
      precoAcessTotal += preco * sel.qtd
    }

    const precoBruto = precoWallboxTotal + precoAcessTotal
    // Aplica margem invertida (PV = custo / (1 - margem%))
    const fatorAcrescimo = 1 / (1 - margemPct / 100)
    const precoFinalCliente = precoBruto * fatorAcrescimo

    return { precoWallboxTotal, precoAcessTotal, precoBruto, precoFinalCliente }
  }, [wallboxEscolhido, qtd, acessSelecionados, margemPct, acessorios])

  function toggleAcessorio(id: string) {
    setAcessSelecionados(prev => {
      const idx = prev.findIndex(a => a.id === id)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [...prev, { id, qtd: 1 }]
    })
  }

  function atualizarQtdAcess(id: string, novaQtd: number) {
    setAcessSelecionados(prev => prev.map(a => a.id === id ? { ...a, qtd: Math.max(1, novaQtd) } : a))
  }

  function salvar() {
    if (!wallboxEscolhido) { setErro('Selecione um wallbox'); return }
    setErro(null)
    const selecao: VeRecargaSelecionada = {
      wallbox: {
        id: wallboxEscolhido.id,
        codigo_weg: wallboxEscolhido.codigo_weg,
        modelo: wallboxEscolhido.modelo,
        potencia_kw: extrairPotenciaKw(wallboxEscolhido),
        preco_unitario: precoAtual(wallboxEscolhido.precos_produtos),
      },
      qtd,
      acessorios: acessSelecionados.map(sel => {
        const a = acessorios.find(x => x.id === sel.id)!
        return {
          id: a.id, codigo_weg: a.codigo_weg, modelo: a.modelo,
          qtd: sel.qtd, preco_unitario: precoAtual(a.precos_produtos),
        }
      }),
      preco_wallbox_total: calc.precoWallboxTotal,
      preco_acessorios_total: calc.precoAcessTotal,
      preco_bruto: calc.precoBruto,
      margem_pct: margemPct,
      preco_final_cliente: calc.precoFinalCliente,
    }
    startTransition(async () => {
      const r = await salvarVeRecargaAction(projetoId, selecao)
      if (r && 'erro' in r && r.erro) setErro(r.erro)
    })
  }

  if (wallboxes.length === 0) {
    return (
      <div className="p-6 bg-coral/10 border border-coral/30 rounded-xl">
        <h2 className="text-lg font-bold text-coral mb-2">⚠ Nenhum wallbox cadastrado</h2>
        <p className="text-sm text-white/70">
          Não encontrei produtos com <code className="text-sol">subcategoria = 've_wallbox'</code> no
          catálogo. Importe a planilha WEG WEMOB pelo <strong>/admin/catalogo</strong> ou cadastre
          manualmente algum wallbox e volte aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna esquerda: lista de wallboxes */}
      <section className="lg:col-span-2 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">1. Escolha o wallbox</h2>
          <p className="text-xs text-white/50">Wallboxes WEG disponíveis no catálogo (linha WEMOB).</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {wallboxes.map(w => {
            const preco = precoAtual(w.precos_produtos)
            const pot = extrairPotenciaKw(w)
            const escolhido = wallboxId === w.id
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setWallboxId(w.id)}
                className={`text-left p-4 rounded-lg border transition ${
                  escolhido
                    ? 'bg-sol/15 border-sol/60'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-white flex items-center gap-2">
                      {escolhido && <span className="text-sol">✓</span>}
                      {w.modelo}
                    </p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      Cód WEG: {w.codigo_weg} {pot > 0 && `· ${fmtNum(pot, 1)} kW`}
                    </p>
                    {w.descricao_curta && (
                      <p className="text-[11px] text-white/60 mt-1">{w.descricao_curta}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-white/40">Preço WEG</p>
                    <p className="text-sm font-bold text-sol">{fmtR$(preco)}</p>
                  </div>
                </div>
                {w.url_datasheet && (
                  <a
                    href={w.url_datasheet}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 inline-block text-[10px] text-white/40 hover:text-sol"
                  >
                    📄 Datasheet
                  </a>
                )}
              </button>
            )
          })}
        </div>

        {/* Acessórios */}
        <div className="pt-6 border-t border-white/5">
          <h2 className="text-lg font-bold text-white mb-1">2. Acessórios (opcional)</h2>
          <p className="text-xs text-white/50 mb-3">
            Adicione disjuntor CA dedicado, DPS ou cabos extras se necessário. Os acessórios entram
            no preço bruto e aplicam a mesma margem.
          </p>
          <details className="bg-white/[0.02] border border-white/10 rounded-lg">
            <summary className="cursor-pointer p-3 text-xs text-white/70 hover:text-white">
              + Adicionar acessórios ({acessSelecionados.length} selecionados)
            </summary>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {acessoriosSugeridos.map(a => {
                const sel = acessSelecionados.find(x => x.id === a.id)
                const preco = precoAtual(a.precos_produtos)
                return (
                  <div key={a.id} className="flex items-center gap-2 p-2 hover:bg-white/[0.02] rounded">
                    <input
                      type="checkbox"
                      checked={!!sel}
                      onChange={() => toggleAcessorio(a.id)}
                      className="accent-sol"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{a.modelo}</p>
                      <p className="text-[10px] text-white/40">
                        {a.categoria} · {a.subcategoria || '—'} · {fmtR$(preco)}
                      </p>
                    </div>
                    {sel && (
                      <input
                        type="number"
                        min={1}
                        value={sel.qtd}
                        onChange={(e) => atualizarQtdAcess(a.id, Number(e.target.value) || 1)}
                        className="w-14 px-2 py-1 bg-noite border border-white/15 rounded text-xs text-white text-right"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </details>
        </div>
      </section>

      {/* Coluna direita: sumário + precificação */}
      <aside className="lg:col-span-1">
        <div className="sticky top-24 space-y-4 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">3. Precificação SPIN</h2>
            <p className="text-[11px] text-white/50">Margem aplicada sobre custo (método invertido).</p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
              Quantidade de wallboxes
            </label>
            <input
              type="number"
              min={1}
              value={qtd}
              onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3 py-2 bg-noite/60 border border-white/15 rounded text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
              Margem SPIN (%)
            </label>
            <input
              type="number"
              min={0}
              max={80}
              step={0.5}
              value={margemPct}
              onChange={(e) => setMargemPct(Math.max(0, Math.min(80, Number(e.target.value) || 0)))}
              className="w-full px-3 py-2 bg-noite/60 border border-white/15 rounded text-sm text-white"
            />
            <p className="text-[10px] text-white/40 mt-1">
              Padrão: {fmtNum(margemPadraoPct, 1)}% (parametros_fotovoltaico)
            </p>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-2 text-xs">
            <Linha label={`Wallbox × ${qtd}`} valor={fmtR$(calc.precoWallboxTotal)} />
            {calc.precoAcessTotal > 0 && (
              <Linha label={`Acessórios (${acessSelecionados.length})`} valor={fmtR$(calc.precoAcessTotal)} />
            )}
            <Linha label="Custo bruto" valor={fmtR$(calc.precoBruto)} destaque="white" />
            <Linha label={`Margem ${fmtNum(margemPct, 1)}%`} valor={fmtR$(calc.precoFinalCliente - calc.precoBruto)} />
            <div className="pt-2 border-t border-white/10">
              <Linha label="TOTAL AO CLIENTE" valor={fmtR$(calc.precoFinalCliente)} destaque="sol" grande />
            </div>
          </div>

          {erro && (
            <div className="text-xs text-coral p-2 bg-coral/10 border border-coral/30 rounded">
              ⚠ {erro}
            </div>
          )}

          <button
            type="button"
            onClick={salvar}
            disabled={pending || !wallboxEscolhido || calc.precoFinalCliente <= 0}
            className="w-full px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? '⏳ Salvando…' : '✓ Salvar estação de recarga'}
          </button>
          <p className="text-[10px] text-white/40 text-center">
            Após salvar, o item ve_recarga fica com valor {fmtR$(calc.precoFinalCliente)} na proposta consolidada.
          </p>
        </div>
      </aside>
    </div>
  )
}

function Linha({
  label, valor, destaque, grande,
}: {
  label: string
  valor: string
  destaque?: 'white' | 'sol'
  grande?: boolean
}) {
  const cor = destaque === 'sol' ? 'text-sol' : destaque === 'white' ? 'text-white' : 'text-white/70'
  const tam = grande ? 'text-base' : 'text-xs'
  return (
    <div className="flex items-center justify-between">
      <span className={`text-white/60 ${grande ? 'text-xs uppercase font-bold' : ''}`}>{label}</span>
      <span className={`font-bold tabular-nums ${cor} ${tam}`}>{valor}</span>
    </div>
  )
}
