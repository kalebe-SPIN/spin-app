'use client'

import { useState, useTransition } from 'react'
import { KitFluxoClient } from './KitFluxoClient'
import { atualizarModoComposicaoAction } from '@/app/projetos/[id]/kit/actions'
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
  precos_produtos: Array<{ preco_venda: number; vigente_de: string }>
}

type UcInfo = {
  uc_ref: string          // 'principal' | valor de beneficiarias[i].uc
  label: string
  titular: string
  consumo_kwh_mes: number
}

type KitPorUcItem = {
  uc_ref: string
  endereco_label?: string | null
  endereco_proprio?: boolean
  padrao_entrada_proprio?: any
  telhado_secoes_proprio?: any[]
  kit_selecionado?: any
  lista_ca_confirmada?: any[]
  lista_complementos_cc?: any
  kit_weg_bruto_total?: number
}

type Props = {
  projetoId: string
  projetoCodigo?: string
  placas: ProdutoRow[]
  inversores: ProdutoRow[]
  padraoPrincipal: any
  tipoTelhadoPrincipal?: string
  potCcAlvoAutoCentralizado: number
  consumoMedioCentralizado: number
  kitSalvoCentralizado: any | null
  modoComposicao: 'centralizado' | 'por_uc'
  ucs: UcInfo[]                     // sempre inclui a UC principal
  kitsPorUc: KitPorUcItem[]         // itens já salvos por UC
}

