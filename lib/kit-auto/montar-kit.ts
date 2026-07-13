/**
 * Lista CA — materiais elétricos COMPLEMENTARES ao kit fotovoltaico.
 *
 * MUDANÇA IMPORTANTE (v2 Spin):
 * Antes esta função gerava TUDO (cabo CC, disjuntor, DPS, estrutura). Agora
 * esses itens fazem parte do KIT (cotados na planilha WEG). A Lista CA foca
 * SÓ nos materiais complementares que NÃO são fornecidos pela WEG:
 *
 *   - Cabos terra (2× 30m 6mm² até 30kWp residencial)
 *   - Eletrodutos (por fases + secção)
 *   - Suportes / abraçadeiras / luvas (2 eletrodutos)
 *   - Quadro elétrico (plástico ≤30kW / metálico >30kW)
 *   - Barramento DIN (neutro + terra)
 *   - Parafusos e buchas
 *   - Terminais tubulares + olhal (por secção)
 *   - Balde + haste + conector terra
 *   - Placas advertência (grande sempre + pequena se >1 relógio)
 *   - Mangueira corrugada 10m com proteção solar
 *
 * A lista é gerada pelo "mestre da elétrica" (essa função) e o consultor
 * confere/ajusta antes de confirmar.
 */

export type PlacaSelecionada = {
  id: string
  potencia_wp: number
  largura_mm?: number
}

export type InversorSelecionado = {
  id: string
  potencia_kw: number
  tensao_desc: string
  disjuntor_equivalente?: string
  entradas_mppt?: number
}

export type DadosProjeto = {
  qtd_placas: number
  qtd_inversores: number
  distancia_string_qgbt_m: number
  tipo_telhado?: string
  isopleta_ms?: number
  spda?: boolean
  qtd_relogios?: number       // do padrão de entrada — pra decidir placa pequena
  potencia_ca_total_kw?: number
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
  // Precificação
  produto_id?: string | null
  preco_unitario?: number
  origem_preco?: 'catalogo' | 'manual' | 'sem_preco' | null
}

/**
 * @deprecated Use montarListaComplementarCA. Mantido pra compat com código legado.
 */
export function montarKitCompleto(
  placa: PlacaSelecionada,
  inversor: InversorSelecionado,
  dados: DadosProjeto,
): ItemKit[] {
  return montarListaComplementarCA(placa, inversor, dados)
}

/**
 * Gera Lista CA — só materiais complementares (não repete o que está no Kit).
 */
