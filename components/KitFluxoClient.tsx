'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarKitAction } from '@/app/projetos/[id]/kit/actions'
import { sugerirKits, type KitSugerido, type DiagnosticoGerador } from '@/lib/kit-auto/sugerir-kits'
import { fmtNum } from '@/lib/formatters'

type ProdutoRow = {
  id: string
  codigo_weg: string
  modelo: string
  fabricante: string | null
  subcategoria?: string
  descricao_curta: string
  specs: any
  disponivel_estoque: boolean
  url_datasheet: string | null
  precos_produtos: Array<{ preco_venda: number; vigente_de: string; vigente_ate?: string | null }>
}

type Props = {
  projetoId: string
  placas: ProdutoRow[]
  inversores: ProdutoRow[]
  padrao: any
  potCcAlvoAuto: number
  consumoMedio: number
  kitSalvo: any | null
  /** Kit por UC — quando presente, o kit vai pra kits_por_uc[ucRef]
   *  em vez do kit_selecionado global. */
  ucRef?: string
  ucLabel?: string
  enderecoProprio?: boolean
  padraoEntradaProprio?: any
  telhadoSecoesProprio?: any[]
}

/**
 * Kalebe 2026-09-01: fallback em cascata pra nunca devolver 0 quando
 * existe QUALQUER preço cadastrado. Ordem de preferência:
 *   1. Vigente aberto (vigente_ate = null) mais recente
 *   2. Vigente com data futura mais recente
 *   3. Vencido — o mais recente (ex-preço, é o último que a Spin praticou)
 * Assim data-colisão SCD (edição 2x no mesmo dia gerando duplicata
 * com vigente_ate=hoje + vigente_de=hoje) resolve determinística.
 */
function precoDe(p: ProdutoRow): number {
  const ps = (p.precos_produtos || []).filter((x) => x && x.preco_venda > 0)
  if (!ps.length) return 0
  const hoje = new Date().toISOString().slice(0, 10)
  const abertos = ps.filter((x) => !x.vigente_ate)
  const futuros = ps.filter((x) => x.vigente_ate && x.vigente_ate >= hoje)
  const vencidos = ps.filter((x) => x.vigente_ate && x.vigente_ate < hoje)
  const pick = (arr: typeof ps) =>
    arr.slice().sort((a, b) => (a.vigente_de < b.vigente_de ? 1 : -1))[0]
  return (pick(abertos) || pick(futuros) || pick(vencidos))?.preco_venda || 0
}

type CategoriaSistema = 'ongrid' | 'hibrido_bess' | 'offgrid'

const CATEGORIAS: Array<{
  id: CategoriaSistema
  emoji: string
  titulo: string
  desc: string
  disponivel: boolean
}> = [
  {
    id: 'ongrid',
    emoji: '☀️',
    titulo: 'On-grid (conectado à rede)',
    desc: 'Sistema convencional conectado à CELESC. Compensa consumo pela injeção de energia. Sem baterias.',
    disponivel: true,
  },
  {
    id: 'hibrido_bess',
    emoji: '🔋',
    titulo: 'Híbrido com armazenamento (BESS)',
    desc: 'Conectado à rede + banco de baterias. Mantém energia crítica durante queda de luz. Requer SIW400H + SBW.',
    disponivel: false, // MVP: só ongrid por enquanto
  },
  {
    id: 'offgrid',
    emoji: '🏝️',
    titulo: 'Off-grid (isolado)',
    desc: 'Sem conexão com CELESC. 100% baterias. Ideal pra local sem rede elétrica.',
    disponivel: false, // futuro
  },
]

