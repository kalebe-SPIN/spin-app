'use client'

import { useState, useMemo, useTransition } from 'react'
import { salvarKitAction } from '@/app/projetos/[id]/kit/actions'
import { sugerirKits, type KitSugerido, type DiagnosticoGerador } from '@/lib/kit-auto/sugerir-kits'

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
  precos_produtos: Array<{ preco_venda: number; vigente_de: string }>
}

type Props = {
  projetoId: string
  placas: ProdutoRow[]
  inversores: ProdutoRow[]
  padrao: any
  potCcAlvoAuto: number
  consumoMedio: number
  kitSalvo: any | null
}

function precoDe(p: ProdutoRow): number {
  const ps = p.precos_produtos || []
  if (!ps.length) return 0
  return ps.slice().sort((a, b) => (a.vigente_de < b.vigente_de ? 1 : -1))[0].preco_venda
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
}: Props & { tipoTelhado?: string }) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const [categoria, setCategoria] = useState<CategoriaSistema | null>(
    (kitSalvo?.tipo_projeto as CategoriaSistema) || null
  )
  const [potCcAlvo, setPotCcAlvo] = useState<number>(potCcAlvoAuto)
  const [placaId, setPlacaId] = useState<string | null>(kitSalvo?.placa?.id || null)
  const [kitEscolhidoId, setKitEscolhidoId] = useState<string | null>(null)
  const [mostrarIndisponiveis, setMostrarIndisponiveis] = useState(false)

  // Modo manual: você escolhe placa + qtd + inversor + qtd, ignora
  // sugestões e validações bloqueantes. Warnings continuam informativos.
  const [modoManual, setModoManual] = useState<boolean>(false)
  const [manualQtdPlacas, setManualQtdPlacas] = useState<number>(0)
  const [manualInversorId, setManualInversorId] = useState<string | null>(null)
  const [manualQtdInv, setManualQtdInv] = useState<number>(1)

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
      const result = await salvarKitAction(projetoId, payload, categoria || undefined)
      if (result && !result.sucesso) setErro(result.erro || 'Erro ao salvar')
    })
  }

  // ─── Modo manual — o vendedor mesmo monta o kit ─────────────────────────
  const manualInv = inversores.find(i => i.id === manualInversorId)
  const manualQtd = manualQtdPlacas > 0
    ? manualQtdPlacas
    : Math.max(1, Math.ceil((potCcAlvo * 1000) / (placaEscolhida?.specs?.potencia_wp || 1)))
  const manualPotCc = ((placaEscolhida?.specs?.potencia_wp || 0) * manualQtd) / 1000
  const manualPotCa = (manualInv?.specs?.potencia_kw || 0) * manualQtdInv
  const manualFci = manualPotCa > 0 ? (manualPotCc / manualPotCa) * 100 : 0
  const manualPreco = placaEscolhida && manualInv
    ? (precoDe(placaEscolhida) * manualQtd) + (precoDe(manualInv) * manualQtdInv)
    : 0

  function handleConfirmarManual() {
    if (!placaEscolhida) { setErro('Escolha uma placa antes.'); return }
    if (!manualInv) { setErro('Escolha o inversor.'); return }
    if (manualQtd < 1) { setErro('Qtd de placas inválida.'); return }
    if (manualQtdInv < 1) { setErro('Qtd de inversores inválida.'); return }

    const isMicro = /^SIW100/i.test(manualInv.modelo || '')

    const payload: any = {
      placa: {
        id: placaEscolhida.id,
        codigo_weg: placaEscolhida.codigo_weg,
        modelo: placaEscolhida.modelo,
        potencia_wp: placaEscolhida.specs?.potencia_wp || 0,
        preco_venda: precoDe(placaEscolhida),
      },
      qtd_placas: manualQtd,
      potencia_cc_kwp: manualPotCc,
      inversor: {
        id: manualInv.id,
        codigo_weg: manualInv.codigo_weg,
        modelo: manualInv.modelo,
        potencia_kw: manualInv.specs?.potencia_kw || 0,
        preco_venda: precoDe(manualInv),
      },
      qtd_inversores: manualQtdInv,
      potencia_ca_kw: manualPotCa,
      fci_pct: manualFci,
      desbalanceamento_kw: 0,
      preco_total_kit_weg: manualPreco,
      kit_id_sugerido: 'manual',
      categoria: isMicro ? 'microinversor' : 'string',
    }

    startTransition(async () => {
      const result = await salvarKitAction(projetoId, payload, categoria || undefined)
      if (result && !result.sucesso) setErro(result.erro || 'Erro ao salvar')
    })
  }

  return (
    <div className="space-y-8">
      {/* Contexto — dados do projeto */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Consumo médio" value={consumoMedio > 0 ? `${consumoMedio.toFixed(0)} kWh/mês` : '—'} />
        <Metric label="Rede CELESC" value={formatarLigacao(padrao.tipo_ligacao)} />
        <Metric label="Disjuntor entrada" value={padrao.amperagem_disjuntor_geral_a ? `${padrao.amperagem_disjuntor_geral_a} A` : '—'} />
        <Metric label="Pot. CC alvo" value={`${potCcAlvo.toFixed(2)} kWp`} highlight editavel>
          <input
            type="number"
            step="0.5"
            min="1"
            max="200"
            value={potCcAlvo}
            onChange={e => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v > 0) setPotCcAlvo(v)
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

          {kitsSugeridos.length === 0 ? (
            <DiagnosticoNenhumKit diagnostico={diagnostico} tipoLigacao={padrao.tipo_ligacao} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {kitsSugeridos.map(kit => (
                <KitSugeridoCard
                  key={kit.id}
                  kit={kit}
                  selecionado={kitEscolhidoId === kit.id}
                  onSelect={() => setKitEscolhidoId(kit.id)}
                />
              ))}
            </div>
          )}

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
                placa={placaEscolhida!}
                inversoresTodos={inversores}
                manualQtdPlacas={manualQtd}
                setManualQtdPlacas={setManualQtdPlacas}
                manualInversorId={manualInversorId}
                setManualInversorId={setManualInversorId}
                manualQtdInv={manualQtdInv}
                setManualQtdInv={setManualQtdInv}
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
  const wp = placa.specs?.potencia_wp || 0
  const area = placa.specs?.area_m2 || 0

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
            <p className="text-2xl font-black text-sol">{wp}</p>
            <p className="text-[10px] text-white/40 uppercase">Wp</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
          <span className="text-white/50">Área: <strong className="text-white">{area.toFixed(2)} m²</strong></span>
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
          <p className="text-sm font-bold text-sol">{kit.pot_cc_kwp.toFixed(2)} kWp</p>
        </div>
        <div>
          <p className="text-[9px] text-white/40 uppercase">CA</p>
          <p className="text-sm font-bold text-weg-azul">{kit.pot_ca_kw.toFixed(2)} kW</p>
        </div>
        <div>
          <p className="text-[9px] text-white/40 uppercase">Carregamento</p>
          <p className={`text-sm font-bold ${
            kit.validacoes.fci_ideal ? 'text-verde' : kit.fci_pct > 145 || kit.fci_pct < 100 ? 'text-coral' : 'text-sol'
          }`}>
            {kit.fci_pct.toFixed(0)}%
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
          <BadgeValidacao ok={kit.validacoes.desbalanceamento_ok} texto={`Δ ${kit.desbalanceamento_kw.toFixed(1)}kW`} />
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
  placa, inversoresTodos,
  manualQtdPlacas, setManualQtdPlacas,
  manualInversorId, setManualInversorId,
  manualQtdInv, setManualQtdInv,
  potCc, potCa, fci, preco,
  tipoLigacao,
  onConfirmar, pending,
}: {
  placa: ProdutoRow
  inversoresTodos: ProdutoRow[]
  manualQtdPlacas: number
  setManualQtdPlacas: (n: number) => void
  manualInversorId: string | null
  setManualInversorId: (id: string | null) => void
  manualQtdInv: number
  setManualQtdInv: (n: number) => void
  potCc: number
  potCa: number
  fci: number
  preco: number
  tipoLigacao: string
  onConfirmar: () => void
  pending: boolean
}) {
  const [mostrarSemEstoque, setMostrarSemEstoque] = useState(false)

  const invVisiveis = mostrarSemEstoque
    ? inversoresTodos
    : inversoresTodos.filter(i => i.disponivel_estoque)

  // Warnings — informativos, não bloqueiam
  const warnings: string[] = []
  if (fci > 0 && fci < 80) warnings.push(`FCI ${fci.toFixed(0)}% — inversor superdimensionado, geração vai desperdiçar potência CA.`)
  if (fci > 145) warnings.push(`FCI ${fci.toFixed(0)}% — inversor subdimensionado demais, vai clipar bastante em pico de sol.`)
  if (tipoLigacao === 'monofasico' && potCa > 8) warnings.push(`Potência CA ${potCa.toFixed(1)} kW ultrapassa o limite CELESC monofásico de 8 kW.`)
  if (manualQtdPlacas > 0 && placa.specs?.potencia_wp === 0) warnings.push('Essa placa está com potência 0 Wp no cadastro. Confere o produto em /admin/catalogo.')

  const inv = inversoresTodos.find(i => i.id === manualInversorId)
  const podeSalvar = !!inv && manualQtdPlacas >= 1 && manualQtdInv >= 1

  return (
    <div className="mt-4 p-4 bg-white/[0.02] border border-sol/25 rounded-lg space-y-4">
      <p className="text-xs text-white/70 leading-relaxed">
        Você monta o kit escolhendo direto <strong>placa (já escolhida acima)</strong>, <strong>qtd de placas</strong>,
        <strong> inversor</strong> e <strong>qtd de inversores</strong>. O sistema calcula FCI e potência automaticamente
        e mostra avisos se algo estiver fora do padrão — mas não bloqueia salvar.
      </p>

      {/* Qtd placas + resultado CC */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Potência CC</p>
          <p className="text-lg font-black text-sol tabular-nums">{potCc.toFixed(2)} kWp</p>
        </div>
        <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Placa</p>
          <p className="text-xs text-white truncate">{placa.modelo}</p>
          <p className="text-[10px] text-white/50">{placa.specs?.potencia_wp || 0} Wp cada</p>
        </div>
      </div>

      {/* Grid de inversores */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
            Escolha o inversor / microinversor ({invVisiveis.length} opções)
          </span>
          <label className="text-[10px] text-white/50 flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={mostrarSemEstoque}
              onChange={e => setMostrarSemEstoque(e.target.checked)}
            />
            mostrar sem estoque
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
          {invVisiveis
            .slice()
            .sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '', 'pt-BR'))
            .map(i => {
              const sel = manualInversorId === i.id
              const isMicro = /^SIW100/i.test(i.modelo || '')
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setManualInversorId(i.id)}
                  className={`text-left p-3 border rounded transition ${
                    sel
                      ? 'bg-sol/15 border-sol/60'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/25'
                  } ${!i.disponivel_estoque ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-white truncate">{i.modelo}</p>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-sol flex-shrink-0">
                      {isMicro ? '🔀 micro' : '⚡ string'}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/50 mt-0.5">{i.codigo_weg} · {i.specs?.potencia_kw || 0} kW</p>
                  {!i.disponivel_estoque && (
                    <p className="text-[10px] text-coral mt-0.5">⚠ sem estoque</p>
                  )}
                </button>
              )
            })}
          {invVisiveis.length === 0 && (
            <p className="col-span-2 text-xs text-white/40 italic text-center py-4">
              Nenhum inversor no catálogo. Cadastre em /admin/catalogo.
            </p>
          )}
        </div>
      </div>

      {/* Qtd inversor + resumo CA + FCI + preço */}
      {inv && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Qtd inversores</span>
              <input
                type="number"
                min={1}
                max={20}
                value={manualQtdInv}
                onChange={e => setManualQtdInv(parseInt(e.target.value) || 1)}
                className="mt-1 w-full px-3 py-2 bg-white/5 border border-white/15 rounded text-white font-bold text-lg"
              />
            </label>
            <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Potência CA</p>
              <p className="text-lg font-black text-weg-azul tabular-nums">{potCa.toFixed(2)} kW</p>
            </div>
            <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">FCI</p>
              <p className={`text-lg font-black tabular-nums ${
                fci >= 100 && fci <= 145 ? 'text-verde' : fci >= 80 ? 'text-sol' : 'text-coral'
              }`}>{fci.toFixed(0)}%</p>
            </div>
            <div className="p-2 bg-white/[0.03] border border-white/10 rounded">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Preço kit WEG</p>
              <p className="text-lg font-black text-white tabular-nums">R$ {preco.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="p-3 bg-sol/5 border border-sol/25 rounded-lg space-y-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-sol/90">⚠ {w}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onConfirmar}
              disabled={pending || !podeSalvar}
              className="px-5 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
            >
              {pending ? 'Salvando...' : '✓ Confirmar kit manual → Lista CA'}
            </button>
          </div>
        </>
      )}
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
    causaMotivo = `Todas as ${d.candidatos_gerados} combinações ficaram fora do FCI aceitável (80% a 145%). A potência CC alvo (${d.pot_cc_real_kwp.toFixed(2)} kWp) não bate com as potências CA disponíveis. Ajuste a potência alvo ou cadastre inversor de outra faixa.`
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
          <span className="text-white tabular-nums">{d.pot_cc_real_kwp.toFixed(2)} kWp</span>

          <span className="text-white/50">Limite CELESC ({tipoLigacao}):</span>
          <span className="text-white tabular-nums">{d.pot_ca_limite_celesc_kw} kW</span>

          <span className="text-white/50">Limite disjuntor entrada:</span>
          <span className="text-white tabular-nums">{d.pot_ca_limite_disjuntor_kw.toFixed(1)} kW</span>

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
