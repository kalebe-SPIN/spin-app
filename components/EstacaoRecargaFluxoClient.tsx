'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { salvarVeRecargaAction, type VeRecargaSelecionada } from '@/app/projetos/[id]/ve/actions'
import {
  sugerirListaCaVE,
  deduzirFasesPorPotencia,
  resumoDimensionamento,
  type FasesRede,
} from '@/lib/estacao-ve/montar-lista-ca'

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

type ItemCatalogo = {
  id: string
  codigo_weg: string
  modelo: string
  descricao_curta: string
  categoria: string
  subcategoria: string | null
  specs: any
  precos_produtos: Array<{ preco_venda: number; vigente_de: string }>
}

type LinhaCA = {
  produto_id: string
  codigo_weg: string
  modelo: string
  categoria: string
  qtd: number
  preco_unitario: number
}

type Props = {
  projetoId: string
  wallboxes: Wallbox[]
  itensCatalogoCA: ItemCatalogo[]
  selecaoSalva?: (VeRecargaSelecionada & {
    itens_ca?: LinhaCA[]
    mao_obra?: MaoObraEstado
  }) | null
  margemPadraoPct: number
  comissaoPadraoPct: number
  impostosPadraoPct: number
  valorDiariaAlvenaria: number
  valorDiariaEletrica: number
}

type MaoObraEstado = {
  alvenaria_qtd_profissionais: number
  alvenaria_dias: number
  alvenaria_valor_diaria: number
  eletrica_qtd_profissionais: number
  eletrica_dias: number
  eletrica_valor_diaria: number
}