export function KitPorUcClient(props: Props) {
  const {
    projetoId, placas, inversores, padraoPrincipal, tipoTelhadoPrincipal,
    potCcAlvoAutoCentralizado, consumoMedioCentralizado, kitSalvoCentralizado,
    modoComposicao, ucs, kitsPorUc,
  } = props

  const [modo, setModo] = useState<'centralizado' | 'por_uc'>(modoComposicao)
  const [ucAtivaRef, setUcAtivaRef] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Sem beneficiárias → fluxo padrão (sem toggle)
  if (ucs.length <= 1) {
    return (
      <KitFluxoClient
        projetoId={projetoId}
        placas={placas as any}
        inversores={inversores as any}
        padrao={padraoPrincipal}
        potCcAlvoAuto={potCcAlvoAutoCentralizado}
        consumoMedio={consumoMedioCentralizado}
        kitSalvo={kitSalvoCentralizado}
        tipoTelhado={tipoTelhadoPrincipal}
      />
    )
  }

  function handleAlterarModo(novoModo: 'centralizado' | 'por_uc') {
    if (novoModo === modo) return
    startTransition(async () => {
      const r = await atualizarModoComposicaoAction(projetoId, novoModo)
      if (r.sucesso) {
        setModo(novoModo)
        setUcAtivaRef(null)
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Toggle no topo */}
      <section className="bg-white/[0.03] border border-sol/30 rounded-xl p-5">
        <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-3">
          Como montar o sistema pra {ucs.length} UCs?
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAlterarModo('centralizado')}
            className={`text-left p-4 rounded-lg border transition ${
              modo === 'centralizado'
                ? 'bg-sol/15 border-sol/60 ring-1 ring-sol/40'
                : 'bg-white/[0.02] border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🎯</span>
              <span className="text-sm font-bold text-white">Kit único centralizado</span>
            </div>
            <p className="text-xs text-white/60">
              1 sistema atende o consumo somado ({fmtNum(consumoMedioCentralizado, 0)} kWh/mês)
              e distribui crédito CELESC pras beneficiárias.
            </p>
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAlterarModo('por_uc')}
            className={`text-left p-4 rounded-lg border transition ${
              modo === 'por_uc'
                ? 'bg-sol/15 border-sol/60 ring-1 ring-sol/40'
                : 'bg-white/[0.02] border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🏘️</span>
              <span className="text-sm font-bold text-white">Um kit por UC</span>
            </div>
            <p className="text-xs text-white/60">
              Cada UC tem seu sistema dedicado — dimensionado pelo consumo próprio.
              Cada UC pode ficar no mesmo endereço ou em endereço próprio.
            </p>
          </button>
        </div>
      </section>

      {modo === 'centralizado' ? (
        <KitFluxoClient
          projetoId={projetoId}
          placas={placas as any}
          inversores={inversores as any}
          padrao={padraoPrincipal}
          potCcAlvoAuto={potCcAlvoAutoCentralizado}
          consumoMedio={consumoMedioCentralizado}
          kitSalvo={kitSalvoCentralizado}
          tipoTelhado={tipoTelhadoPrincipal}
        />
      ) : (
        <ModoPorUc
          projetoId={projetoId}
          placas={placas}
          inversores={inversores}
          padraoPrincipal={padraoPrincipal}
          tipoTelhadoPrincipal={tipoTelhadoPrincipal}
          ucs={ucs}
          kitsPorUc={kitsPorUc}
          ucAtivaRef={ucAtivaRef}
          setUcAtivaRef={setUcAtivaRef}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Modo por UC — lista de UCs + configurador da UC ativa
// ═══════════════════════════════════════════════════════════════════════

function ModoPorUc({
  projetoId, placas, inversores, padraoPrincipal, tipoTelhadoPrincipal,
  ucs, kitsPorUc, ucAtivaRef, setUcAtivaRef,
}: {
  projetoId: string
  placas: ProdutoRow[]
  inversores: ProdutoRow[]
  padraoPrincipal: any
  tipoTelhadoPrincipal?: string
  ucs: UcInfo[]
  kitsPorUc: KitPorUcItem[]
  ucAtivaRef: string | null
  setUcAtivaRef: (r: string | null) => void
}) {
  function itemDaUc(ref: string): KitPorUcItem | undefined {
    return kitsPorUc.find(k => k.uc_ref === ref)
  }

  const ucAtiva = ucs.find(u => u.uc_ref === ucAtivaRef)
  const itemAtivo = ucAtivaRef ? itemDaUc(ucAtivaRef) : undefined

  return (
    <div className="space-y-6">
      {/* Lista de UCs */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="bg-sol text-noite w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">1</span>
          Escolha a UC pra configurar o kit
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ucs.map((u) => {
            const item = itemDaUc(u.uc_ref)
            const definido = !!item?.kit_selecionado
            const ativa = ucAtivaRef === u.uc_ref
            return (
              <button
                key={u.uc_ref}
                type="button"
                onClick={() => setUcAtivaRef(u.uc_ref)}
                className={`text-left p-4 rounded-lg border transition ${
                  ativa
                    ? 'bg-sol/15 border-sol/60 ring-1 ring-sol/40'
                    : definido
                      ? 'bg-verde/5 border-verde/30 hover:border-verde/50'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                    {u.uc_ref === 'principal' ? 'Principal' : `UC ${u.uc_ref}`}
                  </span>
                  <span className={`text-[10px] font-bold ${definido ? 'text-verde' : 'text-white/40'}`}>
                    {definido ? '✅ Kit definido' : '⏳ Pendente'}
                  </span>
                </div>
                <p className="text-sm font-bold text-white truncate">{u.titular}</p>
                <p className="text-xs text-white/60 mt-1">
                  {fmtNum(u.consumo_kwh_mes, 0)} kWh/mês
                  {item?.endereco_proprio && item?.endereco_label ? ` · 📍 ${item.endereco_label}` : ''}
                </p>
                {definido && item?.kit_selecionado && (
                  <p className="text-[11px] text-verde/80 mt-2">
                    {item.kit_selecionado.qtd_placas} placas · {fmtNum(item.kit_selecionado.potencia_cc_kwp || 0, 2)} kWp
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* UC ativa — sub-toggle endereço próprio + KitFluxoClient */}
      {ucAtiva && (
        <UcConfigurador
          key={ucAtiva.uc_ref}
          uc={ucAtiva}
          projetoId={projetoId}
          placas={placas}
          inversores={inversores}
          padraoPrincipal={padraoPrincipal}
          tipoTelhadoPrincipal={tipoTelhadoPrincipal}
          itemSalvo={itemAtivo}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Configurador de uma UC — sub-toggle endereço próprio + KitFluxoClient
// ═══════════════════════════════════════════════════════════════════════

function UcConfigurador({
  uc, projetoId, placas, inversores, padraoPrincipal, tipoTelhadoPrincipal, itemSalvo,
}: {
  uc: UcInfo
  projetoId: string
  placas: ProdutoRow[]
  inversores: ProdutoRow[]
  padraoPrincipal: any
  tipoTelhadoPrincipal?: string
  itemSalvo?: KitPorUcItem
}) {
  const [enderecoProprio, setEnderecoProprio] = useState<boolean>(!!itemSalvo?.endereco_proprio)
  const [enderecoLabel, setEnderecoLabel] = useState<string>(itemSalvo?.endereco_label || '')
  const [tipoLigacao, setTipoLigacao] = useState<string>(
    itemSalvo?.padrao_entrada_proprio?.tipo_ligacao || padraoPrincipal?.tipo_ligacao || 'monofasico'
  )
  const [amperagem, setAmperagem] = useState<number>(
    Number(itemSalvo?.padrao_entrada_proprio?.amperagem_disjuntor_geral_a || padraoPrincipal?.amperagem_disjuntor_geral_a || 50)
  )
  const [distancia, setDistancia] = useState<number>(
    Number(itemSalvo?.padrao_entrada_proprio?.distancia_string_qgbt_m || padraoPrincipal?.distancia_string_qgbt_m || 15)
  )
  const [tipoTelhado, setTipoTelhado] = useState<string>(
    itemSalvo?.telhado_secoes_proprio?.[0]?.tipo_cobertura || tipoTelhadoPrincipal || 'fibrocimento'
  )

  // Padrão efetivo pra passar pro KitFluxoClient
  const padraoEfetivo = enderecoProprio ? {
    tipo_ligacao: tipoLigacao,
    amperagem_disjuntor_geral_a: amperagem,
    distancia_string_qgbt_m: distancia,
  } : padraoPrincipal

  const telhadoEfetivo = enderecoProprio ? tipoTelhado : tipoTelhadoPrincipal

  // Consumo alvo da UC — mesma fórmula do page.tsx
  const horasSol = 4.5
  const perdas = 0.20
  const potCcAlvo = uc.consumo_kwh_mes > 0
    ? uc.consumo_kwh_mes / (30 * horasSol * (1 - perdas))
    : 5.0

  return (
    <section className="space-y-6">
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-1">
          Configurando: {uc.uc_ref === 'principal' ? 'UC principal' : `UC ${uc.uc_ref}`}
        </h3>
        <p className="text-xs text-white/50 mb-4">
          {uc.titular} · {fmtNum(uc.consumo_kwh_mes, 0)} kWh/mês
        </p>

        {/* Sub-toggle endereço próprio */}
        <label className="flex items-center gap-2 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={enderecoProprio}
            onChange={(e) => setEnderecoProprio(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-white/80">Esta UC fica em endereço próprio (diferente do principal)</span>
        </label>

        {enderecoProprio && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6 border-l-2 border-sol/30">
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase text-white/40 font-bold tracking-wider">Endereço (referência)</label>
              <input
                type="text"
                value={enderecoLabel}
                onChange={(e) => setEnderecoLabel(e.target.value)}
                placeholder="Ex: Rua Palmeiras, 123 - Centro"
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/40 font-bold tracking-wider">Tipo de ligação</label>
              <select
                value={tipoLigacao}
                onChange={(e) => setTipoLigacao(e.target.value)}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
              >
                <option value="monofasico">Monofásico</option>
                <option value="bifasico">Bifásico</option>
                <option value="trifasico">Trifásico</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/40 font-bold tracking-wider">Disjuntor geral (A)</label>
              <input
                type="number"
                value={amperagem}
                onChange={(e) => setAmperagem(Number(e.target.value))}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/40 font-bold tracking-wider">Distância string→QGBT (m)</label>
              <input
                type="number"
                value={distancia}
                onChange={(e) => setDistancia(Number(e.target.value))}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/40 font-bold tracking-wider">Tipo do telhado</label>
              <select
                value={tipoTelhado}
                onChange={(e) => setTipoTelhado(e.target.value)}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
              >
                <option value="fibrocimento">Fibrocimento</option>
                <option value="metalico">Metálico</option>
                <option value="ceramico">Cerâmico</option>
                <option value="laje">Laje</option>
                <option value="solo">Solo</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* KitFluxoClient parametrizado pra essa UC */}
      <KitFluxoClient
        projetoId={projetoId}
        placas={placas as any}
        inversores={inversores as any}
        padrao={padraoEfetivo}
        potCcAlvoAuto={potCcAlvo}
        consumoMedio={uc.consumo_kwh_mes}
        kitSalvo={itemSalvo?.kit_selecionado || null}
        tipoTelhado={telhadoEfetivo}
        ucRef={uc.uc_ref}
        ucLabel={uc.uc_ref === 'principal' ? 'UC principal' : `UC ${uc.uc_ref}`}
        enderecoProprio={enderecoProprio}
        padraoEntradaProprio={enderecoProprio ? padraoEfetivo : undefined}
        telhadoSecoesProprio={enderecoProprio ? [{ tipo_cobertura: tipoTelhado }] : undefined}
      />
    </section>
  )
}
