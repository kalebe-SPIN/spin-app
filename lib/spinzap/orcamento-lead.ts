import type { createAdminClient } from '@/lib/supabase/admin'
import { TIPOS_REDE_INFO, type TipoRede } from '@/lib/orcamento-rapido/tipos'
import { AUMENTO_GERACAO_MAX_PCT, inversorRecomendado, kwhPorKwpMes, kwpParaConsumo, opcoesDeInversor } from '@/lib/spinzap/dimensionar-fv'
import { calcularFormasPagamento, calcularProposta, paramsToRecord, type FormasPagamento, type ItemLista } from '@/lib/precificacao/calcular'
import { ehTipoSecao, totalSecoes, type SecaoProposta } from '@/lib/propostas/secoes'
import { filtroEstruturaDoTelhado, precificarComplementosCC, type ItemComplementoCC } from '@/lib/kit-auto/complementos-cc'

/**
 * Orçamento fotovoltaico montado pela Laís (Kalebe 2026-10-10) e pelo
 * "Montar proposta" do Spinzap — mesmo motor da proposta formal (catálogo
 * WEG + matriz de margem de parametros_precificacao), pelo servidor.
 * Três jeitos de dimensionar: consumo (kWh/mês), valor da conta (÷ tarifa da
 * fatura ou da base) e configuração pedida (qtd de placas + inversor).
 * Kalebe 2026-10-13: escolha do sistema (string, micro ou híbrido), do modelo
 * do inversor e da placa, e itens extras do catálogo com quantidade:
 *   - complementos/equipamentos WEG → entram no kit (fator WEG, sem Simples)
 *   - materiais CA (cabo CA, disjuntor, DPS, fusível) → lista CA (base impostável)
 * (mesma divisão do fluxo formal: complementos-cc × precificar-lista)
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * Kalebe 2026-10-13: nada de R$/kWh fixo — a tarifa vem da FATURA do cliente
 * (calculada em lib/fatura/tarifa.ts: grupo, horário, subsídios) ou, sem
 * fatura, da mediana das faturas reais lidas (tarifas_extraidas).
 */
export type FonteTarifa = { tarifa_kwh: number; fonte: 'fatura' | 'base'; amostras?: number; subsidio?: string | null }

export type EntradaOrcamentoLead =
  | { modo: 'consumo_kwh'; consumo_kwh: number; tarifa?: FonteTarifa | null }
  | { modo: 'valor_mensal'; valor_mensal: number; tarifa: FonteTarifa }
  | { modo: 'qtd_placas'; qtd_placas: number; inversor_kw?: number | null }

export type TipoSistemaFv = 'string' | 'micro' | 'hibrido'
export const TIPOS_SISTEMA_FV: Array<{ valor: TipoSistemaFv; rotulo: string; subcategoria: string }> = [
  { valor: 'string', rotulo: 'Inversor string', subcategoria: 'inversor_string' },
  { valor: 'micro', rotulo: 'Microinversor', subcategoria: 'microinversor' },
  { valor: 'hibrido', rotulo: 'Híbrido', subcategoria: 'inversor_hibrido' },
]

export type OpcoesKit = {
  tipo_sistema?: TipoSistemaFv
  placa_id?: string | null
  inversor_id?: string | null
  /** string/híbrido: quantos inversores (micro: calculado pelas entradas) */
  inversor_qtd?: number | null
  extras?: Array<{ produto_id: string; qtd: number }>
  /**
   * Kalebe 2026-10-14: com isso, entram no kit os complementos CC da proposta
   * formal (estrutura do tipo de telhado, cabo solar, MC4, disjuntor e DPS CA).
   * Sem isso (Laís), segue só placa + inversor + extras.
   */
  complementos_cc?: { tipo_telhado: string | null }
  /** Kalebe 2026-10-15: gerar X% a mais que o consumo (aumento previsto) — consumo/valor da conta */
  aumento_geracao_pct?: number | null
  /** Kalebe 2026-10-17: unidades beneficiárias (o consumo delas soma no dimensionamento) */
  beneficiarias?: { qtd: number; consumo_kwh: number } | null
}

export type ComplementosOrcamento = { tipo_telhado: string | null; itens: ItemComplementoCC[]; total: number; avisos: string[] }

export type ExtraOrcamento = { produto_id: string; descricao: string; categoria: string; qtd: number; destino: 'kit' | 'lista_ca' }

