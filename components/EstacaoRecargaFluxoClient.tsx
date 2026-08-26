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

type EquipamentoWeg = {
  produto_id: string
  codigo_weg: string
  modelo: string
  potencia_kw: number
  qtd: number
  preco_unitario: number
}

type MaoObraEstado = {
  alvenaria_qtd_profissionais: number
  alvenaria_dias: number
  alvenaria_valor_diaria: number
  eletrica_qtd_profissionais: number
  eletrica_dias: number
  eletrica_valor_diaria: number
}

type Props = {
  projetoId: string
  wallboxes: Wallbox[]
  itensCatalogoCA: ItemCatalogo[]
  selecaoSalva?: (VeRecargaSelecionada & {
    itens_ca?: LinhaCA[]
    mao_obra?: MaoObraEstado
    equipamentos?: EquipamentoWeg[]
  }) | null
  margemPadraoPct: number
  comissaoPadraoPct: number
  impostosPadraoPct: number
  valorDiariaAlvenaria: number
  valorDiariaEletrica: number
  valorKmRodado: number
  kmDaCidade: number       // distância SPIN → cidade do cliente (ida)
  cidadeCliente: string
  valorDiagramaUnifilar: number
  valorDiagramaTrifilar: number
}

function fmtR$(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtNum(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
function extrairPotenciaKw(w: { specs: any; modelo: string }): number {
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
  projetoId, wallboxes, itensCatalogoCA, selecaoSalva,
  margemPadraoPct, comissaoPadraoPct, impostosPadraoPct,
  valorDiariaAlvenaria, valorDiariaEletrica,
  valorKmRodado, kmDaCidade, cidadeCliente,
  valorDiagramaUnifilar, valorDiagramaTrifilar,
}: Props) {
  // ═══ Estado ═══
  const [equipamentos, setEquipamentos] = useState<EquipamentoWeg[]>(() => {
    const salvos = (selecaoSalva as any)?.equipamentos as EquipamentoWeg[] | undefined
    if (salvos && Array.isArray(salvos) && salvos.length > 0) return salvos
    if (selecaoSalva?.wallbox?.id) {
      return [{
        produto_id: selecaoSalva.wallbox.id,
        codigo_weg: selecaoSalva.wallbox.codigo_weg,
        modelo: selecaoSalva.wallbox.modelo,
        potencia_kw: selecaoSalva.wallbox.potencia_kw || 0,
        qtd: selecaoSalva.qtd || 1,
        preco_unitario: selecaoSalva.wallbox.preco_unitario || 0,
      }]
    }
    return []
  })
  const [margemPct, setMargemPct] = useState<number>(selecaoSalva?.margem_pct ?? margemPadraoPct)
  const [comissaoPct, setComissaoPct] = useState<number>((selecaoSalva as any)?.comissao_pct ?? comissaoPadraoPct)
  const [impostosPct, setImpostosPct] = useState<number>((selecaoSalva as any)?.impostos_pct ?? impostosPadraoPct)
  const [linhasCA, setLinhasCA] = useState<LinhaCA[]>(selecaoSalva?.itens_ca || [])
  const [fasesManual, setFasesManual] = useState<FasesRede | null>(null)
  const [distanciaM, setDistanciaM] = useState<number>(10)
  // Potência manual da estação — usada quando cadastro WEG não tem potência
  // ou quando kit tem só acessórios (totem sozinho).
  const [potManualKw, setPotManualKw] = useState<number>((selecaoSalva as any)?.potencia_manual_kw ?? 0)
  const [qtdManualWb, setQtdManualWb] = useState<number>((selecaoSalva as any)?.qtd_manual_wallboxes ?? 1)
  // Diagramas (unifilar + trifilar) — Kalebe: 'compõem a precificação e
  // aparecem na descrição dos serviços do PDF'
  const [prazoEntregaDias, setPrazoEntregaDias] = useState<number>((selecaoSalva as any)?.prazo_entrega_dias ?? 45)
  const [incluiUnifilar, setIncluiUnifilar] = useState<boolean>((selecaoSalva as any)?.inclui_diagrama_unifilar ?? true)
  const [incluiTrifilar, setIncluiTrifilar] = useState<boolean>((selecaoSalva as any)?.inclui_diagrama_trifilar ?? true)
  const [valorUnifilar, setValorUnifilar] = useState<number>((selecaoSalva as any)?.valor_diagrama_unifilar ?? valorDiagramaUnifilar)
  const [valorTrifilar, setValorTrifilar] = useState<number>((selecaoSalva as any)?.valor_diagrama_trifilar ?? valorDiagramaTrifilar)
  // Deslocamento — km da cidade × R$/km × 2 (ida+volta)
  const [kmManual, setKmManual] = useState<number>((selecaoSalva as any)?.deslocamento_km ?? kmDaCidade)
  const [rsPorKm, setRsPorKm] = useState<number>((selecaoSalva as any)?.deslocamento_rs_km ?? valorKmRodado)
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
  // Controle aberto/fechado dos <details> — antes usava open={length===0}
  // que forçava REACT a fechar após 1º item e travava o usuário.
  const [catalogoWegAberto, setCatalogoWegAberto] = useState<boolean>(true)
  const [catalogoCaAberto, setCatalogoCaAberto] = useState<boolean>(true)
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // ═══ Derivados ═══
  const equipamentoPrincipal = equipamentos.find(e => e.potencia_kw > 0) || null
  const qtdWallboxesReais = equipamentos.filter(e => e.potencia_kw > 0).reduce((s, e) => s + e.qtd, 0) || 1
  const temAlgumEquipamento = equipamentos.length > 0

  // Potência efetiva: cadastro WEG se tiver, senão manual
  const potenciaEfetivaKw = equipamentoPrincipal?.potencia_kw || potManualKw || 0
  const qtdWallboxesEfetiva = equipamentoPrincipal ? qtdWallboxesReais : Math.max(1, qtdManualWb)
  const podeDimensionar = potenciaEfetivaKw > 0

  const fasesEfetivas: FasesRede = fasesManual
    ?? (potenciaEfetivaKw > 0 ? deduzirFasesPorPotencia(potenciaEfetivaKw) : 'monofasico')

  function gerarSugestao(): LinhaCA[] {
    if (!podeDimensionar) return []
    return sugerirListaCaVE({
      potencia_wallbox_kw: potenciaEfetivaKw,
      qtd_wallboxes: qtdWallboxesEfetiva,
      fases: fasesEfetivas,
      distancia_qgbt_m: distanciaM,
    }).map(s => ({
      produto_id: s.codigo_weg,
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

  // Ao adicionar 1º equipamento COM potência, popula lista CA se vazia
  const jaAutoPopulou = useRef<boolean>(!!selecaoSalva?.itens_ca?.length)
  useEffect(() => {
    if (!jaAutoPopulou.current && equipamentoPrincipal && linhasCA.length === 0) {
      const sugerida = gerarSugestao()
      if (sugerida.length > 0) {
        setLinhasCA(sugerida)
        jaAutoPopulou.current = true
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentoPrincipal?.produto_id])

  // ═══ Handlers equipamentos ═══
  function adicionarEquipamento(w: Wallbox) {
    const existente = equipamentos.findIndex(e => e.produto_id === w.id)
    if (existente >= 0) {
      setEquipamentos(prev => prev.map((e, i) => i === existente ? { ...e, qtd: e.qtd + 1 } : e))
      return
    }
    setEquipamentos(prev => [...prev, {
      produto_id: w.id,
      codigo_weg: w.codigo_weg,
      modelo: w.modelo,
      potencia_kw: extrairPotenciaKw(w),
      qtd: 1,
      preco_unitario: precoAtual(w.precos_produtos),
    }])
  }
  function atualizarEquipQtd(idx: number, qtd: number) {
    setEquipamentos(prev => prev.map((e, i) => i === idx ? { ...e, qtd: Math.max(1, qtd) } : e))
  }
  function atualizarEquipPreco(idx: number, preco: number) {
    setEquipamentos(prev => prev.map((e, i) => i === idx ? { ...e, preco_unitario: Math.max(0, preco) } : e))
  }
  function removerEquipamento(idx: number) {
    setEquipamentos(prev => prev.filter((_, i) => i !== idx))
  }

  // ═══ Handlers Lista CA ═══
  function adicionarLinhaCA(item: ItemCatalogo) {
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
  function atualizarLinhaQtd(idx: number, qtd: number) {
    setLinhasCA(prev => prev.map((l, i) => i === idx ? { ...l, qtd: Math.max(1, qtd) } : l))
  }
  function atualizarLinhaPreco(idx: number, preco: number) {
    setLinhasCA(prev => prev.map((l, i) => i === idx ? { ...l, preco_unitario: Math.max(0, preco) } : l))
  }
  function removerLinhaCA(idx: number) {
    setLinhasCA(prev => prev.filter((_, i) => i !== idx))
  }

  // ═══ Cálculo ═══
  const calc = useMemo(() => {
    if (!temAlgumEquipamento) return {
      precoWb: 0, precoCA: 0, precoAlvenaria: 0, precoEletrica: 0, precoDeslocamento: 0,
      precoDiagramas: 0,
      precoBruto: 0, precoFinal: 0, margemR$: 0, comissaoR$: 0, impostosR$: 0,
      baseImpostavel: 0, kmTotal: 0,
    }
    const precoWb = equipamentos.reduce((s, e) => s + e.preco_unitario * e.qtd, 0)
    const precoCA = linhasCA.reduce((s, l) => s + l.preco_unitario * l.qtd, 0)
    const precoAlvenaria = maoObra.alvenaria_qtd_profissionais * maoObra.alvenaria_dias * maoObra.alvenaria_valor_diaria
    const precoEletrica = maoObra.eletrica_qtd_profissionais * maoObra.eletrica_dias * maoObra.eletrica_valor_diaria
    // Deslocamento: km × 2 (ida+volta) × R$/km — SEM multiplicar por qtd_visitas
    // (Kalebe pode aumentar km manualmente se precisar de N viagens)
    const kmTotal = Math.max(0, kmManual) * 2
    const precoDeslocamento = kmTotal * Math.max(0, rsPorKm)
    // Diagramas técnicos (unifilar + trifilar) — serviço documental
    const precoDiagramas =
      (incluiUnifilar ? Math.max(0, valorUnifilar) : 0) +
      (incluiTrifilar ? Math.max(0, valorTrifilar) : 0)
    const precoBruto = precoWb + precoCA + precoAlvenaria + precoEletrica + precoDeslocamento + precoDiagramas

    // Regra SPIN: equipamento WEG NÃO paga imposto (revenda direta).
    // Deslocamento + diagramas entram na base impostável (são serviço, não revenda).
    const baseImpostavel = precoCA + precoAlvenaria + precoEletrica + precoDeslocamento + precoDiagramas
    const percSemImposto = Math.min(99, margemPct + comissaoPct)
    const percComImposto = Math.min(99, margemPct + comissaoPct + impostosPct)
    const pvWallbox = precoWb / (1 - percSemImposto / 100)
    const pvResto = baseImpostavel / (1 - percComImposto / 100)
    const precoFinal = pvWallbox + pvResto

    const acresWb = pvWallbox - precoWb
    const acresResto = pvResto - baseImpostavel
    const margemR$ =
      (percSemImposto > 0 ? acresWb * (margemPct / percSemImposto) : 0) +
      (percComImposto > 0 ? acresResto * (margemPct / percComImposto) : 0)
    const comissaoR$ =
      (percSemImposto > 0 ? acresWb * (comissaoPct / percSemImposto) : 0) +
      (percComImposto > 0 ? acresResto * (comissaoPct / percComImposto) : 0)
    const impostosR$ = percComImposto > 0 ? acresResto * (impostosPct / percComImposto) : 0

    return {
      precoWb, precoCA, precoAlvenaria, precoEletrica, precoDeslocamento, precoDiagramas,
      precoBruto, precoFinal, margemR$, comissaoR$, impostosR$,
      baseImpostavel, kmTotal,
    }
  }, [temAlgumEquipamento, equipamentos, linhasCA, margemPct, comissaoPct, impostosPct, maoObra, kmManual, rsPorKm, incluiUnifilar, incluiTrifilar, valorUnifilar, valorTrifilar])

  // ═══ Catálogo Lista CA ═══
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

  function salvar() {
    if (!temAlgumEquipamento) { setErro('Adicione pelo menos 1 equipamento ao kit'); return }
    const equipComPrecoZero = equipamentos.filter(e => e.preco_unitario <= 0)
    if (equipComPrecoZero.length > 0) {
      setErro(`Falta preencher o preço de: ${equipComPrecoZero.map(e => e.modelo).join(', ')}`)
      return
    }
    setErro(null)
    const principal = equipamentoPrincipal || equipamentos[0]
    const selecao: any = {
      // Compat com estrutura antiga
      wallbox: {
        id: principal.produto_id,
        codigo_weg: principal.codigo_weg,
        modelo: principal.modelo,
        potencia_kw: principal.potencia_kw,
        preco_unitario: principal.preco_unitario,
      },
      qtd: principal.qtd,
      // Nova estrutura multi-equipamento
      equipamentos,
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
      preco_deslocamento_total: calc.precoDeslocamento,
      deslocamento_km: kmManual,
      deslocamento_rs_km: rsPorKm,
      potencia_manual_kw: potManualKw,
      qtd_manual_wallboxes: qtdManualWb,
      potencia_efetiva_kw: potenciaEfetivaKw,
      prazo_entrega_dias: prazoEntregaDias,
      inclui_diagrama_unifilar: incluiUnifilar,
      inclui_diagrama_trifilar: incluiTrifilar,
      valor_diagrama_unifilar: valorUnifilar,
      valor_diagrama_trifilar: valorTrifilar,
      preco_diagramas_total: calc.precoDiagramas,
      deslocamento_km_total: calc.kmTotal,
      cidade_cliente: cidadeCliente,
      preco_bruto: calc.precoBruto,
      base_impostavel: calc.baseImpostavel,
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
        <h2 className="text-lg font-bold text-coral mb-2">⚠ Nenhum item WEMOB no catálogo</h2>
        <p className="text-sm text-white/70">
          Importe a planilha WEG WEMOB pelo <strong>/admin/catalogo</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 space-y-8">
        {/* Bloco 1 — Equipamentos WEG (múltiplos: wallbox + totem + suportes) */}
        <div>
          <h2 className="text-lg font-bold text-white mb-1">1. Kit WEG da estação</h2>
          <p className="text-xs text-white/50 mb-3">
            Adicione TODOS os equipamentos WEG do kit: wallbox, totem, suportes.
            Cada linha edita qtd e preço. Itens "sob consulta" → digite o preço direto na linha.
          </p>

          {/* Tabela dos equipamentos escolhidos */}
          {equipamentos.length > 0 && (
            <div className="overflow-x-auto bg-white/[0.03] border border-white/10 rounded-lg mb-3">
              <table className="w-full text-xs">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Equipamento</th>
                    <th className="text-right p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Qtd</th>
                    <th className="text-right p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Preço un.</th>
                    <th className="text-right p-2 font-bold text-white/60 uppercase tracking-wider text-[10px]">Subtotal</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {equipamentos.map((e, idx) => (
                    <tr key={idx} className="border-t border-white/5">
                      <td className="p-2 text-white">
                        <p className="font-bold flex items-center gap-2">
                          {e.potencia_kw > 0 ? '⚡' : '📦'} {e.modelo}
                        </p>
                        <p className="text-[10px] text-white/40">
                          {e.codigo_weg} {e.potencia_kw > 0 && `· ${fmtNum(e.potencia_kw, 1)} kW`}
                        </p>
                      </td>
                      <td className="p-2 text-right">
                        <input type="number" min={1} value={e.qtd}
                          onChange={(ev) => atualizarEquipQtd(idx, Number(ev.target.value) || 1)}
                          className="w-16 px-2 py-1 bg-noite border border-white/15 rounded text-white text-right tabular-nums" />
                      </td>
                      <td className="p-2 text-right">
                        <input type="number" min={0} step={0.01} value={e.preco_unitario}
                          onChange={(ev) => atualizarEquipPreco(idx, Number(ev.target.value) || 0)}
                          placeholder="sob consulta"
                          className={`w-28 px-2 py-1 bg-noite border rounded text-white text-right tabular-nums ${
                            e.preco_unitario > 0 ? 'border-white/15' : 'border-coral/50'
                          }`} />
                      </td>
                      <td className="p-2 text-right font-bold text-white tabular-nums">
                        {fmtR$(e.qtd * e.preco_unitario)}
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => removerEquipamento(idx)} className="text-coral hover:text-coral/70 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-white/[0.02] border-t border-white/10">
                  <tr>
                    <td colSpan={3} className="p-2 text-right text-white/60 uppercase text-[10px] font-bold">Subtotal Equipamentos WEG</td>
                    <td className="p-2 text-right font-bold text-sol tabular-nums">{fmtR$(calc.precoWb)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Catálogo linha WEMOB pra adicionar */}
          <details
            className="bg-white/[0.02] border border-white/10 rounded-lg"
            open={catalogoWegAberto}
            onToggle={(e) => setCatalogoWegAberto((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer p-3 text-xs font-bold text-white/80 hover:text-white">
              + Adicionar equipamento WEG ao kit ({wallboxes.length} disponíveis)
            </summary>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {wallboxes.map(w => {
                const preco = precoAtual(w.precos_produtos)
                const pot = extrairPotenciaKw(w)
                const jaNoKit = equipamentos.some(e => e.produto_id === w.id)
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => adicionarEquipamento(w)}
                    className={`text-left p-3 rounded-lg border transition ${
                      jaNoKit ? 'bg-verde/10 border-verde/30' : 'bg-white/[0.02] border-white/10 hover:border-sol/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white flex items-center gap-2">
                          {pot > 0 ? '⚡' : '📦'} <span className="truncate">{w.modelo}</span>
                        </p>
                        <p className="text-[10px] text-white/50">
                          {w.codigo_weg} {pot > 0 && `· ${fmtNum(pot, 1)} kW`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[10px] font-bold ${preco > 0 ? 'text-sol' : 'text-white/40'}`}>
                          {preco > 0 ? fmtR$(preco) : 'sob consulta'}
                        </p>
                        <p className="text-lg text-sol leading-none">{jaNoKit ? '✓' : '+'}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </details>
        </div>

        {/* Bloco 2 — Lista CA editável */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h2 className="text-lg font-bold text-white">2. Lista CA da estação</h2>
            <span className="text-[10px] text-white/40">{linhasCA.length} item(ns) · {fmtR$(calc.precoCA)}</span>
          </div>
          <p className="text-xs text-white/50 mb-3">
            Dimensionada automaticamente pela potência do wallbox principal (disjuntor, DPS, cabo, quadro, aterramento).
            Editável — remova, adicione ou ajuste qtd/preço de cada item.
          </p>

          <div className="mb-3 p-3 bg-white/[0.02] border border-white/10 rounded-lg space-y-2">
            {equipamentoPrincipal ? (
              <p className="text-[10px] text-verde/80 flex items-center gap-1">
                ✓ Potência puxada do cadastro: <strong>{fmtNum(equipamentoPrincipal.potencia_kw, 1)} kW</strong> × {qtdWallboxesReais}
              </p>
            ) : (
              <p className="text-[10px] text-white/50">
                ℹ Nenhum equipamento com potência cadastrada. Digite manualmente pra gerar a Lista CA.
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">
                  Potência (kW) {equipamentoPrincipal && <span className="text-white/30 normal-case">— auto</span>}
                </label>
                <input type="number" min={0} step={0.1}
                  value={equipamentoPrincipal ? equipamentoPrincipal.potencia_kw : potManualKw}
                  onChange={(e) => setPotManualKw(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!!equipamentoPrincipal}
                  placeholder="ex: 7.4"
                  className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-xs text-white disabled:opacity-60" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Qtd wallbox</label>
                <input type="number" min={1}
                  value={equipamentoPrincipal ? qtdWallboxesReais : qtdManualWb}
                  onChange={(e) => setQtdManualWb(Math.max(1, Number(e.target.value) || 1))}
                  disabled={!!equipamentoPrincipal}
                  className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-xs text-white disabled:opacity-60" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Rede</label>
                <select
                  value={fasesManual || 'auto'}
                  onChange={(e) => setFasesManual(e.target.value === 'auto' ? null : e.target.value as FasesRede)}
                  className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-xs text-white"
                >
                  <option value="auto">Auto — {fasesEfetivas}</option>
                  <option value="monofasico">Mono 220V</option>
                  <option value="bifasico">Bi 220V</option>
                  <option value="trifasico">Tri 380V</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">Dist. QGBT (m)</label>
                <input type="number" min={1} max={200} value={distanciaM}
                  onChange={(e) => setDistanciaM(Math.max(1, Number(e.target.value) || 10))}
                  className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-xs text-white" />
              </div>
            </div>
            <button type="button" onClick={regenerarSugestao} disabled={!podeDimensionar}
              className="w-full px-3 py-2 bg-sol/20 border border-sol/40 text-sol text-xs font-bold rounded hover:bg-sol/30 disabled:opacity-40 disabled:cursor-not-allowed">
              {podeDimensionar
                ? `🔄 ${linhasCA.length > 0 ? 'Regenerar' : 'Gerar'} Lista CA (${fmtNum(potenciaEfetivaKw, 1)}kW × ${qtdWallboxesEfetiva})`
                : '⚠ Digite a potência acima pra gerar a lista'}
            </button>
            {podeDimensionar && (
              <p className="text-[10px] text-white/40 italic">
                {resumoDimensionamento({
                  potencia_wallbox_kw: potenciaEfetivaKw,
                  qtd_wallboxes: qtdWallboxesEfetiva,
                  fases: fasesEfetivas,
                  distancia_qgbt_m: distanciaM,
                })}
              </p>
            )}
          </div>

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
                        <input type="number" min={1} value={l.qtd}
                          onChange={(e) => atualizarLinhaQtd(idx, Number(e.target.value) || 1)}
                          className="w-16 px-2 py-1 bg-noite border border-white/15 rounded text-white text-right tabular-nums" />
                      </td>
                      <td className="p-2 text-right">
                        <input type="number" min={0} step={0.01} value={l.preco_unitario}
                          onChange={(e) => atualizarLinhaPreco(idx, Number(e.target.value) || 0)}
                          className="w-24 px-2 py-1 bg-noite border border-white/15 rounded text-white text-right tabular-nums" />
                      </td>
                      <td className="p-2 text-right font-bold text-white tabular-nums">
                        {fmtR$(l.qtd * l.preco_unitario)}
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => removerLinhaCA(idx)} className="text-coral hover:text-coral/70 text-sm">✕</button>
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
              {podeDimensionar
                ? 'Nenhum item na Lista CA. Clique em Gerar acima ou adicione do catálogo abaixo.'
                : 'Digite a potência da estação (kW) acima pra gerar a Lista CA.'}
            </div>
          )}

          <details
            className="bg-white/[0.02] border border-white/10 rounded-lg"
            open={catalogoCaAberto}
            onToggle={(e) => setCatalogoCaAberto((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer p-3 text-xs font-bold text-white/80 hover:text-white">
              + Adicionar itens do catálogo WEG ({itensCatalogoCA.length} disponíveis)
            </summary>
            <div className="p-3 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <input type="text" placeholder="🔍 Buscar por modelo ou código" value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  className="flex-1 min-w-[200px] px-3 py-2 bg-noite border border-white/15 rounded text-xs text-white" />
                <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="px-3 py-2 bg-noite border border-white/15 rounded text-xs text-white">
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
                    <button key={item.id} type="button" onClick={() => adicionarLinhaCA(item)}
                      className="w-full text-left flex items-center justify-between gap-2 p-2 hover:bg-white/[0.03] rounded">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{item.modelo}</p>
                        <p className="text-[10px] text-white/40">
                          {CATEGORIAS_LABEL[item.categoria] || item.categoria} · {item.codigo_weg}
                        </p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${preco > 0 ? 'text-sol' : 'text-white/40'}`}>
                        {preco > 0 ? fmtR$(preco) : 'sem preço'}
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

          {/* Prazo de entrega WEG */}
          <div className="pt-3 border-t border-white/5 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">📦 Prazo de entrega WEG</p>
            <div className="p-2 bg-white/[0.02] border border-white/10 rounded flex items-center gap-2">
              <input type="number" min={1} max={365} value={prazoEntregaDias}
                onChange={(e) => setPrazoEntregaDias(Math.max(1, Number(e.target.value) || 45))}
                className="w-20 px-2 py-1 bg-noite border border-white/15 rounded text-xs text-white text-right tabular-nums" />
              <span className="text-[11px] text-white/70">dias úteis (fabricante)</span>
            </div>
            <p className="text-[9px] text-white/40 italic">
              Aparece na proposta PDF pra alinhar expectativa com o cliente.
            </p>
          </div>

          {/* Diagramas técnicos — compõem o serviço */}
          <div className="pt-3 border-t border-white/5 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">📐 Documentos técnicos</p>
            <div className="p-2 bg-white/[0.02] border border-white/10 rounded space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="chk_uni" checked={incluiUnifilar}
                  onChange={(e) => setIncluiUnifilar(e.target.checked)}
                  className="w-3.5 h-3.5 accent-sol" />
                <label htmlFor="chk_uni" className="text-[11px] font-bold text-white flex-1 cursor-pointer">Diagrama Unifilar</label>
                <input type="number" min={0} step={10} value={valorUnifilar}
                  onChange={(e) => setValorUnifilar(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!incluiUnifilar}
                  className="w-20 px-2 py-1 bg-noite border border-white/15 rounded text-[11px] text-white text-right tabular-nums disabled:opacity-40" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="chk_tri" checked={incluiTrifilar}
                  onChange={(e) => setIncluiTrifilar(e.target.checked)}
                  className="w-3.5 h-3.5 accent-sol" />
                <label htmlFor="chk_tri" className="text-[11px] font-bold text-white flex-1 cursor-pointer">Diagrama Trifilar</label>
                <input type="number" min={0} step={10} value={valorTrifilar}
                  onChange={(e) => setValorTrifilar(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!incluiTrifilar}
                  className="w-20 px-2 py-1 bg-noite border border-white/15 rounded text-[11px] text-white text-right tabular-nums disabled:opacity-40" />
              </div>
              <p className="text-[9px] text-white/40 italic">
                Constam na descrição de serviços do PDF da proposta.
              </p>
            </div>
          </div>

          {/* Deslocamento — km rodados × R$/km × 2 (ida+volta) */}
          <div className="pt-3 border-t border-white/5 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">🚗 Deslocamento</p>
            <div className="p-2 bg-white/[0.02] border border-white/10 rounded space-y-2">
              <p className="text-[11px] font-bold text-white flex items-center justify-between">
                {cidadeCliente ? `📍 ${cidadeCliente}` : '⚠ Endereço não cadastrado'}
                <span className="text-[10px] text-white/40 font-normal tabular-nums">{fmtR$(calc.precoDeslocamento)}</span>
              </p>
              {cidadeCliente && kmDaCidade === 0 && (
                <p className="text-[10px] text-coral">
                  ⚠ Cidade não cadastrada em <a href="/admin/precificacao/cidades" target="_blank" className="underline">/admin/precificacao/cidades</a>.
                  Digite os km manualmente.
                </p>
              )}
              <div className="grid grid-cols-3 gap-1">
                <MiniInput label="Km" value={kmManual} step={1} onChange={setKmManual} />
                <MiniInput label="R$/km" value={rsPorKm} step={0.1} onChange={setRsPorKm} />
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-white/40 font-bold mb-0.5">Total</label>
                  <div className="w-full px-1.5 py-1 bg-noite/40 border border-white/10 rounded text-xs text-white/60 text-right tabular-nums">
                    {fmtNum(calc.kmTotal, 0)} km
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-white/40 italic">
                Km × 2 (ida+volta) × R$/km. {kmDaCidade > 0
                  ? `Auto: ${fmtNum(kmDaCidade, 0)} km (SPIN → ${cidadeCliente}).`
                  : 'Cadastre a cidade em /admin/precificacao/cidades pra puxar automático.'}
              </p>
            </div>
          </div>

          {/* Mão de obra */}
          <div className="pt-3 border-t border-white/5 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">👷 Mão de obra auxiliar</p>
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
          </div>

          <div className="pt-3 border-t border-white/5 space-y-2 text-xs">
            <Linha label={`Equipamentos WEG (${equipamentos.length})`} valor={fmtR$(calc.precoWb)} />
            <Linha label={`Lista CA (${linhasCA.length})`} valor={fmtR$(calc.precoCA)} />
            <Linha label="🧱 Alvenaria" valor={fmtR$(calc.precoAlvenaria)} />
            <Linha label="🏢⚡ Elétrica predial" valor={fmtR$(calc.precoEletrica)} />
            <Linha label={`🚗 Deslocamento (${fmtNum(calc.kmTotal, 0)}km × ${fmtR$(rsPorKm)})`} valor={fmtR$(calc.precoDeslocamento)} />
            <Linha label={`📐 Diagramas${incluiUnifilar && incluiTrifilar ? ' (uni+tri)' : incluiUnifilar ? ' (uni)' : incluiTrifilar ? ' (tri)' : ' (nenhum)'}`} valor={fmtR$(calc.precoDiagramas)} />
            <Linha label="Custo bruto" valor={fmtR$(calc.precoBruto)} destaque="white" />
            <Linha label={`Margem ${fmtNum(margemPct, 1)}%`} valor={fmtR$(calc.margemR$)} />
            <Linha label={`Comissão vendedor ${fmtNum(comissaoPct, 1)}%`} valor={fmtR$(calc.comissaoR$)} />
            <Linha label={`Impostos ${fmtNum(impostosPct, 1)}% (sem WEG)`} valor={fmtR$(calc.impostosR$)} />
            <p className="text-[9px] text-white/40 italic pt-1">
              💡 Impostos incidem só sobre Lista CA + mão de obra ({fmtR$(calc.baseImpostavel)}).
              Equipamentos WEG (revenda) não pagam Simples.
            </p>
            <div className="pt-2 border-t border-white/10">
              <Linha label="TOTAL AO CLIENTE" valor={fmtR$(calc.precoFinal)} destaque="sol" grande />
            </div>
          </div>

          {erro && <div className="text-xs text-coral p-2 bg-coral/10 border border-coral/30 rounded">⚠ {erro}</div>}

          <button type="button" onClick={salvar}
            disabled={pending || !temAlgumEquipamento || calc.precoFinal <= 0}
            className="w-full px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {pending ? '⏳ Salvando…' : '✓ Salvar estação'}
          </button>

          {selecaoSalva && (
            <a
              href={`/projetos/${projetoId}/ve/proposta`}
              className="block w-full text-center px-6 py-3 bg-white/5 border border-white/15 text-white font-bold text-sm rounded-lg hover:bg-white/10">
              📄 Ver proposta PDF
            </a>
          )}
        </div>
      </aside>
    </div>
  )
}

function MiniInput({ label, value, onChange, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number
}) {
  return (
    <div>
      <label className="block text-[9px] uppercase tracking-wider text-white/40 font-bold mb-0.5">{label}</label>
      <input type="number" min={0} step={step} value={value || ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full px-1.5 py-1 bg-noite border border-white/15 rounded text-xs text-white text-right tabular-nums" />
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