export function KitFluxoClient({
  projetoId,
  placas,
  inversores,
  padrao,
  potCcAlvoAuto,
  consumoMedio,
  kitSalvo,
  tipoTelhado,
  ucRef,
  ucLabel,
  enderecoProprio,
  padraoEntradaProprio,
  telhadoSecoesProprio,
}: Props & { tipoTelhado?: string }) {
  // Opts passadas ao salvarKitAction quando é kit-por-UC
  const opts = ucRef ? {
    uc_ref: ucRef,
    endereco_label: ucLabel,
    endereco_proprio: !!enderecoProprio,
    padrao_entrada_proprio: padraoEntradaProprio,
    telhado_secoes_proprio: telhadoSecoesProprio,
  } : undefined
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)

  const [categoria, setCategoria] = useState<CategoriaSistema | null>(
    (kitSalvo?.tipo_projeto as CategoriaSistema) || null
  )
  const [potCcAlvo, setPotCcAlvo] = useState<number>(Math.round(potCcAlvoAuto * 100) / 100)
  const [placaId, setPlacaId] = useState<string | null>(kitSalvo?.placa?.id || null)
  const [kitEscolhidoId, setKitEscolhidoId] = useState<string | null>(null)
  const [mostrarIndisponiveis, setMostrarIndisponiveis] = useState(false)

  // Modo manual: você escolhe placa + qtd + inversor + qtd, ignora
  // sugestões e validações bloqueantes. Warnings continuam informativos.
  // Escolha da placa no manual é independente da etapa 2 acima —
  // permite trocar sem sair do modo.
  const [modoManual, setModoManual] = useState<boolean>(false)
  // Modo ampliação = cliente já tem inversor; Spin cota só placas + estrutura
  // + cabo. Não aplica fator WEG 0,4182 (não é kit revenda).
  const [modoAmpliacao, setModoAmpliacao] = useState<boolean>(false)
  const [manualPlacaId, setManualPlacaId] = useState<string | null>(null)
  const [manualQtdPlacas, setManualQtdPlacas] = useState<number>(0)
  // Legado (mantido pro botão "adicionar" reaproveitar o dropdown)
  const [manualInversorId, setManualInversorId] = useState<string | null>(null)
  const [manualQtdInv, setManualQtdInv] = useState<number>(1)
  // NOVO: lista de invesores no kit manual (permite combos micro+string, potências diferentes)
  // Cada linha carrega qtd + fases (mono/bi/tri) — Kalebe 2026-08-27
  type FaseInv = 'monofasico' | 'bifasico' | 'trifasico'
  const [manualInversores, setManualInversores] = useState<Array<{ id: string; qtd: number; fases: FaseInv }>>([])

  // Filtro tipo de inversor pra kits sugeridos
  const [filtroTipoInversor, setFiltroTipoInversor] = useState<'todos' | 'micro' | 'string'>('todos')

  const placasVisiveis = mostrarIndisponiveis ? placas : placas.filter(p => p.disponivel_estoque)
  const placaEscolhida = placas.find(p => p.id === placaId)

  const { kitsSugeridos, diagnostico } = useMemo<{
    kitsSugeridos: KitSugerido[]
    diagnostico: DiagnosticoGerador | null
  }>(() => {
    if (!placaEscolhida) return { kitsSugeridos: [], diagnostico: null }
    const r = sugerirKits({
      placa: {
        id: placaEscolhida.id,
        codigo_weg: placaEscolhida.codigo_weg,
        modelo: placaEscolhida.modelo,
        fabricante: placaEscolhida.fabricante,
        potencia_wp: placaEscolhida.specs?.potencia_wp || 0,
        preco_venda: precoDe(placaEscolhida),
      },
      padrao: {
        tipo_ligacao: padrao.tipo_ligacao,
        amperagem_disjuntor_geral_a: padrao.amperagem_disjuntor_geral_a,
        tensao_fornecimento: padrao.tensao_fornecimento,
      },
      tipoTelhado,
      potCcAlvoKwp: potCcAlvo,
      inversores: inversores.map(i => ({
        id: i.id,
        codigo_weg: i.codigo_weg,
        modelo: i.modelo,
        subcategoria: i.subcategoria || 'inversor_string',
        potencia_kw: i.specs?.potencia_kw || 0,
        tensao_desc: i.specs?.tensao_desc || '',
        disjuntor_equivalente: i.specs?.disjuntor_equivalente || null,
        entradas_mppt: i.specs?.entradas_mppt || null,
        preco_venda: precoDe(i),
        disponivel_estoque: i.disponivel_estoque,
        url_datasheet: i.url_datasheet,
      })),
    })
    return { kitsSugeridos: r.kits, diagnostico: r.diagnostico }
  }, [placaEscolhida, potCcAlvo, padrao, inversores, tipoTelhado])

  function handleConfirmar() {
    if (!kitEscolhidoId) {
      setErro('Escolha um kit sugerido pra continuar.')
      return
    }
    const kit = kitsSugeridos.find(k => k.id === kitEscolhidoId)
    if (!kit) return

    const invPrincipal = kit.inversores[0]

    const payload: any = {
      placa: {
        id: kit.placa.id,
        codigo_weg: placaEscolhida!.codigo_weg,
        modelo: kit.placa.modelo,
        potencia_wp: kit.placa.potencia_wp,
        preco_venda: kit.placa.preco_unitario,
      },
      qtd_placas: kit.placa.qtd,
      potencia_cc_kwp: kit.pot_cc_kwp,
      inversor: {
        id: invPrincipal.produto_id,
        codigo_weg: invPrincipal.codigo_weg,
        modelo: invPrincipal.modelo,
        potencia_kw: invPrincipal.potencia_kw,
        preco_venda: invPrincipal.preco_unitario,
      },
      qtd_inversores: invPrincipal.qtd,
      potencia_ca_kw: kit.pot_ca_kw,
      fci_pct: kit.fci_pct,
      desbalanceamento_kw: kit.desbalanceamento_kw,
      preco_total_kit_weg: kit.preco_total_kit_weg,
      kit_id_sugerido: kit.id,
      categoria: kit.categoria,
    }

    startTransition(async () => {
      const result = await salvarKitAction(projetoId, payload, categoria || undefined, opts)
      if (!result) {
        setErro('Sem resposta do servidor')
        return
      }
      if (!result.sucesso) {
        setErro(result.erro || 'Erro ao salvar')
        return
      }
      // Kalebe 2026-09-01: server retorna next_path — cliente navega.
      // Antes o redirect era feito no server e era engolido se algum
      // passo throw antes; agora é explícito.
      if ('next_path' in result && result.next_path) {
        router.push(result.next_path)
      } else {
        router.refresh()
      }
    })
  }

  // ─── Modo manual — o vendedor mesmo monta o kit ─────────────────────────
  // Placa efetiva: prioriza a escolhida no bloco manual; cai pra da etapa 2.
  const placaManual = placas.find(p => p.id === manualPlacaId) || placaEscolhida
  const manualInv = inversores.find(i => i.id === manualInversorId)  // usado só pelo dropdown "adicionar"
  const manualQtd = manualQtdPlacas > 0
    ? manualQtdPlacas
    : Math.max(1, Math.ceil((potCcAlvo * 1000) / (placaManual?.specs?.potencia_wp || 1)))
  const manualPotCc = ((placaManual?.specs?.potencia_wp || 0) * manualQtd) / 1000

  // Kalebe 2026-08-27: kit manual permite composição de vários inversores
  // (mistura string+micro, potências diferentes). Resolve cada linha
  // buscando o produto por id e computa potência CA / preço agregados.
  const manualInversoresResolvidos = manualInversores
    .map((linha) => {
      const inv = inversores.find(i => i.id === linha.id)
      if (!inv) return null
      return {
        produto: inv,
        potencia_kw: inv.specs?.potencia_kw || 0,
        preco: precoDe(inv),
        qtd: linha.qtd,
        fases: linha.fases,
      }
    })
    .filter(Boolean) as Array<{ produto: ProdutoRow; potencia_kw: number; preco: number; qtd: number; fases: FaseInv }>

  const manualPotCa = manualInversoresResolvidos.reduce((s, x) => s + x.potencia_kw * x.qtd, 0)
  const manualFci = manualPotCa > 0 ? (manualPotCc / manualPotCa) * 100 : 0
  const manualPrecoInv = manualInversoresResolvidos.reduce((s, x) => s + x.preco * x.qtd, 0)
  const manualPreco = placaManual
    ? (precoDe(placaManual) * manualQtd) + manualPrecoInv
    : 0

  /** Deduz fase padrão do inversor pelo modelo + specs. SIW100 é sempre
   *  monofásico (regra fixa Spin). Outros: usa tensao_desc quando existir. */
  function deduzirFasePadrao(inv: ProdutoRow): FaseInv {
    if (/^SIW100/i.test(inv.modelo || '')) return 'monofasico'
    const t = String(inv.specs?.tensao_desc || '').toLowerCase()
    if (/tri/.test(t)) return 'trifasico'
    if (/bi/.test(t)) return 'bifasico'
    return 'monofasico'
  }

  function adicionarInversorManual() {
    if (!manualInv) { setErro('Escolha um inversor no dropdown antes de adicionar.'); return }
    if (manualQtdInv < 1) { setErro('Qtd de inversores inválida.'); return }
    setErro(null)
    setManualInversores((prev) => {
      const existente = prev.find(l => l.id === manualInv.id)
      if (existente) {
        return prev.map(l => l.id === manualInv.id ? { ...l, qtd: l.qtd + manualQtdInv } : l)
      }
      return [...prev, { id: manualInv.id, qtd: manualQtdInv, fases: deduzirFasePadrao(manualInv) }]
    })
    setManualInversorId(null)
    setManualQtdInv(1)
  }

  function removerInversorManual(id: string) {
    setManualInversores((prev) => prev.filter(l => l.id !== id))
  }

  function atualizarQtdInversorManual(id: string, qtd: number) {
    setManualInversores((prev) => prev.map(l => l.id === id ? { ...l, qtd: Math.max(1, qtd) } : l))
  }

  function atualizarFaseInversorManual(id: string, fases: FaseInv) {
    setManualInversores((prev) => prev.map(l => l.id === id ? { ...l, fases } : l))
  }

  function handleConfirmarManual() {
    if (!placaManual) { setErro('Escolha uma placa antes.'); return }
    if (!modoAmpliacao && manualInversoresResolvidos.length === 0) {
      setErro('Adicione pelo menos 1 inversor ao kit — ou marque o toggle "Ampliação (sem inversor)".')
      return
    }
    if (manualQtd < 1) { setErro('Qtd de placas inválida.'); return }

    const invPrincipal = manualInversoresResolvidos[0]
    // Categoria = 'microinversor' se TODOS forem micros; senão 'string' (kit misto/string)
    const todosMicros = !modoAmpliacao && manualInversoresResolvidos.every(x => /^SIW100/i.test(x.produto.modelo || ''))

    const payload: any = {
      placa: {
        id: placaManual.id,
        codigo_weg: placaManual.codigo_weg,
        modelo: placaManual.modelo,
        potencia_wp: placaManual.specs?.potencia_wp || 0,
        preco_venda: precoDe(placaManual),
      },
      qtd_placas: manualQtd,
      potencia_cc_kwp: manualPotCc,
      // Compat: 1º inversor "principal". Em modo ampliação vai vazio.
      inversor: modoAmpliacao ? {
        id: '', codigo_weg: '', modelo: 'AMPLIAÇÃO — sem inversor',
        potencia_kw: 0, preco_venda: 0,
      } : {
        id: invPrincipal.produto.id,
        codigo_weg: invPrincipal.produto.codigo_weg,
        modelo: invPrincipal.produto.modelo,
        potencia_kw: invPrincipal.potencia_kw,
        preco_venda: invPrincipal.preco,
      },
      qtd_inversores: modoAmpliacao ? 0 : invPrincipal.qtd,
      modo_ampliacao: modoAmpliacao,
      // NOVO: array completo de inversores no kit (vazio em ampliação)
      inversores: modoAmpliacao ? [] : manualInversoresResolvidos.map((x) => ({
        id: x.produto.id,
        codigo_weg: x.produto.codigo_weg,
        modelo: x.produto.modelo,
        potencia_kw: x.potencia_kw,
        preco_venda: x.preco,
        qtd: x.qtd,
        fases: x.fases,
      })),
      potencia_ca_kw: modoAmpliacao ? 0 : manualPotCa,
      fci_pct: modoAmpliacao ? 0 : manualFci,
      desbalanceamento_kw: 0,
      preco_total_kit_weg: manualPreco,
      kit_id_sugerido: 'manual',
      categoria: todosMicros ? 'microinversor' : 'string',
    }

    startTransition(async () => {
      const result = await salvarKitAction(projetoId, payload, categoria || undefined, opts)
      if (!result) {
        setErro('Sem resposta do servidor')
        return
      }
      if (!result.sucesso) {
        setErro(result.erro || 'Erro ao salvar')
        return
      }
      // Kalebe 2026-09-01: server retorna next_path — cliente navega.
      // Antes o redirect era feito no server e era engolido se algum
      // passo throw antes; agora é explícito.
      if ('next_path' in result && result.next_path) {
        router.push(result.next_path)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Contexto — dados do projeto */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Consumo médio" value={consumoMedio > 0 ? `${fmtNum(consumoMedio, 0)} kWh/mês` : '—'} />
        <Metric label="Rede CELESC" value={formatarLigacao(padrao.tipo_ligacao)} />
        <Metric label="Disjuntor entrada" value={padrao.amperagem_disjuntor_geral_a ? `${padrao.amperagem_disjuntor_geral_a} A` : '—'} />
        <Metric label="Pot. CC alvo" value={`${fmtNum(potCcAlvo, 2)} kWp`} highlight editavel>
          <input
            type="number"
            step="0.01"
            min="1"
            max="200"
            value={Number(potCcAlvo.toFixed(2))}
            onChange={e => {
              const v = parseFloat(e.target.value)
              // Arredonda pra 2 casas ao setar — evita floats tipo 5.5933333...
              if (!isNaN(v) && v > 0) setPotCcAlvo(Math.round(v * 100) / 100)
            }}
            className="w-full bg-transparent text-sol font-bold text-lg focus:outline-none"
          />
        </Metric>
      </section>

      {/* ETAPA 0: Escolher categoria de sistema */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="bg-sol text-noite w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">1</span>
          Escolha a categoria do sistema
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CATEGORIAS.map(cat => (
            <button
              key={cat.id}
              type="button"
              disabled={!cat.disponivel}
              onClick={() => cat.disponivel && setCategoria(cat.id)}
              className={`text-left p-5 rounded-lg border transition ${
                categoria === cat.id
                  ? 'bg-sol/15 border-sol/60 ring-1 ring-sol/40'
                  : cat.disponivel
                    ? 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    : 'bg-white/[0.01] border-white/5 opacity-40 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-3xl">{cat.emoji}</span>
                {!cat.disponivel && (
                  <span className="text-[10px] uppercase font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded">
                    Em breve
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-white mb-1">{cat.titulo}</p>
              <p className="text-xs text-white/60">{cat.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ETAPA 2: Escolher placa (só aparece após escolher categoria) */}
      {categoria && (
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="bg-sol text-noite w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">2</span>
          Escolha a placa fotovoltaica
          <span className="text-xs font-normal text-white/40">({placasVisiveis.length} opções)</span>
        </h2>

        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={mostrarIndisponiveis}
            onChange={e => setMostrarIndisponiveis(e.target.checked)}
            className="rounded"
          />
          Mostrar placas indisponíveis em estoque
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {placasVisiveis.map(p => (
            <PlacaCard
              key={p.id}
              placa={p}
              selecionada={placaId === p.id}
              onSelect={() => {
                setPlacaId(p.id)
                setKitEscolhidoId(null) // reset seleção de kit ao trocar placa
              }}
            />
          ))}
        </div>
      </section>
      )}

      {/* ETAPA 3: Kits sugeridos */}
      {categoria && placaEscolhida && (
        <section>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="bg-sol text-noite w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">3</span>
            Escolha uma configuração de kit
            <span className="text-xs font-normal text-white/40">({kitsSugeridos.length} sugeridos)</span>
          </h2>

          {kitsSugeridos.length > 0 && (() => {
            const qtdMicro = kitsSugeridos.filter(k => k.categoria === 'microinversor').length
            const qtdString = kitsSugeridos.filter(k => k.categoria === 'string').length
            if (qtdMicro === 0 || qtdString === 0) return null
            return (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Tipo de inversor:</span>
                {(['todos', 'micro', 'string'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setFiltroTipoInversor(t); setKitEscolhidoId(null) }}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
                      filtroTipoInversor === t
                        ? 'bg-sol text-noite border-sol'
                        : 'bg-white/[0.03] text-white/70 border-white/15 hover:border-white/30'
                    }`}
                  >
                    {t === 'todos' ? `Todos (${qtdMicro + qtdString})`
                      : t === 'micro' ? `🔀 Microinversor (${qtdMicro})`
                      : `⚡ String (${qtdString})`}
                  </button>
                ))}
              </div>
            )
          })()}

          {(() => {
            const kitsFiltrados = filtroTipoInversor === 'todos'
              ? kitsSugeridos
              : kitsSugeridos.filter(k =>
                  filtroTipoInversor === 'micro'
                    ? k.categoria === 'microinversor'
                    : k.categoria === 'string'
                )

            if (kitsSugeridos.length === 0) {
              return <DiagnosticoNenhumKit diagnostico={diagnostico} tipoLigacao={padrao.tipo_ligacao} />
            }
            if (kitsFiltrados.length === 0) {
              return (
                <p className="text-sm text-white/50 italic p-6 text-center bg-white/[0.02] border border-white/10 rounded-lg">
                  Nenhum kit desse tipo. Clica em "Todos" pra ver as outras opções.
                </p>
              )
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {kitsFiltrados.map(kit => (
                  <KitSugeridoCard
                    key={kit.id}
                    kit={kit}
                    selecionado={kitEscolhidoId === kit.id}
                    onSelect={() => setKitEscolhidoId(kit.id)}
                  />
                ))}
              </div>
            )
          })()}

          {/* Modo manual — escolho eu mesmo placa + inversor */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setModoManual(!modoManual)
                setKitEscolhidoId(null)
                if (!modoManual && manualQtdPlacas === 0) {
                  const auto = Math.max(1, Math.ceil((potCcAlvo * 1000) / (placaEscolhida?.specs?.potencia_wp || 1)))
                  setManualQtdPlacas(auto)
                }
              }}
              className="text-xs font-bold text-sol hover:text-sol/80 transition"
            >
              {modoManual ? '← Voltar às sugestões automáticas' : '🛠 Ou monte o kit manualmente (escolho a placa e o inversor)'}
            </button>

            {modoManual && (
              <ModoManual
                placas={placas}
                placaEfetiva={placaManual || null}
                manualPlacaId={manualPlacaId || placaEscolhida?.id || null}
                setManualPlacaId={setManualPlacaId}
                inversoresTodos={inversores}
                manualQtdPlacas={manualQtd}
                setManualQtdPlacas={setManualQtdPlacas}
                manualInversorId={manualInversorId}
                setManualInversorId={setManualInversorId}
                manualQtdInv={manualQtdInv}
                setManualQtdInv={setManualQtdInv}
                modoAmpliacao={modoAmpliacao}
                setModoAmpliacao={setModoAmpliacao}
                manualInversores={manualInversores}
                manualInversoresResolvidos={manualInversoresResolvidos.map(x => ({
                  id: x.produto.id, modelo: x.produto.modelo, codigo_weg: x.produto.codigo_weg,
                  potencia_kw: x.potencia_kw, preco: x.preco, qtd: x.qtd, fases: x.fases,
                  isMicro: /^SIW100/i.test(x.produto.modelo || ''),
                }))}
                adicionarInversor={adicionarInversorManual}
                removerInversor={removerInversorManual}
                atualizarQtdInversor={atualizarQtdInversorManual}
                atualizarFaseInversor={atualizarFaseInversorManual}
                potCc={manualPotCc}
                potCa={manualPotCa}
                fci={manualFci}
                preco={manualPreco}
                tipoLigacao={padrao.tipo_ligacao}
                onConfirmar={handleConfirmarManual}
                pending={isPending}
              />
            )}
          </div>
        </section>
      )}

      {erro && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 text-sm text-coral">
          ❌ {erro}
        </div>
      )}

      {kitEscolhidoId && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={isPending}
            className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
          >
            {isPending ? 'Salvando...' : 'Confirmar kit → Passo 7 Lista CA'}
          </button>
        </div>
      )}
    </div>
  )
}