export type OrcamentoLead = {
  entrada: EntradaOrcamentoLead
  tipo_sistema: TipoSistemaFv
  tipo_rede: TipoRede
  cidade: string | null
  kwp: number
  qtd_placas: number
  placa: { id: string; modelo: string; potencia_wp: number; area_m2: number | null }
  inversor: { id: string; modelo: string; potencia_kw: number; fases: 'mono' | 'bi' | 'tri' | null; qtd: number; entradas: number | null }
  extras: ExtraOrcamento[]
  /** Estrutura + materiais CC (só quando pedido em opcoes.complementos_cc) */
  complementos?: ComplementosOrcamento | null
  /** Aumento extra de geração aplicado (% sobre o consumo) */
  aumento_geracao_pct?: number
  consumo_kwh_mes: number | null
  geracao_kwh_mes: number
  pv_total: number
  formas_pagamento: FormasPagamento
  /** Interno (dupla visão): não vai pro cliente */
  interno: {
    margem_pct: number; desconto_max_negociacao: number
    /** Kalebe 2026-10-16: custos da proposta (fluxo de caixa da venda fechada pelo Spinzap) */
    custos?: { kit: number; comissao: number; imposto: number; instalacao: number; frete: number; projeto_art: number; materiais: number }
  }
  premissas: string[]
  /** Seções incorporadas (aluguel, alvenaria…) — já somadas em pv_total */
  secoes?: SecaoProposta[]
  /** Só o sistema fotovoltaico, sem as seções */
  pv_sistema?: number
}

/**
 * Soma as seções incorporadas (valor ao cliente) ao orçamento e refaz as
 * formas de pagamento sobre o total (Kalebe 2026-10-13: seções dentro das propostas).
 */
export async function aplicarSecoes(admin: Admin, orc: OrcamentoLead, secoes?: SecaoProposta[] | null): Promise<OrcamentoLead> {
  const validas = (secoes || []).filter((s) => ehTipoSecao(s.tipo) && Number(s.valor) > 0)
  if (!validas.length) return { ...orc, secoes: [], pv_sistema: orc.pv_total }
  const { data } = await admin.from('parametros_precificacao')
    .select('chave, valor_numero, valor_json, unidade').is('vigente_ate', null).eq('ativo', true)
  const total = Math.round((orc.pv_total + totalSecoes(validas)) * 100) / 100
  return { ...orc, secoes: validas, pv_sistema: orc.pv_total, pv_total: total, formas_pagamento: calcularFormasPagamento(total, paramsToRecord(data || [])) }
}

/** Perfil (monofásico/bifásico/trifásico) → rede do catálogo. SC: trifásico 220/380 V. */
export function tipoRedeDoPerfil(t: string | null | undefined): TipoRede {
  if (t === 'trifasico') return 'tri_380'
  if (t === 'bifasico') return 'bi_220'
  return 'mono_220'
}


// ── Catálogo ──

export type ProdutoCatalogo = {
  id: string
  modelo: string
  descricao: string
  categoria: string
  subcategoria: string | null
  preco_venda: number
  disponivel: boolean
  potencia_wp: number | null
  potencia_kw: number | null
  area_m2: number | null
  fases: 'mono' | 'bi' | 'tri' | null
  tensao_v: 220 | 380 | null
  entradas: number | null
}

/** Categorias do catálogo que vão pra lista CA (base impostável); o resto é kit WEG. */
const CATEGORIAS_LISTA_CA = ['cabo_ca', 'disjuntor', 'dps']
export const destinoDoExtra = (p: { categoria: string; subcategoria: string | null }): 'kit' | 'lista_ca' =>
  CATEGORIAS_LISTA_CA.includes(p.categoria) || p.subcategoria === 'fusivel' ? 'lista_ca' : 'kit'

function deduzirFases(tipoDesc: string): { fases: 'mono' | 'bi' | 'tri' | null; tensao: 220 | 380 | null } {
  const t = tipoDesc.toLowerCase()
  return {
    fases: /trif[aá]s/.test(t) ? 'tri' : /bif[aá]s/.test(t) ? 'bi' : /monof[aá]s/.test(t) ? 'mono' : null,
    tensao: t.includes('380') ? 380 : t.includes('220') ? 220 : null,
  }
}

