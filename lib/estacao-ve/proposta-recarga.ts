import { deduzirFasesPorPotencia, type FasesRede } from './montar-lista-ca'
import { totalSecoes, type SecaoProposta } from '@/lib/propostas/secoes'

/**
 * Proposta da estação de recarga (Kalebe 2026-10-14) — composição na ordem
 * EQUIPAMENTOS → PROJETO → EXECUÇÃO, e por cima margem + imposto + comissão.
 *
 *  - Equipamentos: carregadores e opcionais (totem, suporte…) com o custo
 *    informado; revenda — não entram na nota Spin (sem imposto).
 *  - Projeto: diagramas unifilar + trifilar (parâmetros de diagramas).
 *  - Execução: materiais elétricos dimensionados pela potência e pela
 *    distância até o ponto de conexão (padrão 5 m), conforme as respostas
 *    (eletroduto externo, intervenção na alvenaria, infraestrutura embutida),
 *    aterramento, mão de obra dos instaladores e deslocamento.
 *  - Preço: mesmo método invertido da proposta fotovoltaica (calcular.ts):
 *      PV = [equip·(1 − i) + base] / (1 − (m + c + i))
 *    com imposto i só sobre a nota Spin (PV − equipamentos).
 *
 * Módulo puro (sem banco): roda no servidor e pode rodar no navegador.
 */

export type TipoEquipamentoRecarga = 'carregador' | 'opcional'

export type EquipamentoRecarga = {
  produto_id: string | null
  modelo: string
  tipo: TipoEquipamentoRecarga
  /** kW do carregador (opcional = 0) */
  potencia_kw: number
  qtd: number
  /** Custo Spin por unidade (R$) */
  preco_unitario: number
  /**
   * Kalebe 2026-10-15: orçar sem equipamento — o carregador é do cliente.
   * Só a potência importa (dimensiona cabo, disjuntor e DPS); não entra no preço.
   */
  do_cliente?: boolean
}

/**
 * Trechos do caminho até o ponto de conexão, por tipo de intervenção
 * (Kalebe 2026-10-15: "a instalação é de 30 m, mas 13 m será subterrâneo —
 * abrir vala, passar tubulação e concretar — e o restante por eletroduto externo").
 */
export type TipoTrecho = 'externo' | 'subterraneo' | 'embutido' | 'alvenaria'
export type TrechoRecarga = {
  tipo: TipoTrecho
  metros: number
  /** Subterrâneo: recompor o piso em concreto depois de fechar a vala */
  concretagem?: boolean
}
export const TIPOS_TRECHO: Array<{ tipo: TipoTrecho; rotulo: string; detalhe: string }> = [
  { tipo: 'externo', rotulo: 'Eletroduto externo (aparente)', detalhe: 'eletroduto rígido fixado na parede, com abraçadeiras, luvas e curvas' },
  { tipo: 'subterraneo', rotulo: 'Subterrâneo (vala)', detalhe: 'abrir vala, passar a tubulação e fechar' },
  { tipo: 'embutido', rotulo: 'Tubulação embutida existente', detalhe: 'passagem dos cabos pela tubulação que já existe' },
  { tipo: 'alvenaria', rotulo: 'Embutir na alvenaria', detalhe: 'rasgos e recomposição da parede' },
]

export type RespostasRecarga = {
  /** Metros até o ponto de conexão (quadro) — padrão do parâmetro. Com trechos, é a soma deles. */
  distancia_m: number
  /** null = deduz pela potência do carregador */
  fases: FasesRede | null
  eletroduto_externo: boolean
  alvenaria: boolean
  infra_embutida: boolean
  aterramento: boolean
  /** km de ida até o cliente (o cálculo dobra pra ida + volta) */
  km_deslocamento: number
  /** Metragem por tipo de intervenção (quando há, manda sobre distância e marcações acima) */
  trechos?: TrechoRecarga[]
}

/**
 * Trechos da resposta. Proposta antiga (sem trechos): um trecho com a
 * distância, pelo tipo marcado — mesmo resultado de antes.
 */
export function trechosDaResposta(r: RespostasRecarga): TrechoRecarga[] {
  if (r.trechos?.length) return r.trechos.filter((t) => Number(t.metros) > 0)
  const m = Number(r.distancia_m) || 0
  if (!(m > 0)) return []
  const tipo: TipoTrecho | null = r.eletroduto_externo ? 'externo' : r.infra_embutida ? 'embutido' : r.alvenaria ? 'alvenaria' : null
  return tipo ? [{ tipo, metros: m }] : []
}

