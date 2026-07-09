'use client'

import { useState, useMemo, useTransition } from 'react'
import { salvarKitAction } from '@/app/projetos/[id]/kit/actions'
import { sugerirKits, type KitSugerido } from '@/lib/kit-auto/sugerir-kits'

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
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const [categoria, setCategoria] = useState<CategoriaSistema | null>(
    (kitSalvo?.tipo_projeto as CategoriaSistema) || null
  )
  const [potCcAlvo, setPotCcAlvo] = useState<number>(potCcAlvoAuto)
  const [placaId, setPlacaId] = useState<string | null>(kitSalvo?.placa?.id || null)
  const [kitEscolhidoId, setKitEscolhidoId] = useState<string | null>(null)
  const [mostrarIndisponiveis, setMostrarIndisponiveis] = useState(false)

  const placasVisiveis = mostrarIndisponiveis ? placas : placas.filter(p => p.disponivel_estoque)
  const placaEscolhida = placas.find(p => p.id === placaId)

  const kitsSugeridos = useMemo<KitSugerido[]>(() => {
    if (!placaEscolhida) return []
    return sugerirKits({
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
  }, [placaEscolhida, potCcAlvo, padrao, inversores])

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
            <div className="p-6 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
              ❌ Nenhum kit válido pra essa combinação. Motivos possíveis:
              <ul className="mt-2 ml-4 list-disc text-xs text-white/80 space-y-1">
                <li>Potência alvo excede limite CELESC monofásico (8 kW)</li>
                <li>Disjuntor de entrada insuficiente pra suportar essa potência</li>
                <li>Inversores compatíveis fora de estoque</li>
              </ul>
              <p className="mt-2 text-xs text-white/60">
                Ajuste a potência CC alvo acima ou selecione outra placa.
              </p>
            </div>
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
