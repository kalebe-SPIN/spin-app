/**
 * Lógica de auto-montagem do restante do kit fotovoltaico
 * A partir da escolha de placa + inversor, gera:
 *   - Cabo CC solar preto e vermelho (por comprimento)
 *   - Disjuntor CA (baseado no equivalente sugerido pelo inversor)
 *   - DPS classe II
 *   - Estrutura (por tipo de telhado + isopleta)
 *   - Conectores MC4
 *   - String box (se recomendado pelo inversor)
 *   - Cabo CA (bitola por corrente)
 *   - Aterramento (haste + cabo nu)
 *   - Sinalização/identificação NR-10
 */

export type PlacaSelecionada = {
  id: string
  potencia_wp: number
  largura_mm?: number
}

export type InversorSelecionado = {
  id: string
  potencia_kw: number
  tensao_desc: string          // ex: "Inversor Monofásico 220 V"
  disjuntor_equivalente?: string  // ex: "MDWP-C50-2"
  entradas_mppt?: number
}

export type DadosProjeto = {
  qtd_placas: number
  qtd_inversores: number
  distancia_string_qgbt_m: number   // do Passo 4
  tipo_telhado?: string              // "ceramico" | "fibrocimento" | "metalico" | "laje"
  isopleta_ms?: number
  spda?: boolean
}

export type ItemKit = {
  categoria: string
  subcategoria: string
  descricao: string
  codigo_weg?: string | null
  qtd: number
  unidade: string
  observacao?: string | null
  automatico: boolean
}

/**
 * Gera lista automática de itens complementares ao kit
 */