/** Dimensionamento elétrico por circuito (o que a tela mostra) */
export type CircuitoDimensionado = {
  potencia_kw: number
  qtd: number
  corrente_a: number
  bitola_mm2: number
  disjuntor_a: number
  polos: number
  dps_un: number
  condutores: number
  metros_cabo: number
}

export type EntradaRecarga = {
  equipamentos: EquipamentoRecarga[]
  respostas: RespostasRecarga
  /** Só admin: ajuste de margem/comissão (null = parâmetro) */
  margem_pct?: number | null
  comissao_pct?: number | null
  /** Seções incorporadas (aluguel, alvenaria, elétrica predial…) — valor ao cliente */
  secoes?: SecaoProposta[]
}

export type ParametrosRecarga = {
  diagrama_unifilar: number
  diagrama_trifilar: number
  diaria_eletrica: number
  horas_por_diaria: number
  instaladores: number
  horas_por_carregador: number
  dias_extra_alvenaria: number
  distancia_padrao_m: number
  valor_km: number
  margem_pct: number
  comissao_pct: number
  imposto_pct: number
  margem_minima_pct: number
  /** Kalebe 2026-10-15 — trecho subterrâneo, custo por metro (0 = ainda não definido no painel) */
  vala_m: number
  tubo_subterraneo_m: number
  concretagem_m: number
}

export type GrupoMaterial = 'protecao' | 'cabos' | 'infra' | 'aterramento'
export type LinhaMaterial = {
  codigo: string
  descricao: string
  grupo: GrupoMaterial
  qtd: number
  unidade: 'un' | 'm' | 'barra'
  preco_unitario: number
  origem: 'catalogo' | 'referencia' | 'parametro'
}
export type LinhaServico = { chave: string; descricao: string; detalhe: string; valor: number }

export type PropostaRecarga = {
  equipamentos: Array<EquipamentoRecarga & { subtotal: number }>
  materiais: LinhaMaterial[]
  projeto: LinhaServico[]
  execucao: LinhaServico[]
  subtotal_equipamentos: number
  subtotal_projeto: number
  subtotal_materiais: number
  subtotal_servicos_execucao: number
  subtotal_execucao: number
  custo_total: number
  base_impostavel: number
  pv_total: number
  margem: number
  comissao: number
  imposto: number
  desconto_max: number
  margem_pct: number
  comissao_pct: number
  imposto_pct: number
  qtd_carregadores: number
  potencia_total_kw: number
  fases: FasesRede
  corrente_total_a: number
  /** Seções incorporadas: somam no total geral (já são valor ao cliente) */
  secoes: SecaoProposta[]
  total_secoes: number
  /** Estação (pv_total) + seções — o que o cliente paga */
  total_geral: number
  avisos: string[]
  /** Cabo, disjuntor e DPS de cada circuito, pela potência */
  circuitos: CircuitoDimensionado[]
  /** Disjuntor geral da estação (mais de um circuito) */
  disjuntor_geral_a: number | null
  /** Trechos considerados e a distância total */
  trechos: TrechoRecarga[]
  distancia_total_m: number
  /** Custos que faltam definir no painel — sem eles não gera o PDF (preço sairia baixo) */
  pendencias_custo: string[]
}

/**
 * Preços de referência dos materiais — os mesmos já usados no sistema
 * (montar-lista-ca.ts da estação e precos-estimados.ts da lista CA do FV).
 * Quando o catálogo tem o item (ex.: disjuntor MDWP-C40-2), vale o catálogo.
 */
const REF = {
  disjuntor_bipolar: 55,
  disjuntor_tripolar: 90,
  dps_classe2: 45,
  quadro_dedicado: 180,
  cabo_m_por_bitola: { 4: 6, 6: 8, 10: 12, 16: 18, 25: 28 } as Record<number, number>,
  eletroduto_barra: { '3/4"': 12, '1"': 15, '1.1/4"': 22, '1.1/2"': 30 } as Record<string, number>,
  abracadeira: { '3/4"': 1.8, '1"': 2.2, '1.1/4"': 3.0, '1.1/2"': 3.8 } as Record<string, number>,
  luva: { '3/4"': 2.5, '1"': 3.0, '1.1/4"': 4.5, '1.1/2"': 6 } as Record<string, number>,
  curva: { '3/4"': 3, '1"': 4.5, '1.1/4"': 7, '1.1/2"': 10 } as Record<string, number>,
  condulete: 18,
  haste: 65,
  conector_terra: 18,
  caixa_inspecao: 28,
  cabo_nu_16_m: 18,
} as const