export function montarListaComplementarCA(
  placa: PlacaSelecionada,
  inversor: InversorSelecionado,
  dados: DadosProjeto,
): ItemKit[] {
  const items: ItemKit[] = []
  const isTri = /trif/i.test(inversor.tensao_desc)
  const isBi = /bif/i.test(inversor.tensao_desc)
  const numFases = isTri ? 3 : isBi ? 2 : 1
  const potenciaCA = dados.potencia_ca_total_kw || (inversor.potencia_kw * dados.qtd_inversores)
  const ateResidencial = potenciaCA <= 30 // limite 30kWp

  // ============== CABOS TERRA (2× 30m padrão residencial ≤30kWp) ==============
  // Placas → inversor
  items.push({
    categoria: 'cabo_terra',
    subcategoria: 'cabo_terra_cc',
    descricao: ateResidencial
      ? 'Cabo terra 6mm² verde (placas → inversor)'
      : `Cabo terra ${bitolaAterramento(potenciaCA)}mm² verde (placas → inversor)`,
    qtd: 30,
    unidade: 'm',
    observacao: 'Padrão Spin: 30m por projeto até 30kWp',
    automatico: true,
  })
  // Inversor → haste
  items.push({
    categoria: 'cabo_terra',
    subcategoria: 'cabo_terra_haste',
    descricao: ateResidencial
      ? 'Cabo terra 6mm² verde (inversor → haste)'
      : `Cabo terra ${bitolaAterramento(potenciaCA)}mm² verde (inversor → haste)`,
    qtd: 30,
    unidade: 'm',
    observacao: 'Padrão Spin: 30m por projeto até 30kWp',
    automatico: true,
  })

  // ============== ELETRODUTOS ==============
  // 2 eletrodutos padrão pra até 30kW residencial
  const bitolaCA = calcularBitolaCa(potenciaCA, isTri)
  const diamEletroduto = calcularDiametroEletroduto(bitolaCA, numFases + 1) // +1 pro terra
  const compEletroduto = Math.ceil(dados.distancia_string_qgbt_m * 1.2)
  items.push({
    categoria: 'eletroduto',
    subcategoria: 'eletroduto_ca',
    descricao: `Eletroduto ${diamEletroduto}mm PVC (2 unidades × ${compEletroduto}m)`,
    qtd: 2 * compEletroduto,
    unidade: 'm',
    observacao: `${numFases + 1} condutores (${numFases}F+N+T) bitola ${bitolaCA}mm²`,
    automatico: true,
  })

  // ============== SUPORTES / ABRAÇADEIRAS / LUVAS ==============
  // Dimensionar pra 2 eletrodutos
  const qtdAbracadeiras = Math.ceil(compEletroduto / 1.5) * 2 // 1 abraçadeira/1,5m × 2 eletrodutos
  items.push({
    categoria: 'fixacao',
    subcategoria: 'abracadeira',
    descricao: `Abraçadeira tipo "D" ${diamEletroduto}mm com cunha`,
    qtd: qtdAbracadeiras,
    unidade: 'un',
    observacao: 'Fixação dos 2 eletrodutos',
    automatico: true,
  })
  const qtdLuvas = Math.ceil(compEletroduto / 3) * 2 // 1 luva/3m × 2 eletrodutos
  items.push({
    categoria: 'fixacao',
    subcategoria: 'luva',
    descricao: `Luva eletroduto ${diamEletroduto}mm`,
    qtd: qtdLuvas,
    unidade: 'un',
    automatico: true,
  })
  items.push({
    categoria: 'fixacao',
    subcategoria: 'curva',
    descricao: `Curva eletroduto ${diamEletroduto}mm 90°`,
    qtd: 8,
    unidade: 'un',
    observacao: '4 curvas por eletroduto',
    automatico: true,
  })

  // ============== MANGUEIRA CORRUGADA (10m padrão) ==============
  items.push({
    categoria: 'protecao',
    subcategoria: 'corrugado_solar',
    descricao: 'Mangueira corrugada 25mm com proteção UV/solar',
    qtd: 10,
    unidade: 'm',
    observacao: 'Padrão Spin: 10m — proteção dos cabos no telhado',
    automatico: true,
  })

  // ============== QUADRO ELÉTRICO ==============
  const qtdDisjuntores = dados.qtd_inversores + 1 // 1 por inversor + geral
  const qtdDps = numFases + 1 // fases + neutro
  if (ateResidencial) {
    items.push({
      categoria: 'quadro',
      subcategoria: 'quadro_plastico',
      descricao: 'Quadro plástico WEG (até 6 disjuntores) — QPCA',
      qtd: 1,
      unidade: 'un',
      observacao: `Vai abrigar ${qtdDisjuntores} disjuntor(es) + ${qtdDps} DPS + barramentos`,
      automatico: true,
    })
  } else {
    // >30kW → metálico maior
    const capacidadeMinima = Math.max(12, qtdDisjuntores + qtdDps + 2)
    items.push({
      categoria: 'quadro',
      subcategoria: 'quadro_metalico',
      descricao: `Quadro metálico ${capacidadeMinima} módulos DIN IP54`,
      qtd: 1,
      unidade: 'un',
      observacao: `${potenciaCA.toFixed(1)}kW > 30kW: exige quadro metálico`,
      automatico: true,
    })
  }

  // ============== BARRAMENTOS DIN ==============
  items.push({
    categoria: 'barramento',
    subcategoria: 'barramento_neutro',
    descricao: 'Barramento DIN neutro (azul) 10 furos',
    qtd: 1,
    unidade: 'un',
    automatico: true,
  })
  items.push({
    categoria: 'barramento',
    subcategoria: 'barramento_terra',
    descricao: 'Barramento DIN terra (verde) 10 furos',
    qtd: 1,
    unidade: 'un',
    automatico: true,
  })

  // ============== PARAFUSOS E BUCHAS ==============
  items.push({
    categoria: 'fixacao',
    subcategoria: 'parafuso_bucha',
    descricao: 'Kit parafusos + buchas S8 (fixação eletroduto/quadro)',
    qtd: 1,
    unidade: 'kit',
    observacao: `Suficiente para ${qtdAbracadeiras} pontos + fixação do quadro`,
    automatico: true,
  })

  // ============== TERMINAIS ==============
  // Tubulares — pra fase e neutro na bitola do cabo CA
  items.push({
    categoria: 'terminal',
    subcategoria: 'terminal_tubular',
    descricao: `Terminal tubular ${bitolaCA}mm² (fase/neutro)`,
    qtd: (numFases + 1) * 4, // 2 pontas × entrada + saída
    unidade: 'un',
    observacao: `Bitola cabo CA ${bitolaCA}mm²`,
    automatico: true,
  })
  // Olhal — pra terminação de aterramento
  items.push({
    categoria: 'terminal',
    subcategoria: 'terminal_olhal',
    descricao: `Terminal olhal ${ateResidencial ? '6' : bitolaAterramento(potenciaCA)}mm² (aterramento)`,
    qtd: 6,
    unidade: 'un',
    observacao: 'Terminação nos barramentos + haste',
    automatico: true,
  })

  // ============== ATERRAMENTO ==============
  items.push({
    categoria: 'aterramento',
    subcategoria: 'balde',
    descricao: 'Balde de inspeção aterramento (caixa medição)',
    qtd: 1,
    unidade: 'un',
    automatico: true,
  })
  items.push({
    categoria: 'aterramento',
    subcategoria: 'haste',
    descricao: 'Haste de aterramento 5/8" × 2,4m cobreada',
    qtd: 1,
    unidade: 'un',
    observacao: dados.spda ? 'Interligada ao SPDA existente' : 'Sistema TT',
    automatico: true,
  })
  items.push({
    categoria: 'aterramento',
    subcategoria: 'conector_terra',
    descricao: 'Conector cabo-haste tipo GAR (grampo de aterramento)',
    qtd: 1,
    unidade: 'un',
    automatico: true,
  })

  // ============== PLACAS DE ADVERTÊNCIA ==============
  // Grande — SEMPRE
  items.push({
    categoria: 'sinalizacao',
    subcategoria: 'placa_geracao_grande',
    descricao: 'Placa advertência GERAÇÃO PRÓPRIA grande (20×30cm)',
    qtd: 1,
    unidade: 'un',
    observacao: 'Padrão CELESC — obrigatória',
    automatico: true,
  })
  // Pequena — só se padrão tem +1 relógio
  const qtdRelogios = dados.qtd_relogios || 1
  if (qtdRelogios > 1) {
    items.push({
      categoria: 'sinalizacao',
      subcategoria: 'placa_geracao_pequena',
      descricao: 'Placa advertência relógio de geração (10×15cm)',
      qtd: 1,
      unidade: 'un',
      observacao: `Padrão com ${qtdRelogios} relógios: identifica o da geração`,
      automatico: true,
    })
  }

  return items
}

// ==========================================================
// HELPERS
// ==========================================================

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

/** Aterramento: >30kWp exige bitola maior que 6mm² */
function bitolaAterramento(potenciaKw: number): number {
  if (potenciaKw <= 30) return 6
  if (potenciaKw <= 50) return 10
  if (potenciaKw <= 100) return 16
  return 25
}

/** Diâmetro do eletroduto pela quantidade + bitola dos condutores (NBR 5410 simplificada). */
function calcularDiametroEletroduto(bitolaCabo: number, qtdCondutores: number): number {
  // Diâmetros comerciais em mm
  if (bitolaCabo <= 4 && qtdCondutores <= 4) return 20
  if (bitolaCabo <= 6 && qtdCondutores <= 4) return 25
  if (bitolaCabo <= 10 && qtdCondutores <= 4) return 32
  if (bitolaCabo <= 16 && qtdCondutores <= 4) return 40
  if (bitolaCabo <= 25) return 50
  if (bitolaCabo <= 35) return 60
  return 75
}