export function montarKitCompleto(
  placa: PlacaSelecionada,
  inversor: InversorSelecionado,
  dados: DadosProjeto
): ItemKit[] {
  const items: ItemKit[] = []

  const numStrings = Math.max(1, inversor.entradas_mppt || 2)
  const placasPorString = Math.ceil(dados.qtd_placas / numStrings)

  // ============== CABO CC ==============
  // Cabo solar 6mm² preto (positivo) + vermelho (negativo)
  // Comprimento estimado: distância × 2 (ida+volta) × qtd_strings + folga 15%
  const compCcMetros = Math.ceil(dados.distancia_string_qgbt_m * 2 * numStrings * 1.15)
  items.push({
    categoria: 'cabo_cc',
    subcategoria: 'cabo_solar',
    descricao: 'Cabo solar CC 6mm² preto',
    codigo_weg: null,
    qtd: compCcMetros,
    unidade: 'm',
    automatico: true,
  })
  items.push({
    categoria: 'cabo_cc',
    subcategoria: 'cabo_solar',
    descricao: 'Cabo solar CC 6mm² vermelho',
    codigo_weg: null,
    qtd: compCcMetros,
    unidade: 'm',
    automatico: true,
  })

  // ============== CONECTORES MC4 ==============
  // 2 pares por string (entrada + saída)
  const paresMc4 = numStrings * 2
  items.push({
    categoria: 'conector',
    subcategoria: 'mc4',
    descricao: 'Conector MC4 par (macho + fêmea)',
    codigo_weg: null,
    qtd: paresMc4,
    unidade: 'par',
    automatico: true,
  })

  // ============== DISJUNTOR CA ==============
  const disjuntorRef = inversor.disjuntor_equivalente || estimarDisjuntor(inversor)
  items.push({
    categoria: 'disjuntor',
    subcategoria: 'disjuntor_ca',
    descricao: `Disjuntor CA — ${disjuntorRef} × ${dados.qtd_inversores}`,
    codigo_weg: null,
    qtd: dados.qtd_inversores,
    unidade: 'un',
    observacao: `Referência WEG: ${disjuntorRef}`,
    automatico: true,
  })

  // ============== DPS CLASSE II ==============
  // 1 conjunto para tensão do inversor
  const isTri = /tri/i.test(inversor.tensao_desc)
  items.push({
    categoria: 'dps',
    subcategoria: 'dps_ca',
    descricao: `DPS classe II — ${isTri ? '4P' : '2P'} 275V 20kA`,
    codigo_weg: null,
    qtd: 1,
    unidade: 'un',
    observacao: 'Conjunto para tensão do sistema',
    automatico: true,
  })

  // ============== ESTRUTURA ==============
  // Cálculo por qtd de módulos e tipo de telhado
  const qtdKitsEstrutura = Math.ceil(dados.qtd_placas / 4)
  const tipoTelhadoLabel = mapearTelhado(dados.tipo_telhado)
  items.push({
    categoria: 'estrutura',
    subcategoria: 'kit_estrutura',
    descricao: `Kit estrutura ${tipoTelhadoLabel} p/ 4 módulos (perfil HR + fixadores)`,
    codigo_weg: null,
    qtd: qtdKitsEstrutura,
    unidade: 'kit',
    observacao: `Isopleta considerada: ${dados.isopleta_ms || 'padrão'} m/s`,
    automatico: true,
  })

  // ============== CABO CA ==============
  const bitolaCa = calcularBitolaCa(inversor.potencia_kw, isTri)
  const compCaMetros = Math.ceil(dados.distancia_string_qgbt_m * 1.15)
  items.push({
    categoria: 'cabo_ca',
    subcategoria: 'cabo_flexivel',
    descricao: `Cabo CA flexível ${isTri ? '4x' : '3x'}${bitolaCa}mm² 0,6/1kV`,
    codigo_weg: null,
    qtd: compCaMetros,
    unidade: 'm',
    observacao: 'PT/AZ/PT/VD ou conforme padrão',
    automatico: true,
  })

  // ============== ATERRAMENTO ==============
  items.push({
    categoria: 'aterramento',
    subcategoria: 'haste',
    descricao: 'Haste de aterramento 5/8" × 2,4m cobreada',
    codigo_weg: null,
    qtd: 1,
    unidade: 'un',
    observacao: dados.spda ? 'Interligada ao SPDA existente' : 'Sistema TT',
    automatico: true,
  })
  items.push({
    categoria: 'aterramento',
    subcategoria: 'cabo_nu',
    descricao: 'Cabo de cobre nu 16mm²',
    codigo_weg: null,
    qtd: Math.max(10, Math.ceil(dados.distancia_string_qgbt_m + 5)),
    unidade: 'm',
    automatico: true,
  })

  // ============== QUADRO ==============
  items.push({
    categoria: 'quadro',
    subcategoria: 'qpca',
    descricao: 'Quadro de Proteção CA (QPCA) 4 módulos + acessórios',
    codigo_weg: null,
    qtd: 1,
    unidade: 'un',
    observacao: 'Contém disjuntor CA do sistema FV + DPS classe II. Ligação ao QGBT',
    automatico: true,
  })

  // ============== IDENTIFICAÇÃO NR-10 ==============
  items.push({
    categoria: 'identificacao',
    subcategoria: 'placas_nr10',
    descricao: 'Kit placas de sinalização NR-10 (aviso GD + risco elétrico)',
    codigo_weg: null,
    qtd: 1,
    unidade: 'kit',
    automatico: true,
  })

  return items
}

// ==========================================================
// HELPERS
// ==========================================================

function estimarDisjuntor(inversor: InversorSelecionado): string {
  const isTri = /tri/i.test(inversor.tensao_desc)
  const tensao = isTri ? 380 : 220
  const corrente = (inversor.potencia_kw * 1000) / (tensao * (isTri ? Math.sqrt(3) : 1))
  const disjuntor = arredondarDisjuntor(corrente * 1.25)
  return `MDW${isTri ? 'H' : 'P'}-C${disjuntor}-${isTri ? '3' : '2'}`
}

function arredondarDisjuntor(a: number): number {
  const opcoes = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250]
  for (const o of opcoes) if (a <= o) return o
  return 300
}

function calcularBitolaCa(potenciaKw: number, isTri: boolean): number {
  const corrente = (potenciaKw * 1000) / (isTri ? 380 * Math.sqrt(3) : 220)
  if (corrente <= 20) return 4
  if (corrente <= 30) return 6
  if (corrente <= 40) return 10
  if (corrente <= 60) return 16
  if (corrente <= 80) return 25
  if (corrente <= 100) return 35
  return 50
}

function mapearTelhado(tipo?: string): string {
  const t = (tipo || '').toLowerCase()
  if (t.includes('ceram')) return 'cerâmico'
  if (t.includes('fibro')) return 'fibromadeira'
  if (t.includes('metal') || t.includes('chapa')) return 'metálico'
  if (t.includes('laje')) return 'laje'
  return 'universal'
}