function fmtR$(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtNum(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
function extrairPotenciaKw(w: Wallbox): number {
  const s = w.specs || {}
  if (typeof s.potencia_kw === 'number') return s.potencia_kw
  if (typeof s.potencia_nominal_ca_kw === 'number') return s.potencia_nominal_ca_kw
  const m = String(w.modelo || '').match(/(\d+(?:[.,]\d+)?)\s*kW?/i)
  return m ? parseFloat(m[1].replace(',', '.')) : 0
}
function precoAtual(precos: Array<{ preco_venda: number; vigente_de: string }>): number {
  if (!precos || precos.length === 0) return 0
  const ord = [...precos].sort((a, b) => new Date(b.vigente_de).getTime() - new Date(a.vigente_de).getTime())
  return Number(ord[0].preco_venda) || 0
}

const CATEGORIAS_LABEL: Record<string, string> = {
  disjuntor: '🔌 Disjuntor',
  dps: '⚡ DPS',
  cabo: '🔗 Cabo',
  quadro: '🗄️ Quadro',
  conector: '🔩 Conector',
  monitoramento: '📊 Monitoramento',
  smart_meter: '📟 Medidor smart',
}

export function EstacaoRecargaFluxoClient({
  projetoId, wallboxes, itensCatalogoCA, selecaoSalva, margemPadraoPct,
  comissaoPadraoPct, impostosPadraoPct,
  valorDiariaAlvenaria, valorDiariaEletrica,
}: Props) {
  const [wallboxId, setWallboxId] = useState<string>(selecaoSalva?.wallbox?.id || '')
  const [precoManualWallbox, setPrecoManualWallbox] = useState<number>(
    selecaoSalva?.wallbox?.preco_unitario || 0,
  )
  const [qtd, setQtd] = useState<number>(selecaoSalva?.qtd || 1)
  const [margemPct, setMargemPct] = useState<number>(selecaoSalva?.margem_pct ?? margemPadraoPct)
  const [comissaoPct, setComissaoPct] = useState<number>((selecaoSalva as any)?.comissao_pct ?? comissaoPadraoPct)
  const [impostosPct, setImpostosPct] = useState<number>((selecaoSalva as any)?.impostos_pct ?? impostosPadraoPct)
  const [linhasCA, setLinhasCA] = useState<LinhaCA[]>(selecaoSalva?.itens_ca || [])
  const [fasesManual, setFasesManual] = useState<FasesRede | null>(null)
  const [distanciaM, setDistanciaM] = useState<number>(10)
  const [maoObra, setMaoObra] = useState<MaoObraEstado>(selecaoSalva?.mao_obra || {
    alvenaria_qtd_profissionais: 0,
    alvenaria_dias: 0,
    alvenaria_valor_diaria: valorDiariaAlvenaria,
    eletrica_qtd_profissionais: 1,
    eletrica_dias: 1,
    eletrica_valor_diaria: valorDiariaEletrica,
  })
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
  const [buscaTexto, setBuscaTexto] = useState<string>('')
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const wallboxEscolhido = wallboxes.find(w => w.id === wallboxId) || null

  // Fases finais — usa manual se selecionado, senão deduz pela potência
  const fasesEfetivas: FasesRede = fasesManual
    ?? (wallboxEscolhido ? deduzirFasesPorPotencia(extrairPotenciaKw(wallboxEscolhido)) : 'monofasico')

  // Gera lista CA sugerida automaticamente
  function gerarSugestao(): LinhaCA[] {
    if (!wallboxEscolhido) return []
    const pot = extrairPotenciaKw(wallboxEscolhido)
    if (!pot) return []
    return sugerirListaCaVE({
      potencia_wallbox_kw: pot,
      qtd_wallboxes: qtd,
      fases: fasesEfetivas,
      distancia_qgbt_m: distanciaM,
    }).map(s => ({
      produto_id: s.codigo_weg,  // usa código como id sintético (não existe no catálogo)
      codigo_weg: s.codigo_weg,
      modelo: s.modelo,
      categoria: s.categoria,
      qtd: s.qtd,
      preco_unitario: s.preco_unitario,
    }))
  }

  function regenerarSugestao() {
    setLinhasCA(gerarSugestao())
  }

  // Ao escolher wallbox pela 1ª vez (ou sem lista salva), popula automaticamente
  const jaAutoPopulou = useRef<boolean>(!!selecaoSalva?.itens_ca?.length)
  useEffect(() => {
    if (!jaAutoPopulou.current && wallboxEscolhido && linhasCA.length === 0) {
      const sugerida = gerarSugestao()
      if (sugerida.length > 0) {
        setLinhasCA(sugerida)
        jaAutoPopulou.current = true
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallboxId])

  const catalogoFiltrado = useMemo(() => {
    let f = itensCatalogoCA
    if (filtroCategoria) f = f.filter(i => i.categoria === filtroCategoria)
    if (buscaTexto.trim()) {
      const q = buscaTexto.toLowerCase()
      f = f.filter(i => i.modelo.toLowerCase().includes(q) || i.codigo_weg.toLowerCase().includes(q))
    }
    return f.slice(0, 60)
  }, [itensCatalogoCA, filtroCategoria, buscaTexto])

  const categoriasDisponiveis = useMemo(() => {
    const set = new Set(itensCatalogoCA.map(i => i.categoria))
    return Array.from(set).sort()
  }, [itensCatalogoCA])

  const calc = useMemo(() => {
    if (!wallboxEscolhido) return {
      precoWb: 0, precoCA: 0, precoAlvenaria: 0, precoEletrica: 0,
      precoBruto: 0, precoFinal: 0, margemR$: 0, comissaoR$: 0, impostosR$: 0, precoUnitWb: 0,
    }
    const precoUnitCatalogo = precoAtual(wallboxEscolhido.precos_produtos)
    const precoUnitWb = precoUnitCatalogo > 0 ? precoUnitCatalogo : precoManualWallbox
    const precoWb = precoUnitWb * qtd
    const precoCA = linhasCA.reduce((s, l) => s + l.preco_unitario * l.qtd, 0)
    const precoAlvenaria = maoObra.alvenaria_qtd_profissionais * maoObra.alvenaria_dias * maoObra.alvenaria_valor_diaria
    const precoEletrica = maoObra.eletrica_qtd_profissionais * maoObra.eletrica_dias * maoObra.eletrica_valor_diaria
    const precoBruto = precoWb + precoCA + precoAlvenaria + precoEletrica
    // Método invertido: PV = custo / (1 - (margem + comissao + impostos)/100)
    // Aceita até somar 99% (protege divisão por zero)
    const percTotal = Math.min(99, margemPct + comissaoPct + impostosPct)
    const fator = 1 / (1 - percTotal / 100)
    const precoFinal = precoBruto * fator
    const acrescimoTotal = precoFinal - precoBruto
    // Distribui acrescimo em cada componente proporcionalmente
    const somaPerc = margemPct + comissaoPct + impostosPct
    const margemR$ = somaPerc > 0 ? acrescimoTotal * (margemPct / somaPerc) : 0
    const comissaoR$ = somaPerc > 0 ? acrescimoTotal * (comissaoPct / somaPerc) : 0
    const impostosR$ = somaPerc > 0 ? acrescimoTotal * (impostosPct / somaPerc) : 0
    return {
      precoWb, precoCA, precoAlvenaria, precoEletrica,
      precoBruto, precoFinal, margemR$, comissaoR$, impostosR$, precoUnitWb,
    }
  }, [wallboxEscolhido, qtd, linhasCA, margemPct, comissaoPct, impostosPct, precoManualWallbox, maoObra])

  function adicionarLinha(item: ItemCatalogo) {
    const existente = linhasCA.findIndex(l => l.produto_id === item.id)
    if (existente >= 0) {
      setLinhasCA(prev => prev.map((l, i) => i === existente ? { ...l, qtd: l.qtd + 1 } : l))
      return
    }
    setLinhasCA(prev => [...prev, {
      produto_id: item.id,
      codigo_weg: item.codigo_weg,
      modelo: item.modelo,
      categoria: item.categoria,
      qtd: 1,
      preco_unitario: precoAtual(item.precos_produtos),
    }])
  }

  function atualizarQtd(idx: number, novaQtd: number) {
    setLinhasCA(prev => prev.map((l, i) => i === idx ? { ...l, qtd: Math.max(1, novaQtd) } : l))
  }
  function atualizarPreco(idx: number, novoPreco: number) {
    setLinhasCA(prev => prev.map((l, i) => i === idx ? { ...l, preco_unitario: Math.max(0, novoPreco) } : l))
  }
  function removerLinha(idx: number) {
    setLinhasCA(prev => prev.filter((_, i) => i !== idx))
  }

  function salvar() {
    if (!wallboxEscolhido) { setErro('Selecione um wallbox'); return }
    setErro(null)
    const selecao: any = {
      wallbox: {
        id: wallboxEscolhido.id,
        codigo_weg: wallboxEscolhido.codigo_weg,
        modelo: wallboxEscolhido.modelo,
        potencia_kw: extrairPotenciaKw(wallboxEscolhido),
        preco_unitario: calc.precoUnitWb,  // catálogo OU manual
      },
      qtd,
      acessorios: linhasCA.map(l => ({
        id: l.produto_id, codigo_weg: l.codigo_weg, modelo: l.modelo,
        qtd: l.qtd, preco_unitario: l.preco_unitario,
      })),
      itens_ca: linhasCA,
      mao_obra: maoObra,
      preco_wallbox_total: calc.precoWb,
      preco_acessorios_total: calc.precoCA,
      preco_alvenaria_total: calc.precoAlvenaria,
      preco_eletrica_total: calc.precoEletrica,
      preco_bruto: calc.precoBruto,
      margem_pct: margemPct,
      comissao_pct: comissaoPct,
      impostos_pct: impostosPct,
      margem_r: calc.margemR$,
      comissao_r: calc.comissaoR$,
      impostos_r: calc.impostosR$,
      preco_final_cliente: calc.precoFinal,
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
          Importe a planilha WEG WEMOB pelo <strong>/admin/catalogo</strong> ou cadastre wallbox manual.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 space-y-8">
        {/* Bloco 1 — Escolha wallbox */}
        <div>
          <h2 className="text-lg font-bold text-white mb-1">1. Escolha o wallbox</h2>
          <p className="text-xs text-white/50 mb-3">
            Linha WEMOB WEG. Itens "sob consulta" na planilha vêm sem preço no catálogo —
            digite o preço direto no campo que aparece depois de escolher.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {wallboxes.map(w => {
              const preco = precoAtual(w.precos_produtos)
              const semPreco = preco <= 0
              const pot = extrairPotenciaKw(w)
              const escolhido = wallboxId === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWallboxId(w.id)}
                  className={`text-left p-4 rounded-lg border transition ${
                    escolhido ? 'bg-sol/15 border-sol/60'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        {escolhido && <span className="text-sol">✓</span>}
                        <span className="truncate">{w.modelo}</span>
                      </p>
                      <p className="text-[11px] text-white/50 mt-0.5">
                        {w.codigo_weg} {pot > 0 && `· ${fmtNum(pot, 1)} kW`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {semPreco ? (
                        <p className="text-[11px] font-bold text-white/50">sob consulta</p>
                      ) : (
                        <p className="text-sm font-bold text-sol">{fmtR$(preco)}</p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Input de preço manual — só aparece quando escolheu um wallbox
              e ele NÃO tem preço no catálogo (linha WEMOB "sob consulta") */}
          {wallboxEscolhido && precoAtual(wallboxEscolhido.precos_produtos) <= 0 && (
            <div className="mt-4 p-3 bg-sol/10 border border-sol/30 rounded-lg">
              <label className="block text-[10px] uppercase tracking-wider text-sol font-bold mb-1">
                💰 Preço unitário WEG deste wallbox (R$)
              </label>
              <p className="text-[10px] text-white/60 mb-2">
                Este modelo está como "sob consulta" na planilha WEG. Digite o preço que o
                fornecedor te passou pra este orçamento.
              </p>
              <input
                type="number"
                min={0}
                step={0.01}
                value={precoManualWallbox || ''}
                onChange={(e) => setPrecoManualWallbox(Math.max(0, Number(e.target.value) || 0))}
                placeholder="Ex: 3450.00"
                className="w-full px-3 py-2 bg-noite border border-sol/40 rounded text-sm text-white tabular-nums focus:outline-none focus:border-sol"
              />
              {precoManualWallbox > 0 && (
                <p className="text-[11px] text-verde mt-2">
                  ✓ Preço aplicado: <strong className="tabular-nums">{fmtR$(precoManualWallbox)}</strong> × {qtd} = {fmtR$(precoManualWallbox * qtd)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Bloco 2 — Lista CA editável (montada automaticamente pela potência) */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h2 className="text-lg font-bold text-white">2. Lista CA da estação</h2>
            <span className="text-[10px] text-white/40">{linhasCA.length} item(ns) · {fmtR$(calc.precoCA)}</span>
          </div>
          <p className="text-xs text-white/50 mb-3">
            Dimensionada automaticamente pela potência do wallbox (disjuntor, DPS, cabo, quadro, aterramento).
            Ainda dá pra editar tudo, remover e adicionar itens do catálogo.
          </p>

          {/* Parâmetros de dimensionamento — só aparece se tem wallbox escolhido */}
          {wallboxEscolhido && (
            <div className="mb-3 p-3 bg-white/[0.02] border border-white/10 rounded-lg space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Rede do cliente</label>
                  <select
                    value={fasesManual || 'auto'}
                    onChange={(e) => setFasesManual(e.target.value === 'auto' ? null : e.target.value as FasesRede)}
                    className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-xs text-white"
                  >
                    <option value="auto">Auto (pela potência) — {fasesEfetivas}</option>
                    <option value="monofasico">Monofásico 220V (F+N)</option>
                    <option value="bifasico">Bifásico 220V (2F+N)</option>
                    <option value="trifasico">Trifásico 380/220V (3F+N)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Distância até QGBT (m)</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={distanciaM}
                    onChange={(e) => setDistanciaM(Math.max(1, Number(e.target.value) || 10))}
                    className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-xs text-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={regenerarSugestao}
                    className="w-full px-3 py-1.5 bg-sol/20 border border-sol/40 text-sol text-xs font-bold rounded hover:bg-sol/30"
                    title="Sobrescreve a lista CA atual com nova sugestão baseada na potência"
                  >
                    🔄 Regenerar Lista CA
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-white/50 italic">
                Cálculo: {resumoDimensionamento({
                  potencia_wallbox_kw: extrairPotenciaKw(wallboxEscolhido),
                  qtd_wallboxes: qtd,
                  fases: fasesEfetivas,
                  distancia_qgbt_m: distanciaM,
                })}
              </p>
            </div>
          )}

          {/* Tabela de linhas */}
          {linhasCA.length > 0 ? (
            <div className="overflow-x-auto bg-white/[0.03] border border-white/10 rounded-lg mb-3">
              <table className="w-full text-xs">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Item</th>
                    <th className="text-left p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Cat.</th>
                    <th className="text-right p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Qtd</th>
                    <th className="text-right p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Preço un.</th>
                    <th className="text-right p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Subtotal</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhasCA.map((l, idx) => (
                    <tr key={idx} className="border-t border-white/5">
                      <td className="p-2 text-white">
                        <p className="font-bold">{l.modelo}</p>
                        <p className="text-[10px] text-white/40">{l.codigo_weg}</p>
                      </td>
                      <td className="p-2 text-white/60 text-[10px] uppercase">{l.categoria}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={1}
                          value={l.qtd}
                          onChange={(e) => atualizarQtd(idx, Number(e.target.value) || 1)}
                          className="w-16 px-2 py-1 bg-noite border border-white/15 rounded text-white text-right tabular-nums"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={l.preco_unitario}
                          onChange={(e) => atualizarPreco(idx, Number(e.target.value) || 0)}
                          className="w-24 px-2 py-1 bg-noite border border-white/15 rounded text-white text-right tabular-nums"
                        />
                      </td>
                      <td className="p-2 text-right font-bold text-white tabular-nums">
                        {fmtR$(l.qtd * l.preco_unitario)}
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => removerLinha(idx)} className="text-coral hover:text-coral/70 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-white/[0.02] border-t border-white/10">
                  <tr>
                    <td colSpan={4} className="p-2 text-right text-white/60 uppercase text-[10px] font-bold">Subtotal Lista CA</td>
                    <td className="p-2 text-right font-bold text-sol tabular-nums">{fmtR$(calc.precoCA)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-4 bg-white/[0.02] border border-dashed border-white/20 rounded-lg text-xs text-white/50 text-center mb-3">
              Nenhum item na lista CA ainda. Adicione do catálogo abaixo.
            </div>
          )}

          {/* Catálogo pra adicionar */}
          <details className="bg-white/[0.02] border border-white/10 rounded-lg">
            <summary className="cursor-pointer p-3 text-xs font-bold text-white/80 hover:text-white">
              + Adicionar itens do catálogo WEG ({itensCatalogoCA.length} disponíveis)
            </summary>
            <div className="p-3 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="🔍 Buscar por modelo ou código"
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  className="flex-1 min-w-[200px] px-3 py-2 bg-noite border border-white/15 rounded text-xs text-white"
                />
                <select
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="px-3 py-2 bg-noite border border-white/15 rounded text-xs text-white"
                >
                  <option value="">Todas categorias</option>
                  {categoriasDisponiveis.map(c => (
                    <option key={c} value={c}>{CATEGORIAS_LABEL[c] || c}</option>
                  ))}
                </select>
              </div>
              <div className="max-h-96 overflow-y-auto space-y-1">
                {catalogoFiltrado.map(item => {
                  const preco = precoAtual(item.precos_produtos)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => adicionarLinha(item)}
                      className="w-full text-left flex items-center justify-between gap-2 p-2 hover:bg-white/[0.03] rounded"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{item.modelo}</p>
                        <p className="text-[10px] text-white/40">
                          {CATEGORIAS_LABEL[item.categoria] || item.categoria} · {item.codigo_weg}
                        </p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${preco > 0 ? 'text-sol' : 'text-coral'}`}>
                        {preco > 0 ? fmtR$(preco) : '⚠ s/preço'}
                      </span>
                      <span className="text-sol text-lg shrink-0">+</span>
                    </button>
                  )
                })}
                {catalogoFiltrado.length === 0 && (
                  <p className="text-[11px] text-white/40 italic text-center py-4">Nenhum item bate com o filtro.</p>
                )}
              </div>
            </div>
          </details>
        </div>
      </section>

      {/* Coluna direita — precificação sticky */}
      <aside className="lg:col-span-1">
        <div className="sticky top-24 space-y-4 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <h2 className="text-lg font-bold text-white">3. Precificação SPIN</h2>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Qtd wallboxes</label>
            <input type="number" min={1} value={qtd}
              onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3 py-2 bg-noite/60 border border-white/15 rounded text-sm text-white" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-white/40 font-bold mb-1">Margem %</label>
              <input type="number" min={0} max={80} step={0.5} value={margemPct}
                onChange={(e) => setMargemPct(Math.max(0, Math.min(80, Number(e.target.value) || 0)))}
                className="w-full px-2 py-1.5 bg-noite/60 border border-white/15 rounded text-xs text-white text-right tabular-nums" />
              <p className="text-[9px] text-white/40 mt-0.5">Pad. {fmtNum(margemPadraoPct, 1)}</p>
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-white/40 font-bold mb-1">Comissão %</label>
              <input type="number" min={0} max={30} step={0.5} value={comissaoPct}
                onChange={(e) => setComissaoPct(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                className="w-full px-2 py-1.5 bg-noite/60 border border-white/15 rounded text-xs text-white text-right tabular-nums" />
              <p className="text-[9px] text-white/40 mt-0.5">Pad. {fmtNum(comissaoPadraoPct, 1)}</p>
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-white/40 font-bold mb-1">Impostos %</label>
              <input type="number" min={0} max={30} step={0.5} value={impostosPct}
                onChange={(e) => setImpostosPct(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                className="w-full px-2 py-1.5 bg-noite/60 border border-white/15 rounded text-xs text-white text-right tabular-nums" />
              <p className="text-[9px] text-white/40 mt-0.5">Pad. {fmtNum(impostosPadraoPct, 1)}</p>
            </div>
          </div>

          {/* 👷 Mão de obra auxiliar (alvenaria + elétrica predial) */}
          <div className="pt-3 border-t border-white/5 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
              👷 Mão de obra auxiliar
            </p>

            {/* Alvenaria */}
            <div className="p-2 bg-white/[0.02] border border-white/10 rounded space-y-2">
              <p className="text-[11px] font-bold text-white flex items-center justify-between">
                🧱 Alvenaria
                <span className="text-[10px] text-white/40 font-normal tabular-nums">{fmtR$(calc.precoAlvenaria)}</span>
              </p>
              <div className="grid grid-cols-3 gap-1">
                <MiniInput label="Prof." value={maoObra.alvenaria_qtd_profissionais}
                  onChange={(v) => setMaoObra(m => ({ ...m, alvenaria_qtd_profissionais: v }))} />
                <MiniInput label="Dias" value={maoObra.alvenaria_dias}
                  onChange={(v) => setMaoObra(m => ({ ...m, alvenaria_dias: v }))} />
                <MiniInput label="R$/dia" value={maoObra.alvenaria_valor_diaria} step={10}
                  onChange={(v) => setMaoObra(m => ({ ...m, alvenaria_valor_diaria: v }))} />
              </div>
            </div>

            {/* Elétrica predial */}
            <div className="p-2 bg-white/[0.02] border border-white/10 rounded space-y-2">
              <p className="text-[11px] font-bold text-white flex items-center justify-between">
                🏢⚡ Elétrica predial
                <span className="text-[10px] text-white/40 font-normal tabular-nums">{fmtR$(calc.precoEletrica)}</span>
              </p>
              <div className="grid grid-cols-3 gap-1">
                <MiniInput label="Prof." value={maoObra.eletrica_qtd_profissionais}
                  onChange={(v) => setMaoObra(m => ({ ...m, eletrica_qtd_profissionais: v }))} />
                <MiniInput label="Dias" value={maoObra.eletrica_dias}
                  onChange={(v) => setMaoObra(m => ({ ...m, eletrica_dias: v }))} />
                <MiniInput label="R$/dia" value={maoObra.eletrica_valor_diaria} step={10}
                  onChange={(v) => setMaoObra(m => ({ ...m, eletrica_valor_diaria: v }))} />
              </div>
            </div>
            <p className="text-[9px] text-white/40 italic">
              Diárias padrão vêm de parametros_fotovoltaico (admin edita globalmente).
            </p>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-2 text-xs">
            <Linha label={`Wallbox × ${qtd}`} valor={fmtR$(calc.precoWb)} />
            <Linha label={`Lista CA (${linhasCA.length})`} valor={fmtR$(calc.precoCA)} />
            <Linha label="🧱 Alvenaria" valor={fmtR$(calc.precoAlvenaria)} />
            <Linha label="🏢⚡ Elétrica predial" valor={fmtR$(calc.precoEletrica)} />
            <Linha label="Custo bruto" valor={fmtR$(calc.precoBruto)} destaque="white" />
            <Linha label={`Margem ${fmtNum(margemPct, 1)}%`} valor={fmtR$(calc.margemR$)} />
            <Linha label={`Comissão vendedor ${fmtNum(comissaoPct, 1)}%`} valor={fmtR$(calc.comissaoR$)} />
            <Linha label={`Impostos ${fmtNum(impostosPct, 1)}%`} valor={fmtR$(calc.impostosR$)} />
            <div className="pt-2 border-t border-white/10">
              <Linha label="TOTAL AO CLIENTE" valor={fmtR$(calc.precoFinal)} destaque="sol" grande />
            </div>
          </div>

          {erro && <div className="text-xs text-coral p-2 bg-coral/10 border border-coral/30 rounded">⚠ {erro}</div>}

          <button type="button" onClick={salvar}
            disabled={pending || !wallboxEscolhido || calc.precoFinal <= 0}
            className="w-full px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {pending ? '⏳ Salvando…' : '✓ Salvar estação'}
          </button>
        </div>
      </aside>
    </div>
  )
}

function MiniInput({ label, value, onChange, step = 1 }: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div>
      <label className="block text-[9px] uppercase tracking-wider text-white/40 font-bold mb-0.5">{label}</label>
      <input
        type="number"
        min={0}
        step={step}
        value={value || ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full px-1.5 py-1 bg-noite border border-white/15 rounded text-xs text-white text-right tabular-nums"
      />
    </div>
  )
}

function Linha({ label, valor, destaque, grande }: {
  label: string; valor: string; destaque?: 'white' | 'sol'; grande?: boolean
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