/** Produtos ativos com preço vigente (> 0), já com potência/fases/entradas. */
export async function carregarCatalogoProposta(admin: Admin): Promise<ProdutoCatalogo[]> {
  const { data } = await admin.from('produtos')
    .select('id, modelo, descricao_curta, categoria, subcategoria, specs, disponivel_estoque, sob_cotacao, precos_produtos!inner(preco_venda, vigente_ate)')
    .eq('ativo', true)
    .is('precos_produtos.vigente_ate', null)
  return ((data || []) as any[])
    .map((p) => {
      const s = (p.specs || {}) as Record<string, any>
      const preco = Array.isArray(p.precos_produtos) ? p.precos_produtos[0] : p.precos_produtos
      const { fases, tensao } = deduzirFases(String(s.tensao_desc || ''))
      const descricao = String(p.descricao_curta || p.modelo || '')
      // Importação antiga gravou a potência no lugar do modelo (micro "700") —
      // nesse caso o nome comercial está na descrição ("SIW100G M024 W10").
      const modeloBruto = String(p.modelo || '')
      const modelo = /^\d+([.,/]\d+)*$/.test(modeloBruto.trim()) && descricao ? descricao : modeloBruto
      return {
        id: p.id as string,
        modelo,
        descricao,
        categoria: String(p.categoria || ''),
        subcategoria: (p.subcategoria as string) || null,
        preco_venda: Number(preco?.preco_venda) || 0,
        disponivel: p.disponivel_estoque !== false,
        potencia_wp: Number(s.potencia_wp) || null,
        potencia_kw: Number(s.potencia_kw) || null,
        area_m2: Number(s.area_m2) || null,
        fases, tensao_v: tensao,
        entradas: Number(s.entradas_mppt) || null,
        _cotacao: !!p.sob_cotacao,
      }
    })
    .filter((p) => p.preco_venda > 0 && !(p as any)._cotacao)
    .map(({ _cotacao, ...p }: any) => p as ProdutoCatalogo)
}