const FAIXAS_DISJUNTOR_A = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200]
const disjuntorPara = (a: number) => FAIXAS_DISJUNTOR_A.find((f) => a <= f) ?? 250
function bitolaPara(correnteA: number): number {
  if (correnteA <= 20) return 4
  if (correnteA <= 32) return 6
  if (correnteA <= 50) return 10
  if (correnteA <= 80) return 16
  if (correnteA <= 100) return 25
  return 35
}
function eletrodutoPara(bitolaMm2: number): string {
  if (bitolaMm2 <= 6) return '3/4"'
  if (bitolaMm2 <= 10) return '1"'
  if (bitolaMm2 <= 16) return '1.1/4"'
  return '1.1/2"'
}

const ROTULO_FASES: Record<FasesRede, string> = { monofasico: 'monofásico', bifasico: 'bifásico', trifasico: 'trifásico' }
const br = (n: number, c = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })

export function calcularPropostaRecarga(
  e: EntradaRecarga,
  p: ParametrosRecarga,
  /** Preço de catálogo por modelo em maiúsculas (ex.: 'MDWP-C40-2' → 39,26) */
  precosCatalogo: Record<string, number> = {},
): PropostaRecarga {
  const avisos: string[] = []
  const pendencias: string[] = []
  const r = e.respostas
  // Trechos por tipo de intervenção; a distância do cabo é a soma deles
  const trechos = trechosDaResposta(r)
  const somaTrechos = trechos.reduce((s, t) => s + Number(t.metros), 0)
  const distancia = Math.max(1, somaTrechos || Number(r.distancia_m) || p.distancia_padrao_m)
  const metrosDo = (tipo: TipoTrecho) => trechos.filter((t) => t.tipo === tipo).reduce((s, t) => s + Number(t.metros), 0)
  const mExterno = metrosDo('externo')
  const mSubterraneo = metrosDo('subterraneo')
  const mConcreto = trechos.filter((t) => t.tipo === 'subterraneo' && t.concretagem).reduce((s, t) => s + Number(t.metros), 0)
  const comTrechos = !!r.trechos?.length
  const alvenaria = comTrechos ? metrosDo('alvenaria') > 0 : r.alvenaria
  const embutida = comTrechos ? metrosDo('embutido') > 0 : r.infra_embutida

  // ── 1. Equipamentos ── (o do cliente não entra no preço)
  const equipamentos = e.equipamentos
    .filter((x) => x.qtd > 0)
    .map((x) => ({ ...x, qtd: Math.round(x.qtd), preco_unitario: x.do_cliente ? 0 : x.preco_unitario, subtotal: x.do_cliente ? 0 : Math.max(0, x.preco_unitario) * Math.round(x.qtd) }))
  const subtotalEquip = equipamentos.reduce((s, x) => s + x.subtotal, 0)
  for (const x of equipamentos) if (!x.do_cliente && !(x.preco_unitario > 0)) avisos.push(`Falta o custo de ${x.modelo}`)
  const carregadores = equipamentos.filter((x) => x.tipo === 'carregador')
  const qtdCarregadores = carregadores.reduce((s, x) => s + x.qtd, 0)
  for (const x of carregadores) if (!(x.potencia_kw > 0)) avisos.push(`Falta a potência (kW) de ${x.modelo} — sem ela os materiais elétricos não são dimensionados`)

  // ── Rede e corrente ──
  const comPotencia = carregadores.filter((x) => x.potencia_kw > 0)
  const potTotal = comPotencia.reduce((s, x) => s + x.potencia_kw * x.qtd, 0)
  const maiorKw = comPotencia.reduce((m, x) => Math.max(m, x.potencia_kw), 0)
  const fases: FasesRede = r.fases || (maiorKw > 0 ? deduzirFasesPorPotencia(maiorKw) : 'monofasico')
  const tri = fases === 'trifasico', bi = fases === 'bifasico'
  const tensao = tri ? 380 : 220
  const fatorFase = tri ? Math.sqrt(3) : bi ? 2 : 1
  const condutores = tri ? 5 : bi ? 4 : 3
  const dpsPorCircuito = tri ? 4 : bi ? 3 : 2
  const correnteTotal = potTotal > 0 ? (potTotal * 1000) / (tensao * fatorFase) : 0

  // ── 3a. Materiais elétricos ──
  const materiais: LinhaMaterial[] = []
  const preco = (codigo: string, ref: number) => {
    const c = precosCatalogo[codigo.toUpperCase()]
    return c && c > 0 ? { v: c, origem: 'catalogo' as const } : { v: ref, origem: 'referencia' as const }
  }
  const add = (codigo: string, descricao: string, grupo: GrupoMaterial, qtd: number, unidade: LinhaMaterial['unidade'], ref: number) => {
    if (!(qtd > 0)) return
    const pr = preco(codigo, ref)
    materiais.push({ codigo, descricao, grupo, qtd, unidade, preco_unitario: pr.v, origem: pr.origem })
  }

  // Agrupa carregadores de mesma potência (cada um tem circuito próprio)
  const porPotencia = new Map<number, number>()
  for (const x of comPotencia) porPotencia.set(x.potencia_kw, (porPotencia.get(x.potencia_kw) || 0) + x.qtd)
  const circuitos = Array.from(porPotencia.values()).reduce((s, q) => s + q, 0)
  let maiorBitola = 0
  const dimensionados: CircuitoDimensionado[] = []

  for (const [kw, qtd] of Array.from(porPotencia.entries())) {
    const corrente = (kw * 1000) / (tensao * fatorFase)
    const disj = disjuntorPara(corrente * 1.25)
    const bitola = bitolaPara(corrente)
    maiorBitola = Math.max(maiorBitola, bitola)
    const codDisj = tri ? `MDWH-C${disj}-3` : `MDWP-C${disj}-2`
    add(codDisj, `Disjuntor ${tri ? 'tripolar' : 'bipolar'} ${disj} A curva C — carregador ${br(kw, 1)} kW`, 'protecao', qtd,
      'un', tri ? REF.disjuntor_tripolar : REF.disjuntor_bipolar)
    add('DPS-CL2-275V-20KA', `DPS classe II 275 V 20 kA — carregador ${br(kw, 1)} kW`, 'protecao', dpsPorCircuito * qtd, 'un', REF.dps_classe2)
    const metros = Math.ceil(distancia * condutores * 1.15) * qtd
    if (bitola > 25) avisos.push(`Cabo de ${bitola} mm² sem preço de referência — confira o valor da linha de cabos`)
    add(`CABO-${bitola}MM2`, `Cabo ${bitola} mm² (${condutores} condutores × ${br(distancia)} m${qtd > 1 ? ` × ${qtd} circuitos` : ''})`, 'cabos',
      metros, 'm', REF.cabo_m_por_bitola[bitola] ?? REF.cabo_m_por_bitola[25])
    dimensionados.push({ potencia_kw: kw, qtd, corrente_a: corrente, bitola_mm2: bitola, disjuntor_a: disj, polos: tri ? 3 : 2, dps_un: dpsPorCircuito * qtd, condutores, metros_cabo: metros })
  }
  let disjGeral: number | null = null
  if (circuitos > 1) {
    disjGeral = disjuntorPara(correnteTotal * 1.25)
    add(tri ? `MDWH-C${disjGeral}-3` : `MDWP-C${disjGeral}-2`, `Disjuntor geral ${tri ? 'tripolar' : 'bipolar'} ${disjGeral} A curva C — proteção da estação`,
      'protecao', 1, 'un', tri ? REF.disjuntor_tripolar : REF.disjuntor_bipolar)
  }
  if (circuitos > 0) add('QCA-VE', 'Quadro de proteção dedicado à estação', 'protecao', 1, 'un', REF.quadro_dedicado)

  // Infraestrutura por trecho (Kalebe 2026-10-15: metragem por tipo de intervenção)
  const pol = eletrodutoPara(maiorBitola)
  if (circuitos > 0 && mExterno > 0) {
    const barrasPorCircuito = Math.ceil(mExterno / 3)
    const barras = barrasPorCircuito * circuitos
    add(`ELETRODUTO-${pol}`, `Eletroduto rígido aparente ${pol} (barra 3 m) — ${br(mExterno)} m externos`, 'infra', barras, 'barra', REF.eletroduto_barra[pol])
    add(`ABRACADEIRA-${pol}`, `Abraçadeira tipo D ${pol} com bucha e parafuso`, 'infra', barras * 3, 'un', REF.abracadeira[pol])
    add(`LUVA-${pol}`, `Luva para eletroduto ${pol}`, 'infra', Math.max(0, barrasPorCircuito - 1) * circuitos, 'un', REF.luva[pol])
    add(`CURVA-${pol}`, `Curva 90° para eletroduto ${pol}`, 'infra', 2 * circuitos, 'un', REF.curva[pol])
    add('CONDULETE', 'Condulete / caixa de passagem', 'infra', circuitos, 'un', REF.condulete)
  }
  if (circuitos > 0 && mSubterraneo > 0) {
    // Tubulação: uma por circuito, na vala compartilhada — custo por metro do painel
    if (p.tubo_subterraneo_m > 0) {
      materiais.push({
        codigo: 'TUBO-SUBTERRANEO', descricao: `Tubulação subterrânea ${pol} — ${br(mSubterraneo)} m${circuitos > 1 ? ` × ${circuitos} circuitos` : ''}`,
        grupo: 'infra', qtd: mSubterraneo * circuitos, unidade: 'm', preco_unitario: p.tubo_subterraneo_m, origem: 'parametro',
      })
    } else pendencias.push('custo do metro da tubulação subterrânea')
    if (!(p.vala_m > 0)) pendencias.push('custo do metro de vala (abrir, passar a tubulação e fechar)')
    if (mConcreto > 0 && !(p.concretagem_m > 0)) pendencias.push('custo do metro de recomposição em concreto')
  }
  if (circuitos > 0 && !trechos.length) {
    avisos.push('Diga por onde passa o cabo: informe os trechos (eletroduto externo, subterrâneo, tubulação existente ou alvenaria)')
  }

  // Aterramento (Kalebe 2026-10-14: "tem que adicionar o aterramento")
  if (r.aterramento) {
    add('HASTE-5/8', 'Haste de aterramento cobreada 5/8" × 2,4 m', 'aterramento', 1, 'un', REF.haste)
    add('CONECTOR-GAR', 'Conector grampo para haste (GAR)', 'aterramento', 1, 'un', REF.conector_terra)
    add('CAIXA-INSPECAO', 'Caixa de inspeção do aterramento', 'aterramento', 1, 'un', REF.caixa_inspecao)
    add('CABO-NU-16MM2', 'Cabo de cobre nu 16 mm² (haste até o quadro)', 'aterramento', 3, 'm', REF.cabo_nu_16_m)
  }
  const subtotalMateriais = materiais.reduce((s, m) => s + m.qtd * m.preco_unitario, 0)

  // ── 2. Projeto ──
  const projeto: LinhaServico[] = [
    { chave: 'unifilar', descricao: 'Diagrama unifilar', detalhe: 'documento técnico da instalação', valor: p.diagrama_unifilar },
    { chave: 'trifilar', descricao: 'Diagrama trifilar', detalhe: 'fases, neutros e proteções', valor: p.diagrama_trifilar },
  ]
  const subtotalProjeto = projeto.reduce((s, x) => s + x.valor, 0)

  // ── 3b. Mão de obra e deslocamento ──
  const valorHora = p.horas_por_diaria > 0 ? p.diaria_eletrica / p.horas_por_diaria : 0
  const unidadesInstaladas = Math.max(1, qtdCarregadores)
  const horas = p.horas_por_carregador * unidadesInstaladas
  const execucao: LinhaServico[] = []
  if (equipamentos.length) {
    execucao.push({
      chave: 'instalacao', descricao: 'Instalação e comissionamento',
      detalhe: `${p.instaladores} instaladores × ${br(horas, horas % 1 ? 1 : 0)} h${unidadesInstaladas > 1 ? ` (${unidadesInstaladas} carregadores)` : ''}`,
      valor: p.instaladores * horas * valorHora,
    })
  }
  if (circuitos > 0 && mSubterraneo > 0) {
    execucao.push({
      chave: 'vala', descricao: 'Trecho subterrâneo (vala)',
      detalhe: `${br(mSubterraneo)} m — abrir a vala, passar a tubulação e fechar`,
      valor: mSubterraneo * p.vala_m,
    })
    if (mConcreto > 0) {
      execucao.push({ chave: 'concretagem', descricao: 'Recomposição em concreto', detalhe: `${br(mConcreto)} m de piso refeito sobre a vala`, valor: mConcreto * p.concretagem_m })
    }
  }
  if (alvenaria) {
    const mAlv = metrosDo('alvenaria')
    execucao.push({
      chave: 'alvenaria', descricao: 'Intervenção na alvenaria',
      detalhe: `${mAlv > 0 ? `${br(mAlv)} m · ` : ''}${p.instaladores} instaladores × ${br(p.dias_extra_alvenaria, p.dias_extra_alvenaria % 1 ? 1 : 0)} dia${p.dias_extra_alvenaria === 1 ? '' : 's'}`,
      valor: p.instaladores * p.dias_extra_alvenaria * p.diaria_eletrica,
    })
  }
  if (embutida) {
    const mEmb = metrosDo('embutido')
    execucao.push({ chave: 'embutida', descricao: 'Passagem pela infraestrutura embutida', detalhe: `${mEmb > 0 ? `${br(mEmb)} m · ` : ''}usa a tubulação existente`, valor: 0 })
  }
  if (pendencias.length) avisos.push(`Defina no ⚙️ Precificação (estação de recarga): ${pendencias.join('; ')} — sem isso o PDF não sai`)
  const km = Math.max(0, Number(r.km_deslocamento) || 0)
  if (km > 0) {
    execucao.push({ chave: 'deslocamento', descricao: 'Deslocamento', detalhe: `${br(km * 2)} km (ida + volta)`, valor: km * 2 * p.valor_km })
  }
  const subtotalServicos = execucao.reduce((s, x) => s + x.valor, 0)
  const subtotalExecucao = subtotalMateriais + subtotalServicos

  // ── Preço (método invertido, imposto só na nota Spin) ──
  const m = e.margem_pct ?? p.margem_pct
  const c = e.comissao_pct ?? p.comissao_pct
  const i = p.imposto_pct
  const base = subtotalProjeto + subtotalExecucao
  const divisor = 1 - (m + c + i) / 100
  const custo = subtotalEquip + base
  let pv = 0, desconto = 0
  if (custo > 0 && divisor > 0.05) {
    pv = (subtotalEquip * (1 - i / 100) + base) / divisor
    const divMin = 1 - (p.margem_minima_pct + c + i) / 100
    if (divMin > 0.05) desconto = Math.max(0, pv - (subtotalEquip * (1 - i / 100) + base) / divMin)
  } else if (custo > 0) {
    avisos.push('Margem + comissão + imposto passam de 95% — reduza a margem')
  }

  return {
    equipamentos,
    materiais,
    projeto,
    execucao,
    subtotal_equipamentos: subtotalEquip,
    subtotal_projeto: subtotalProjeto,
    subtotal_materiais: subtotalMateriais,
    subtotal_servicos_execucao: subtotalServicos,
    subtotal_execucao: subtotalExecucao,
    custo_total: custo,
    base_impostavel: base,
    pv_total: Math.round(pv * 100) / 100,
    margem: pv * (m / 100),
    comissao: pv * (c / 100),
    imposto: Math.max(0, pv - subtotalEquip) * (i / 100),
    desconto_max: desconto,
    margem_pct: m,
    comissao_pct: c,
    imposto_pct: i,
    qtd_carregadores: qtdCarregadores,
    potencia_total_kw: potTotal,
    fases,
    corrente_total_a: correnteTotal,
    secoes: (e.secoes || []).filter((s) => Number(s.valor) > 0),
    total_secoes: totalSecoes(e.secoes),
    total_geral: Math.round((pv + totalSecoes(e.secoes)) * 100) / 100,
    avisos,
    circuitos: dimensionados,
    disjuntor_geral_a: disjGeral,
    trechos,
    distancia_total_m: distancia,
    pendencias_custo: pendencias,
  }
}

export const rotuloFases = (f: FasesRede) => ROTULO_FASES[f]

/** Respostas iniciais: distância padrão em eletroduto externo, aterramento incluso. */
export function respostasPadrao(p: Pick<ParametrosRecarga, 'distancia_padrao_m'>, km = 0): RespostasRecarga {
  return {
    distancia_m: p.distancia_padrao_m,
    fases: null,
    eletroduto_externo: true,
    alvenaria: false,
    infra_embutida: false,
    aterramento: true,
    km_deslocamento: km,
    trechos: [{ tipo: 'externo', metros: p.distancia_padrao_m }],
  }
}
