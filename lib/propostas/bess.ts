import { getNum, type ParametrosVigentes } from '@/lib/precificacao/calcular'

/**
 * Precificação do kit BESS puro (Kalebe 2026-09-09) — a mesma fórmula da
 * tela /projetos/[id]/bess/proposta, num lugar só pra tela e pro Spinzap:
 *   kit_bess_bruto  = Σ(placas + baterias + controladoras + medidores + caixas + opcionais)
 *   kit_com_fator   = kit_bess_bruto × fator WEG (pass-through)
 *   base_impostavel = Lista CA + frete + projeto/ART + instalação
 *   PV = (kit_com_fator × (1 − imp%) + base) / (1 − (marg% + com% + imp%))
 * Instalação: R$ 1.200/inversor + R$ 200/bateria (bess_mo_por_*).
 */

export type ItemKitBess = { id: string; marca?: string | null; modelo: string; potencia_kw?: number | null; qtd: number; preco_venda: number }

export type KitBess = {
  placas: ItemKitBess[]
  baterias: ItemKitBess[]
  controladoras: ItemKitBess[]
  medidores: ItemKitBess[]
  caixas_juncao: ItemKitBess[]
  opcionais: ItemKitBess[]
  lista_ca: ItemKitBess[]
}

export type CalculoBess = {
  kit_bess_bruto: number
  kit_com_fator: number
  subtotal_lista_ca: number
  frete: number
  projeto_art: number
  potencia_ca_total_kw: number
  instalacao: number
  qtd_inversor: number
  qtd_bateria: number
  base_impostavel: number
  pv_total: number
  margem: number
  comissao: number
  imposto: number
  desconto_max: number
  margem_pct: number
  comissao_pct: number
  impostos_pct: number
  fator_kit: number
}

export const MIN_PLACAS_BESS = 2

const toArr = (x: any): ItemKitBess[] => (Array.isArray(x) ? x : x?.id ? [x] : [])

/** Normaliza o kit salvo (formato antigo single ou arrays). */
export function normalizarKitBess(kit: any): KitBess {
  return {
    placas: toArr(kit?.placas),
    baterias: toArr(kit?.baterias ?? kit?.bateria),
    controladoras: toArr(kit?.controladoras ?? kit?.controladora),
    medidores: toArr(kit?.medidores ?? kit?.medidor),
    caixas_juncao: toArr(kit?.caixas_juncao),
    opcionais: toArr(kit?.opcionais),
    lista_ca: toArr(kit?.lista_ca),
  }
}

/** O que falta pro kit valer (mesmas regras do salvarKitBessAction). */
export function pendenciaKitBess(k: KitBess): string | null {
  if (!k.baterias.length) return 'Adicione pelo menos 1 bateria'
  if (!k.controladoras.length) return 'Adicione pelo menos 1 controladora / inversor híbrido'
  if (!k.medidores.length) return 'Adicione pelo menos 1 medidor'
  const placas = k.placas.reduce((s, p) => s + (Number(p.qtd) || 0), 0)
  if (placas < MIN_PLACAS_BESS) return `Mínimo de ${MIN_PLACAS_BESS} placas por questão tributária`
  return null
}

export function calcularBessPuro(kitBruto: any, params: ParametrosVigentes, ajuste?: { margem_pct?: number | null; comissao_pct?: number | null }): CalculoBess {
  const k = normalizarKitBess(kitBruto)
  const linha = (i: ItemKitBess) => (Number(i?.preco_venda) || 0) * (Number(i?.qtd) || 1)
  const soma = (arr: ItemKitBess[]) => arr.reduce((s, i) => s + linha(i), 0)
  const kitBruto2 = soma(k.placas) + soma(k.baterias) + soma(k.controladoras) + soma(k.medidores) + soma(k.caixas_juncao) + soma(k.opcionais)
  const subtotalListaCa = soma(k.lista_ca)
  const fator = getNum(params, 'fator_kit_weg_preco_cliente', 0.4182)
  const kitComFator = kitBruto2 * fator

  const frete = getNum(params, 'frete_ate_16_placas', 300)
  const qtdInversor = k.controladoras.reduce((s, c) => s + (Number(c?.qtd) || 0), 0)
  const qtdBateria = k.baterias.reduce((s, b) => s + (Number(b?.qtd) || 0), 0)
  const potenciaCa = k.controladoras.reduce((s, c) => s + (Number(c?.qtd) || 0) * (Number(c?.potencia_kw) || 0), 0)
  const projetoAte30 = getNum(params, 'projeto_valor_fixo_ate_30kwp', 400)
  const projetoAcima = getNum(params, 'projeto_rs_por_kwp_acima_30kwp', 30)
  const projetoArt = potenciaCa <= 30 ? projetoAte30 : projetoAte30 + (potenciaCa - 30) * projetoAcima
  const instalacao = qtdInversor * getNum(params, 'bess_mo_por_inversor', 1200) + qtdBateria * getNum(params, 'bess_mo_por_bateria', 200)
  const base = subtotalListaCa + frete + projetoArt + instalacao

  const margemPct = ajuste?.margem_pct ?? getNum(params, 'margem_contribuicao_perc', 20)
  const comissaoPct = ajuste?.comissao_pct ?? getNum(params, 'comissao_vendedor_perc', 5)
  const impostosPct = getNum(params, 'aliquota_simples_perc', 15)
  const divisor = 1 - (margemPct + comissaoPct + impostosPct) / 100
  const pv = kitBruto2 + base > 0 && divisor > 0.05 ? (kitComFator * (1 - impostosPct / 100) + base) / divisor : 0
  const margemMin = getNum(params, 'margem_minima_negociacao_perc', 15)
  const divMin = 1 - (margemMin + comissaoPct + impostosPct) / 100
  const pvMin = divMin > 0.05 ? (kitComFator * (1 - impostosPct / 100) + base) / divMin : pv

  return {
    kit_bess_bruto: kitBruto2,
    kit_com_fator: kitComFator,
    subtotal_lista_ca: subtotalListaCa,
    frete,
    projeto_art: projetoArt,
    potencia_ca_total_kw: potenciaCa,
    instalacao,
    qtd_inversor: qtdInversor,
    qtd_bateria: qtdBateria,
    base_impostavel: base,
    pv_total: Math.round(pv * 100) / 100,
    margem: pv * (margemPct / 100),
    comissao: pv * (comissaoPct / 100),
    imposto: Math.max(0, pv - kitComFator) * (impostosPct / 100),
    desconto_max: Math.max(0, pv - pvMin),
    margem_pct: margemPct,
    comissao_pct: comissaoPct,
    impostos_pct: impostosPct,
    fator_kit: fator,
  }
}