// ==========================================================
// SUB-COMPONENTS
// ==========================================================

function PlacaCard({
  placa, selecionada, onSelect,
}: { placa: ProdutoRow; selecionada: boolean; onSelect: () => void }) {
  const wpBruto = Number(placa.specs?.potencia_wp) || 0
  // Sanidade: placa fotovoltaica real é 200-1000 Wp. Se veio "2.278"
  // é cadastro em kW por engano — mostra corrigido. Se veio muito baixo
  // (< 100), mostra "—" pra sinalizar que o cadastro tá quebrado.
  const wp = wpBruto < 100 && wpBruto > 0
    ? Math.round(wpBruto * 1000) // veio em kW, mostra Wp
    : wpBruto
  const area = Number(placa.specs?.area_m2) || 0

  return (
    <div
      className={`p-4 rounded-lg border transition ${
        selecionada
          ? 'bg-sol/15 border-sol/60 ring-1 ring-sol/40'
          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-white text-sm">{placa.modelo}</span>
              <span className="text-xs font-mono text-white/40">{placa.codigo_weg}</span>
            </div>
            <p className="text-xs text-white/70">{placa.descricao_curta}</p>
            <p className="text-xs text-white/40 mt-0.5">{placa.fabricante}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-sol">
              {wp >= 100 ? fmtNum(wp, 0) : '—'}
            </p>
            <p className="text-[10px] text-white/40 uppercase">Wp</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
          <span className="text-white/50">Área: <strong className="text-white">{fmtNum(area, 2)} m²</strong></span>
          {!placa.disponivel_estoque && (
            <span className="text-[10px] text-coral font-bold uppercase">● Fora de estoque</span>
          )}
        </div>
      </button>
      {/* Botão datasheet fora do onSelect */}
      {placa.url_datasheet ? (
        <a
          href={placa.url_datasheet}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="mt-2 block text-center text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded text-white hover:bg-white/10"
        >
          📄 Ver datasheet
        </a>
      ) : (
        <div className="mt-2 text-center text-[10px] text-white/30 italic">
          Datasheet ainda não cadastrado
        </div>
      )}
    </div>
  )
}

function KitSugeridoCard({
  kit, selecionado, onSelect,
}: { kit: KitSugerido; selecionado: boolean; onSelect: () => void }) {
  const inv = kit.inversores[0]
  const isMicro = kit.categoria === 'microinversor'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left p-4 rounded-lg border transition ${
        selecionado
          ? 'bg-verde/15 border-verde/60 ring-1 ring-verde/40'
          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
      }`}
    >
      <div className="mb-2">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="text-xs font-bold text-white">{kit.nome}</p>
          {kit.validacoes.is_subdimensionado && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-sol/20 text-sol border border-sol/40">
              Entrada
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/50">{kit.racional}</p>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <p className="text-[9px] text-white/40 uppercase">CC</p>
          <p className="text-sm font-bold text-sol">{fmtNum(kit.pot_cc_kwp, 2)} kWp</p>
        </div>
        <div>
          <p className="text-[9px] text-white/40 uppercase">CA</p>
          <p className="text-sm font-bold text-weg-azul">{fmtNum(kit.pot_ca_kw, 2)} kW</p>
        </div>
        <div>
          <p className="text-[9px] text-white/40 uppercase">Carregamento</p>
          <p className={`text-sm font-bold ${
            kit.validacoes.fci_ideal ? 'text-verde' : kit.fci_pct > 145 || kit.fci_pct < 100 ? 'text-coral' : 'text-sol'
          }`}>
            {fmtNum(kit.fci_pct, 0)}%
          </p>
        </div>
      </div>

      {/* Composição completa do kit (itens que compramos WEG) */}
      <div className="bg-white/[0.02] rounded p-2 mb-3 text-[10px] space-y-1">
        <p className="text-[9px] text-white/40 uppercase font-bold mb-1">Composição WEG</p>
        <div className="flex gap-1.5"><span>☀️</span><span className="text-white/80">{kit.composicao.placas}</span></div>
        <div className="flex gap-1.5"><span>⚡</span><span className="text-white/80">{kit.composicao.inversores}</span></div>
        <div className="flex gap-1.5"><span>🏗️</span><span className="text-white/80">{kit.composicao.estrutura}</span></div>
        <div className="flex gap-1.5"><span>🔴</span><span className="text-white/80">{kit.composicao.cabo_cc}</span></div>
        <div className="flex gap-1.5"><span>🛡️</span><span className="text-white/80">{kit.composicao.disjuntor}</span></div>
        <div className="flex gap-1.5"><span>⚠️</span><span className="text-white/80">{kit.composicao.dps}</span></div>
        <div className="flex gap-1.5"><span>📦</span><span className="text-white/80">{kit.composicao.quadro}</span></div>
        <div className="flex gap-1.5"><span>⚓</span><span className="text-white/80">{kit.composicao.aterramento}</span></div>
      </div>

      {/* Botão datasheet do inversor */}
      {kit.inversores[0].url_datasheet && (
        <a
          href={kit.inversores[0].url_datasheet}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="block mb-3 text-center text-[10px] px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white hover:bg-white/10"
        >
          📄 Datasheet do inversor
        </a>
      )}

      {/* Alertas */}
      {kit.validacoes.precisa_upgrade_disjuntor && (
        <div className="bg-sol/10 border border-sol/40 rounded p-2 mb-2 text-[10px] flex gap-2">
          <span>⚠️</span>
          <div>
            <p className="text-sol font-bold">Upgrade de disjuntor necessário</p>
            <p className="text-white/70">
              Sistema exige <strong>{kit.validacoes.corrente_sistema_a}A</strong> — padrão atual {kit.validacoes.disjuntor_atual_a}A.
              Trocar disjuntor de entrada pra <strong>{kit.validacoes.disjuntor_sugerido_a}A</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Badges de validação */}
      <div className="flex flex-wrap gap-1">
        <BadgeValidacao ok={kit.validacoes.dentro_limite_celesc} texto="CELESC" />
        {kit.desbalanceamento_kw > 0 && (
          <BadgeValidacao ok={kit.validacoes.desbalanceamento_ok} texto={`Δ ${fmtNum(kit.desbalanceamento_kw, 1)}kW`} />
        )}
        <BadgeValidacao ok={kit.validacoes.fci_ideal} texto="Carreg. ideal" />
      </div>
    </button>
  )
}

function BadgeValidacao({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
      ok ? 'bg-verde/10 text-verde border border-verde/30' : 'bg-coral/10 text-coral border border-coral/30'
    }`}>
      {ok ? '✓' : '✗'} {texto}
    </span>
  )
}

function Metric({
  label, value, highlight, editavel, children,
}: {
  label: string
  value: string
  highlight?: boolean
  editavel?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
        {label} {editavel && <span className="text-sol/60">✏️</span>}
      </p>
      {children || <p className={`text-lg font-bold ${highlight ? 'text-sol' : 'text-white'}`}>{value}</p>}
    </div>
  )
}

function formatarLigacao(v?: string): string {
  const m: Record<string, string> = {
    monofasico: 'Monofásico',
    bifasico: 'Bifásico',
    trifasico: 'Trifásico',
  }
  return m[(v || '').toLowerCase()] || v || '—'
}

/**
 * Modo manual — o vendedor escolhe direto placa + inversor + qtds.
 * Não bloqueia nada; só mostra warnings pra decisões questionáveis
 * (FCI muito longe do ideal, potência CA acima do CELESC).
 */
function ModoManual({
  placas, placaEfetiva,
  manualPlacaId, setManualPlacaId,
  inversoresTodos,
  manualQtdPlacas, setManualQtdPlacas,
  manualInversorId, setManualInversorId,
  manualQtdInv, setManualQtdInv,
  manualInversores, manualInversoresResolvidos,
  adicionarInversor, removerInversor, atualizarQtdInversor, atualizarFaseInversor,
  modoAmpliacao, setModoAmpliacao,
  potCc, potCa, fci, preco,
  tipoLigacao,
  onConfirmar, pending,
}: {
  placas: ProdutoRow[]
  placaEfetiva: ProdutoRow | null
  manualPlacaId: string | null
  setManualPlacaId: (id: string | null) => void
  inversoresTodos: ProdutoRow[]
  manualQtdPlacas: number
  setManualQtdPlacas: (n: number) => void
  manualInversorId: string | null
  setManualInversorId: (id: string | null) => void
  manualQtdInv: number
  setManualQtdInv: (n: number) => void
  manualInversores: Array<{ id: string; qtd: number; fases: 'monofasico' | 'bifasico' | 'trifasico' }>
  manualInversoresResolvidos: Array<{ id: string; modelo: string; codigo_weg: string | null; potencia_kw: number; preco: number; qtd: number; fases: 'monofasico' | 'bifasico' | 'trifasico'; isMicro: boolean }>
  adicionarInversor: () => void
  removerInversor: (id: string) => void
  atualizarQtdInversor: (id: string, qtd: number) => void
  atualizarFaseInversor: (id: string, fases: 'monofasico' | 'bifasico' | 'trifasico') => void
  modoAmpliacao: boolean
  setModoAmpliacao: (v: boolean) => void
  potCc: number
  potCa: number
  fci: number
  preco: number
  tipoLigacao: string
  onConfirmar: () => void
  pending: boolean
}) {
  // Lista TUDO cadastrado por padrão (regra fixa —
  // feedback-kit-manual-reserva-estoque). A→Z pelo modelo.
  const placasOrd = placas
    .slice()
    .sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR'))
  const inversoresOrd = inversoresTodos
    .slice()
    .sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR'))

  const inv = inversoresTodos.find(i => i.id === manualInversorId)

  // ─── Balanceamento CELESC entre fases ──────────────────────────────────
  // Regra: micros mono → distribuídos round-robin em F1/F2/F3 (sistema tri)
  // ou F1/F2 (sistema bi). String bi → metade em F1, metade em F2. String
  // tri → 1/3 em cada. Alerta se |Fmax - Fmin| > 8 kW (regra CELESC).
  const cargaPorFase = (() => {
    let F1 = 0, F2 = 0, F3 = 0
    let idxMono = 0
    const totalFasesRede = tipoLigacao === 'trifasico' ? 3 : tipoLigacao === 'bifasico' ? 2 : 1
    for (const x of manualInversoresResolvidos) {
      const potUnidade = x.potencia_kw
      if (x.fases === 'monofasico') {
        for (let i = 0; i < x.qtd; i++) {
          const f = idxMono % totalFasesRede
          if (f === 0) F1 += potUnidade
          else if (f === 1) F2 += potUnidade
          else F3 += potUnidade
          idxMono++
        }
      } else if (x.fases === 'bifasico') {
        F1 += (potUnidade * x.qtd) / 2
        F2 += (potUnidade * x.qtd) / 2
      } else {
        F1 += (potUnidade * x.qtd) / 3
        F2 += (potUnidade * x.qtd) / 3
        F3 += (potUnidade * x.qtd) / 3
      }
    }
    return { F1, F2, F3 }
  })()
  const fMax = Math.max(cargaPorFase.F1, cargaPorFase.F2, cargaPorFase.F3)
  const fMin = tipoLigacao === 'monofasico'
    ? cargaPorFase.F1
    : tipoLigacao === 'bifasico'
    ? Math.min(cargaPorFase.F1, cargaPorFase.F2)
    : Math.min(cargaPorFase.F1, cargaPorFase.F2, cargaPorFase.F3)
  const desbalanceamentoKw = fMax - fMin

  // Warnings x erros bloqueantes CELESC
  const warnings: string[] = []
  const errosCelesc: string[] = []
  if (fci > 0 && fci < 80) warnings.push(`FCI ${fmtNum(fci, 0)}% — inversor superdimensionado, geração vai desperdiçar potência CA.`)
  if (fci > 145) warnings.push(`FCI ${fmtNum(fci, 0)}% — inversor subdimensionado demais, vai clipar bastante em pico de sol.`)
  // Limites CELESC de potência CA por tipo de ligação
  if (tipoLigacao === 'monofasico' && potCa > 8) errosCelesc.push(`Potência CA ${fmtNum(potCa, 1)} kW ultrapassa o limite CELESC monofásico de 8 kW. Migre pra bifásico ou trifásico.`)
  if (tipoLigacao === 'bifasico' && potCa > 15) errosCelesc.push(`Potência CA ${fmtNum(potCa, 1)} kW ultrapassa o limite CELESC bifásico de 15 kW. Migre pra trifásico.`)
  // Balanceamento entre fases — CELESC exige Δ ≤ 8 kW
  if (tipoLigacao === 'trifasico' && desbalanceamentoKw > 8) {
    errosCelesc.push(`Desbalanceamento ${fmtNum(desbalanceamentoKw, 1)} kW entre fases (F1 ${fmtNum(cargaPorFase.F1, 1)} · F2 ${fmtNum(cargaPorFase.F2, 1)} · F3 ${fmtNum(cargaPorFase.F3, 1)}). CELESC exige Δ ≤ 8 kW.`)
  }
  if (tipoLigacao === 'bifasico' && desbalanceamentoKw > 8) {
    errosCelesc.push(`Desbalanceamento ${fmtNum(desbalanceamentoKw, 1)} kW entre fases (F1 ${fmtNum(cargaPorFase.F1, 1)} · F2 ${fmtNum(cargaPorFase.F2, 1)}). CELESC exige Δ ≤ 8 kW.`)
  }
  // Micros mono precisam ser múltiplos do nº de fases da rede pra balancear
  const totalMicrosMono = manualInversoresResolvidos
    .filter(x => x.isMicro && x.fases === 'monofasico')
    .reduce((s, x) => s + x.qtd, 0)
  if (totalMicrosMono > 0 && tipoLigacao === 'trifasico' && totalMicrosMono % 3 !== 0) {
    warnings.push(`${totalMicrosMono} micros monofásicos numa rede trifásica — pra balancear perfeitamente, use múltiplo de 3 micros.`)
  }
  if (totalMicrosMono > 0 && tipoLigacao === 'bifasico' && totalMicrosMono % 2 !== 0) {
    warnings.push(`${totalMicrosMono} micros monofásicos numa rede bifásica — pra balancear, use múltiplo de 2 micros.`)
  }

  if (placaEfetiva && (placaEfetiva.specs?.potencia_wp || 0) === 0) warnings.push('Essa placa está com potência 0 Wp no cadastro. Confere o produto em /admin/catalogo.')
  if (inv && (inv.specs?.potencia_kw || 0) === 0) warnings.push('Esse inversor está com potência 0 kW no cadastro. Confere o produto em /admin/catalogo.')

  const podeSalvar = !!placaEfetiva && manualQtdPlacas >= 1
    && (modoAmpliacao || manualInversoresResolvidos.length > 0)

  return (
    <div className="mt-4 p-4 bg-white/[0.02] border border-sol/25 rounded-lg space-y-4">
      {/* Toggle modo ampliação — cliente já tem inversor */}
      <button
        type="button"
        onClick={() => setModoAmpliacao(!modoAmpliacao)}
        className={`w-full p-3 rounded-lg border-2 transition text-left ${
          modoAmpliacao
            ? 'bg-weg-azul/10 border-weg-azul/60'
            : 'bg-white/[0.02] border-white/10 hover:border-white/25'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-sm font-bold ${modoAmpliacao ? 'text-weg-azul' : 'text-white/80'}`}>
              {modoAmpliacao ? '🔧 Modo ampliação ATIVO' : '🔧 Ampliação (sem inversor)'}
            </p>
            <p className="text-[11px] text-white/60 mt-0.5">
              {modoAmpliacao
                ? 'Sistema calcula placa + estrutura + cabo. Não aplica fator WEG (0,4182) — vai direto pra precificação Spin.'
                : 'Cliente já tem inversor — só cotamos placas, estrutura e cabo. Ative pra usar.'}
            </p>
          </div>
          <div className={`w-10 h-6 rounded-full border-2 relative shrink-0 ${
            modoAmpliacao ? 'bg-weg-azul border-weg-azul' : 'bg-transparent border-white/25'
          }`}>
            <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition ${
              modoAmpliacao ? 'right-0.5' : 'left-0.5'
            }`} />
          </div>
        </div>
      </button>

      <p className="text-xs text-sol/80 leading-relaxed">
        💡 Itens fora de estoque continuam disponíveis pra escolha — pode acontecer do material sair do estoque
        entre o cadastro do projeto e a montagem do kit, mas ele já foi reservado pra essa venda.
      </p>

      {/* Dois selects lado a lado — placa + inversor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
            Modelo de placa ({placasOrd.length} opções)
          </span>
          <select
            value={manualPlacaId || ''}
            onChange={e => setManualPlacaId(e.target.value || null)}
            className="mt-1 w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded text-white text-sm"
          >
            <option value="" className="bg-noite">— escolha uma placa —</option>
            {placasOrd.map(p => (
              <option key={p.id} value={p.id} className="bg-noite">
                {p.modelo} · {p.specs?.potencia_wp || 0} Wp
                {!p.disponivel_estoque ? ' · sem estoque' : ''}
              </option>
            ))}
          </select>
          {placaEfetiva && (
            <p className="text-[10px] text-white/40 mt-1">
              {placaEfetiva.codigo_weg} · {placaEfetiva.fabricante || 'sem fabricante'}
              {!placaEfetiva.disponivel_estoque && <span className="text-coral"> · ⚠ sem estoque</span>}
            </p>
          )}
        </label>

        <div className={`block ${modoAmpliacao ? 'opacity-40 pointer-events-none' : ''}`}>
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
            Invesores no kit ({manualInversoresResolvidos.length} adicionado{manualInversoresResolvidos.length === 1 ? '' : 's'})
            {modoAmpliacao && <span className="ml-2 text-weg-azul normal-case">— desativado (modo ampliação)</span>}
          </span>
          {/* Lista dos inversores JÁ adicionados */}
          {manualInversoresResolvidos.length > 0 && (
            <div className="mt-1 mb-2 space-y-1">
              {manualInversoresResolvidos.map((x) => (
                <div key={x.id} className="flex items-center gap-2 p-2 bg-white/[0.02] border border-white/10 rounded">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${x.isMicro ? 'bg-verde/20 text-verde' : 'bg-weg-azul/20 text-weg-azul'}`}>
                    {x.isMicro ? 'micro' : 'string'}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-xs text-white">
                    {x.modelo} · {x.potencia_kw} kW
                  </span>
                  <select value={x.fases}
                    onChange={(e) => atualizarFaseInversor(x.id, e.target.value as 'monofasico' | 'bifasico' | 'trifasico')}
                    disabled={x.isMicro}
                    title={x.isMicro ? 'SIW100 é sempre monofásico' : 'Fase da rede que atende esse inversor'}
                    className="px-2 py-0.5 bg-white/5 border border-white/15 rounded text-white text-[11px] disabled:opacity-60">
                    <option value="monofasico" className="bg-noite">Mono 220V</option>
                    <option value="bifasico" className="bg-noite">Bi 220V</option>
                    <option value="trifasico" className="bg-noite">Tri 380V</option>
                  </select>
                  <input type="number" min={1} max={100} value={x.qtd}
                    onChange={(e) => atualizarQtdInversor(x.id, parseInt(e.target.value) || 1)}
                    className="w-14 px-2 py-0.5 bg-white/5 border border-white/15 rounded text-white text-xs text-right" />
                  <button type="button" onClick={() => removerInversor(x.id)}
                    className="text-coral text-sm hover:text-coral/70">✕</button>
                </div>
              ))}
            </div>
          )}
          {/* Adicionar novo */}
          <div className="flex gap-2 items-end">
            <select
              value={manualInversorId || ''}
              onChange={e => setManualInversorId(e.target.value || null)}
              className="flex-1 px-3 py-2 bg-white/5 border border-white/15 rounded text-white text-xs"
            >
              <option value="" className="bg-noite">— escolha um inversor pra adicionar —</option>
              {inversoresOrd.map(i => {
                const isMicro = /^SIW100/i.test(i.modelo || '')
                return (
                  <option key={i.id} value={i.id} className="bg-noite">
                    {isMicro ? '[micro] ' : '[string] '}
                    {i.modelo} · {i.specs?.potencia_kw || 0} kW
                    {!i.disponivel_estoque ? ' · sem estoque' : ''}
                  </option>
                )
              })}
            </select>
            <input type="number" min={1} max={100} value={manualQtdInv}
              onChange={e => setManualQtdInv(parseInt(e.target.value) || 1)}
              className="w-16 px-2 py-2 bg-white/5 border border-white/15 rounded text-white text-xs text-right"
              title="Qtd" />
            <button type="button" onClick={adicionarInversor}
              disabled={!manualInversorId}
              className="px-3 py-2 bg-sol/20 border border-sol/40 text-sol text-xs font-bold rounded hover:bg-sol/30 disabled:opacity-40 whitespace-nowrap">
              + Adicionar
            </button>
          </div>
          <p className="text-[10px] text-white/40 mt-1">
            💡 Pode misturar string + micro ou potências diferentes. Potência CA e preço somam automaticamente.
          </p>
        </div>
      </div>

      {/* Qtds + resumo (FCI, CC, CA, preço) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Qtd placas</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={manualQtdPlacas}
            onChange={e => setManualQtdPlacas(parseInt(e.target.value) || 1)}
            className="mt-1 w-full px-3 py-2 bg-white/5 border border-white/15 rounded text-white font-bold text-lg"
          />
        </label>
        <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Qtd invesores</p>
          <p className="text-lg font-black text-white tabular-nums">
            {manualInversoresResolvidos.reduce((s, x) => s + x.qtd, 0)}
            <span className="text-xs text-white/50 font-normal">
              {' '}({manualInversoresResolvidos.length} modelo{manualInversoresResolvidos.length === 1 ? '' : 's'})
            </span>
          </p>
        </div>
        <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Pot. CC</p>
          <p className="text-lg font-black text-sol tabular-nums">{fmtNum(potCc, 2)}<span className="text-xs text-white/50 font-normal"> kWp</span></p>
        </div>
        <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Pot. CA</p>
          <p className="text-lg font-black text-weg-azul tabular-nums">{fmtNum(potCa, 2)}<span className="text-xs text-white/50 font-normal"> kW</span></p>
        </div>
        <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">FCI</p>
          <p className={`text-lg font-black tabular-nums ${
            fci >= 100 && fci <= 145 ? 'text-verde' : fci >= 80 ? 'text-sol' : 'text-coral'
          }`}>{fci > 0 ? fmtNum(fci, 0) : '—'}<span className="text-xs text-white/50 font-normal">%</span></p>
        </div>
        <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Preço WEG</p>
          <p className="text-sm font-black text-white tabular-nums">R$ {preco.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      {/* Distribuição por fase — só relevante em bi/tri */}
      {tipoLigacao !== 'monofasico' && manualInversoresResolvidos.length > 0 && (
        <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-2">
            ⚖ Balanceamento por fase (rede {tipoLigacao})
          </p>
          <div className={`grid ${tipoLigacao === 'trifasico' ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
            <FaseCard rotulo="F1" kw={cargaPorFase.F1} maior={cargaPorFase.F1 === fMax && desbalanceamentoKw > 0.1} />
            <FaseCard rotulo="F2" kw={cargaPorFase.F2} maior={cargaPorFase.F2 === fMax && desbalanceamentoKw > 0.1} />
            {tipoLigacao === 'trifasico' && (
              <FaseCard rotulo="F3" kw={cargaPorFase.F3} maior={cargaPorFase.F3 === fMax && desbalanceamentoKw > 0.1} />
            )}
          </div>
          <p className="text-[10px] text-white/50 mt-2">
            Δ máx-mín = <strong className={desbalanceamentoKw > 8 ? 'text-coral' : 'text-verde'}>{fmtNum(desbalanceamentoKw, 1)} kW</strong>
            <span className="text-white/40"> · limite CELESC = 8 kW</span>
          </p>
        </div>
      )}

      {/* Erros CELESC bloqueantes */}
      {errosCelesc.length > 0 && (
        <div className="p-3 bg-coral/10 border border-coral/40 rounded-lg space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-coral font-bold mb-1">
            ⛔ Não conforme às normas CELESC
          </p>
          {errosCelesc.map((e, i) => (
            <p key={i} className="text-xs text-coral">✕ {e}</p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-3 bg-sol/5 border border-sol/25 rounded-lg space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-sol/90">⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-white/10">
        {errosCelesc.length > 0 && (
          <p className="text-[11px] text-coral mr-3">
            ⛔ Corrija os erros CELESC antes de continuar
          </p>
        )}
        <button
          type="button"
          onClick={onConfirmar}
          disabled={pending || !podeSalvar || errosCelesc.length > 0}
          className="px-5 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {pending ? 'Salvando...' : '✓ Confirmar kit manual → Lista CA'}
        </button>
      </div>
    </div>
  )
}

function FaseCard({ rotulo, kw, maior }: { rotulo: string; kw: number; maior: boolean }) {
  return (
    <div className={`p-2 rounded border ${maior ? 'bg-sol/10 border-sol/40' : 'bg-white/5 border-white/10'}`}>
      <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold">{rotulo}</p>
      <p className={`text-sm font-black tabular-nums ${maior ? 'text-sol' : 'text-white'}`}>
        {fmtNum(kw, 1)}<span className="text-[10px] text-white/40 font-normal"> kW</span>
      </p>
    </div>
  )
}

/**
 * Bloco de diagnóstico exibido quando o gerador não conseguiu montar
 * nenhum kit. Traduz os contadores por etapa em uma causa raiz específica.
 */
function DiagnosticoNenhumKit({ diagnostico, tipoLigacao }: {
  diagnostico: DiagnosticoGerador | null
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico' | string
}) {
  if (!diagnostico) {
    return (
      <div className="p-6 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
        Escolha uma placa acima pra o gerador começar a montar kits.
      </div>
    )
  }
  const d = diagnostico

  // Identifica a causa raiz mais provável
  let causaTitulo = 'Nenhum kit válido pra essa combinação.'
  let causaMotivo = ''
  const isMono = tipoLigacao === 'monofasico'
  const isTri = tipoLigacao === 'trifasico'
  const grupoRelevante = isTri ? d.inversores_tri + d.inversores_mono : isMono ? d.inversores_mono : d.inversores_mono

  if (d.inversores_total === 0) {
    causaMotivo = 'O catálogo não tem NENHUM inversor cadastrado. Cadastre inversores em /admin/catalogo antes de gerar kits.'
  } else if (d.inversores_com_estoque === 0) {
    causaMotivo = `Todos os ${d.inversores_total} inversores do catálogo estão marcados como fora de estoque. Atualize a disponibilidade em /admin/catalogo.`
  } else if (d.inversores_apos_127v === 0) {
    causaMotivo = `Todos os ${d.inversores_com_estoque} inversores em estoque são 127V — CELESC não atende essa tensão. Cadastre inversores 220V/380V.`
  } else if (grupoRelevante === 0) {
    causaMotivo = `Você tem ${d.inversores_apos_127v} inversores em estoque, mas nenhum é compatível com rede ${tipoLigacao}. Faltam inversores ${isMono ? 'monofásicos (SIW200/SIW300)' : isTri ? 'monofásicos (SIW200/SIW300) ou trifásicos (SIW400/SIW500)' : 'monofásicos (SIW200/SIW300)'} no cadastro.`
  } else if (d.inversores_nao_classificados > 0 && d.candidatos_gerados === 0) {
    causaMotivo = `Você tem ${d.inversores_nao_classificados} inversor(es) em estoque mas o campo "modelo" deles não bate com o padrão WEG (SIW100/SIW200/SIW300/SIW400/SIW500). O gerador classifica pelo modelo, não pelo código. Ajuste o modelo em /admin/catalogo.`
  } else if (d.candidatos_gerados === 0) {
    causaMotivo = 'O gerador não conseguiu montar nenhuma combinação candidata. Verifique se os inversores em estoque têm potência preenchida em specs.potencia_kw.'
  } else if (d.rejeitados_por_celesc > 0 && d.rejeitados_por_celesc === d.candidatos_gerados) {
    causaMotivo = `Todas as ${d.candidatos_gerados} combinações excederam o limite CELESC de ${d.pot_ca_limite_celesc_kw} kW pra rede ${tipoLigacao}. Reduza a potência CC alvo ou escolha uma placa de menor Wp.`
  } else if (d.rejeitados_por_fci > 0 && d.rejeitados_por_fci === d.candidatos_gerados) {
    causaMotivo = `Todas as ${d.candidatos_gerados} combinações ficaram fora do FCI aceitável (50% a 200%). A potência CC alvo (${fmtNum(d.pot_cc_real_kwp, 2)} kWp) não bate com as potências CA disponíveis (nenhum inversor entre ~${fmtNum(d.pot_cc_real_kwp / 2, 1)} e ~${fmtNum(d.pot_cc_real_kwp / 0.5, 1)} kW cadastrado). Ajuste a potência alvo ou cadastre inversor SIW de outra faixa. Se você já tem SIW no catálogo, confira se a subcategoria está setada como "inversor_string" em /admin/catalogo.`
  } else if (d.rejeitados_por_desbalanceamento > 0) {
    causaMotivo = `Todas as combinações rejeitaram por desbalanceamento entre fases > 5 kW. Cadastre mais opções de inversor ou reduza a potência CC alvo.`
  } else {
    causaMotivo = 'As combinações candidatas foram rejeitadas por múltiplas regras. Revise potência CC alvo e disponibilidade em estoque.'
  }

  return (
    <div className="p-5 bg-coral/10 border border-coral/30 rounded-lg text-sm">
      <p className="text-coral font-bold mb-2">❌ {causaTitulo}</p>
      <p className="text-white/90 leading-relaxed mb-4">{causaMotivo}</p>

      <details className="text-xs text-white/70">
        <summary className="cursor-pointer text-white/80 font-semibold mb-2 hover:text-white">
          🔍 Ver diagnóstico técnico completo
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-4 border-l border-white/10">
          <span className="text-white/50">Qtd placas calculada:</span>
          <span className="text-white tabular-nums">{d.qtd_placas_calculada}</span>

          <span className="text-white/50">Pot. CC real:</span>
          <span className="text-white tabular-nums">{fmtNum(d.pot_cc_real_kwp, 2)} kWp</span>

          <span className="text-white/50">Limite CELESC ({tipoLigacao}):</span>
          <span className="text-white tabular-nums">{d.pot_ca_limite_celesc_kw} kW</span>

          <span className="text-white/50">Limite disjuntor entrada:</span>
          <span className="text-white tabular-nums">{fmtNum(d.pot_ca_limite_disjuntor_kw, 1)} kW</span>

          <span className="text-white/50 col-span-2 border-t border-white/10 pt-2 mt-2 font-semibold text-white/70">Filtros aplicados</span>

          <span className="text-white/50">Inversores no catálogo:</span>
          <span className="text-white tabular-nums">{d.inversores_total}</span>

          <span className="text-white/50">→ com estoque:</span>
          <span className={`tabular-nums ${d.inversores_com_estoque === 0 ? 'text-coral' : 'text-white'}`}>{d.inversores_com_estoque}</span>

          <span className="text-white/50">→ após excluir 127V:</span>
          <span className="text-white tabular-nums">{d.inversores_apos_127v}</span>

          <span className="text-white/50">→ classificados mono (SIW2/3xx):</span>
          <span className="text-white tabular-nums">{d.inversores_mono}</span>

          <span className="text-white/50">→ classificados tri (SIW4/5xx):</span>
          <span className="text-white tabular-nums">{d.inversores_tri}</span>

          <span className="text-white/50">→ classificados micro (SIW1xx):</span>
          <span className="text-white tabular-nums">{d.inversores_micro}</span>

          {d.inversores_nao_classificados > 0 && (
            <>
              <span className="text-coral">⚠️ Não classificados:</span>
              <span className="text-coral tabular-nums">{d.inversores_nao_classificados}</span>
              <div className="col-span-2 text-[11px] text-white/50 pl-4 border-l border-coral/30 mt-1">
                {d.amostra_nao_classificados.map((s, i) => (
                  <div key={i}>· {s}</div>
                ))}
              </div>
            </>
          )}

          <span className="text-white/50 col-span-2 border-t border-white/10 pt-2 mt-2 font-semibold text-white/70">Composições testadas</span>

          <span className="text-white/50">Combinações geradas:</span>
          <span className="text-white tabular-nums">{d.candidatos_gerados}</span>

          <span className="text-white/50">→ rejeitadas por FCI:</span>
          <span className="text-white tabular-nums">{d.rejeitados_por_fci}</span>

          <span className="text-white/50">→ rejeitadas por CELESC:</span>
          <span className="text-white tabular-nums">{d.rejeitados_por_celesc}</span>

          <span className="text-white/50">→ rejeitadas por desbalanceamento:</span>
          <span className="text-white tabular-nums">{d.rejeitados_por_desbalanceamento}</span>

          <span className="text-white/50">→ rejeitadas por micro/placas:</span>
          <span className="text-white tabular-nums">{d.rejeitados_por_micro_placas}</span>
        </div>
      </details>
    </div>
  )
}