export async function montarOrcamentoLead(admin: Admin, e: {
  entrada: EntradaOrcamentoLead
  tipo_rede_perfil: string | null
  cidade: string | null
  opcoes?: OpcoesKit
}): Promise<OrcamentoLead | { erro: string }> {
  const tipo_rede = tipoRedeDoPerfil(e.tipo_rede_perfil)
  const rede = TIPOS_REDE_INFO[tipo_rede]
  const op = e.opcoes || {}
  const tipoSistema: TipoSistemaFv = op.tipo_sistema || 'string'
  const premissas: string[] = []
  const catalogo = await carregarCatalogoProposta(admin)

  // ── Placa ──
  const placas = catalogo.filter((p) => p.categoria === 'placa' && p.potencia_wp && p.disponivel).sort((a, b) => a.potencia_wp! - b.potencia_wp!)
  const placa = (op.placa_id && catalogo.find((p) => p.id === op.placa_id && p.categoria === 'placa' && p.potencia_wp)) || placas[placas.length - 1]
  if (!placa) return { erro: 'Nenhuma placa disponível no catálogo' }

  // ── Potência alvo ──
  let consumo: number | null = null
  let kwpAlvo = 0
  const rotuloTarifa = (t: FonteTarifa) =>
    `Tarifa de R$ ${t.tarifa_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}/kWh ${
      t.fonte === 'fatura' ? 'calculada da sua fatura' : `(referência de ${t.amostras || 'várias'} faturas reais)`}${
      t.subsidio && t.subsidio !== 'nenhum' ? `, com ${t.subsidio.replace('_', ' ')}` : ''}`
  let qtdPlacas = 0
  // Kalebe 2026-10-15: aumento extra de geração (% sobre o consumo)
  const aumento = Math.min(Math.max(Math.round(Number(op.aumento_geracao_pct) || 0), 0), AUMENTO_GERACAO_MAX_PCT)
  // Kalebe 2026-10-17: unidades beneficiárias somam no consumo
  const benef = op.beneficiarias && op.beneficiarias.consumo_kwh > 0 ? op.beneficiarias : null
  const premissaBenef = () => {
    if (benef) premissas.push(`Inclui ${benef.qtd} unidade${benef.qtd === 1 ? '' : 's'} beneficiária${benef.qtd === 1 ? '' : 's'}: +${Math.round(benef.consumo_kwh)} kWh/mês`)
  }
  if (e.entrada.modo === 'consumo_kwh') {
    consumo = e.entrada.consumo_kwh + (benef?.consumo_kwh || 0)
    kwpAlvo = kwpParaConsumo(consumo, e.cidade, aumento)
    premissas.push(`Consumo médio de ${Math.round(e.entrada.consumo_kwh)} kWh/mês`)
    premissaBenef()
    if (e.entrada.tarifa?.tarifa_kwh) premissas.push(rotuloTarifa(e.entrada.tarifa))
  } else if (e.entrada.modo === 'valor_mensal') {
    if (!(e.entrada.tarifa?.tarifa_kwh > 0)) return { erro: 'Sem tarifa pra converter o valor da conta em kWh (precisa da fatura ou da base de tarifas)' }
    const doValor = e.entrada.valor_mensal / e.entrada.tarifa.tarifa_kwh
    consumo = doValor + (benef?.consumo_kwh || 0)
    kwpAlvo = kwpParaConsumo(consumo, e.cidade, aumento)
    premissas.push(`Conta média de R$ ${e.entrada.valor_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (≈ ${Math.round(doValor)} kWh/mês)`)
    premissaBenef()
    premissas.push(rotuloTarifa(e.entrada.tarifa))
  } else {
    qtdPlacas = Math.max(1, Math.round(e.entrada.qtd_placas))
    premissas.push(`Configuração pedida: ${qtdPlacas} placas${e.entrada.inversor_kw ? ` e inversor de ~${e.entrada.inversor_kw} kW` : ''}`)
  }
  if (!qtdPlacas) {
    if (!(kwpAlvo > 0)) return { erro: 'Não deu pra calcular a potência' }
    qtdPlacas = Math.ceil((kwpAlvo * 1000) / placa.potencia_wp!)
  }
  const kwp = (qtdPlacas * placa.potencia_wp!) / 1000

  // ── Inversor ──
  // Rede bifásica usa inversor monofásico 220 V (não existe "bifásico" no catálogo WEG)
  const nFases = rede.fases === 'tri' ? 3 : rede.fases === 'bi' ? 2 : 1
  const fasesInv = rede.fases === 'bi' ? 'mono' : rede.fases
  const tensaoInv = rede.fases === 'bi' ? 220 : rede.tensao
  const subcat = TIPOS_SISTEMA_FV.find((t) => t.valor === tipoSistema)!.subcategoria
  const inversores = catalogo.filter((p) => p.categoria === 'inversor' && p.subcategoria === subcat && p.potencia_kw && p.disponivel)
  let inversor: ProdutoCatalogo | undefined
  let invQtd = 1
  // Mesmo dimensionamento da prévia da tela (lib/spinzap/dimensionar-fv.ts)
  const kitDim = { kwp, qtdPlacas, sistema: tipoSistema, nFases }
  if (tipoSistema === 'micro') {
    // Micro é sempre monofásico 220 V; qtd = placas ÷ entradas, múltiplo do nº de fases (balanceado)
    const ops = opcoesDeInversor(inversores.filter((p) => p.fases !== 'tri'), kitDim)
    // Sem escolha: o que fica na faixa de 80–145% e, entre esses, o de menor custo total
    const op1 = (op.inversor_id && ops.find((o) => o.inv.id === op.inversor_id)) || inversorRecomendado(ops, 'micro')
    if (!op1) return { erro: 'Nenhum microinversor disponível no catálogo' }
    inversor = op1.inv; invQtd = op1.qtd
  } else {
    const compat = inversores.filter((p) => (!fasesInv || p.fases === fasesInv) && (!tensaoInv || !p.tensao_v || p.tensao_v === tensaoInv))
    if (op.inversor_id) {
      inversor = inversores.find((p) => p.id === op.inversor_id)
      // Escolhido sem quantidade: a que o kit pede
      if (inversor) invQtd = opcoesDeInversor([inversor], kitDim)[0]?.qtd || 1
    } else if (e.entrada.modo === 'qtd_placas' && e.entrada.inversor_kw) {
      const alvo = e.entrada.inversor_kw
      inversor = [...compat].sort((a, b) => Math.abs(a.potencia_kw! - alvo) - Math.abs(b.potencia_kw! - alvo))[0]
    } else {
      // O menor que atende sozinho; sistema grande → vários do maior modelo (~130% CC/CA)
      const rec = inversorRecomendado(opcoesDeInversor(compat, kitDim), tipoSistema)
      if (rec) { inversor = rec.inv; invQtd = rec.qtd }
    }
    if (!inversor) return { erro: `Nenhum ${tipoSistema === 'hibrido' ? 'inversor híbrido' : 'inversor string'} compatível com a rede ${rede.label} no catálogo` }
    if (op.inversor_qtd && op.inversor_qtd > 0) invQtd = Math.round(op.inversor_qtd)
  }

  // ── Extras (categoria → item → quantidade) ──
  const extras: ExtraOrcamento[] = []
  const itensCa: ItemLista[] = []
  let kitExtras = 0
  for (const x of op.extras || []) {
    const p = catalogo.find((c) => c.id === x.produto_id)
    const qtd = Math.round(Number(x.qtd))
    if (!p || !(qtd > 0)) continue
    const destino = destinoDoExtra(p)
    extras.push({ produto_id: p.id, descricao: p.descricao || p.modelo, categoria: p.categoria, qtd, destino })
    if (destino === 'lista_ca') itensCa.push({ descricao: p.descricao || p.modelo, qtd, preco_unitario: p.preco_venda, categoria: p.categoria })
    else kitExtras += p.preco_venda * qtd
  }

  // ── Complementos CC (estrutura do telhado, cabo solar, MC4, disjuntor, DPS) ──
  // Mesma conta da proposta formal: entram no kit WEG bruto.
  let complementos: ComplementosOrcamento | null = null
  if (op.complementos_cc) {
    const fasesKit = { mono: 'monofasico', bi: 'bifasico', tri: 'trifasico' } as const
    const r = await precificarComplementosCC(admin, {
      qtd_placas: qtdPlacas,
      tipo_telhado: op.complementos_cc.tipo_telhado,
      distancia_string_qgbt_m: 0,
      inversores: [{ id: inversor.id, modelo: inversor.modelo, potencia_kw: inversor.potencia_kw!, fases: inversor.fases ? fasesKit[inversor.fases] : undefined, qtd: invQtd }],
      tipo_ligacao_cliente: e.tipo_rede_perfil || 'monofasico',
    })
    complementos = { tipo_telhado: op.complementos_cc.tipo_telhado, itens: r.itens, total: Math.round(r.total * 100) / 100, avisos: r.avisos }
  }

  const { data: linhas } = await admin.from('parametros_precificacao')
    .select('chave, valor_numero, valor_json, unidade').is('vigente_ate', null).eq('ativo', true)
  const params = paramsToRecord(linhas || [])
  const kitBruto = placa.preco_venda * qtdPlacas + inversor.preco_venda * invQtd + kitExtras + (complementos?.total || 0)
  const proposta = calcularProposta({
    placa: { qtd: qtdPlacas, preco_venda_unitario: placa.preco_venda, modelo: placa.modelo, potencia_wp: placa.potencia_wp! },
    inversor: { qtd: invQtd, preco_venda_unitario: inversor.preco_venda, modelo: inversor.modelo, potencia_kw: inversor.potencia_kw! },
    itens_ca: itensCa,
    potencia_kwp: kwp,
    distancia_km_extra: 0,
    tipo_projeto: tipoSistema === 'hibrido' ? 'fv_hibrido' : 'fv_ongrid',
    subtotal_kit_weg_bruto_override: kitBruto,
  }, params)

  if (aumento > 0 && consumo) premissas.push(`Geração dimensionada ${aumento}% acima do consumo atual (aumento previsto)`)
  premissas.push(`Rede ${rede.label}`)
  if (tipoSistema === 'micro') premissas.push('Sistema com microinversores (um por grupo de placas, distribuídos entre as fases)')
  if (tipoSistema === 'hibrido') premissas.push('Sistema híbrido (pronto pra baterias)')
  if (complementos) {
    const tel = filtroEstruturaDoTelhado(complementos.tipo_telhado)
    premissas.push(tel.cotarAParte
      ? 'Cabos solares, conectores e proteções CA inclusos'
      : `Estrutura de fixação${complementos.tipo_telhado ? ` para telhado ${tel.rotulo}` : ''}, cabos solares, conectores e proteções CA inclusos`)
  }
  if (e.cidade) premissas.push(`Irradiação de ${e.cidade}`)
  return {
    entrada: e.entrada,
    tipo_sistema: tipoSistema,
    tipo_rede,
    cidade: e.cidade,
    kwp,
    qtd_placas: qtdPlacas,
    placa: { id: placa.id, modelo: placa.modelo, potencia_wp: placa.potencia_wp!, area_m2: placa.area_m2 },
    inversor: { id: inversor.id, modelo: inversor.modelo, potencia_kw: inversor.potencia_kw!, fases: inversor.fases, qtd: invQtd, entradas: inversor.entradas },
    extras,
    complementos,
    aumento_geracao_pct: consumo ? aumento : 0,
    consumo_kwh_mes: consumo,
    geracao_kwh_mes: Math.round(kwp * kwhPorKwpMes(e.cidade)),
    pv_total: Math.round(proposta.pv_total * 100) / 100,
    formas_pagamento: proposta.formas_pagamento,
    interno: {
      margem_pct: proposta.memoria_calculo.margem_pct, desconto_max_negociacao: proposta.desconto_max_negociacao,
      custos: {
        kit: proposta.kit_weg_com_fator, comissao: proposta.comissao_vendedor, imposto: proposta.impostos_simples,
        instalacao: proposta.instalacao, frete: proposta.frete, projeto_art: proposta.projeto_art, materiais: proposta.subtotal_lista_ca,
      },
    },
    premissas,
  }
}
