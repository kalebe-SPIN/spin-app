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

  // ============== CABO TERRA (1 único item — 30m totais) ==============
  // Padrão Spin: 30m = aterramento + placas→inversor (mesmo cabo, mesma bitola)
  // Cabo 6mm² isolado verde (NÃO cobre nu) — até 30kWp residencial
  items.push({
    categoria: 'cabo_terra',
    subcategoria: 'cabo_terra',
    descricao: ateResidencial
      ? 'Cabo 6mm² verde (aterramento + placas→inversor)'
      : `Cabo ${bitolaAterramento(potenciaCA)}mm² verde (aterramento + placas→inversor)`,
    qtd: 30,
    unidade: 'm',
    observacao: 'Padrão Spin: 30m totais (soma do aterramento + trecho placas→inversor)',
    automatico: true,
  })

  // ============== ELETRODUTOS ==============
  // Padrão Spin: 2 barras de 3m (6m totais), diâmetro em POLEGADAS
  const bitolaCA = calcularBitolaCa(potenciaCA, isTri)
  const bitolaEletroduto = eletrodutoEmPolegadas(bitolaCA, numFases + 1) // +1 pro terra
  items.push({
    categoria: 'eletroduto',
    subcategoria: 'eletroduto_ca',
    descricao: `Eletroduto ${bitolaEletroduto.polegadas} PVC (barra 3m)`,
    qtd: 2,
    unidade: 'barra',
    observacao: `2 barras × 3m = 6m totais · ${numFases + 1} condutores (${numFases}F+N+T) bitola ${bitolaCA}mm²`,
    automatico: true,
  })

  // ============== SUPORTES / ABRAÇADEIRAS / LUVAS ==============
  // Base: 6m totais de eletroduto (2 × 3m)
  // Abraçadeiras: 1 a cada 1,5m → ~4 pontos por barra × 2 = 8
  items.push({
    categoria: 'fixacao',
    subcategoria: 'abracadeira',
    descricao: `Abraçadeira tipo "D" ${bitolaEletroduto.polegadas} com cunha`,
    qtd: 8,
    unidade: 'un',
    observacao: 'Fixação dos 2 eletrodutos (4 pontos por barra de 3m)',
    automatico: true,
  })
  // Luvas: 1 pra emenda entre barras + 1 reserva por eletroduto = 2
  items.push({
    categoria: 'fixacao',
    subcategoria: 'luva',
    descricao: `Luva eletroduto ${bitolaEletroduto.polegadas}`,
    qtd: 2,
    unidade: 'un',
    observacao: 'Emenda entre barras',
    automatico: true,
  })
  // Curvas: 2 por trajeto × 2 eletrodutos = 4
  items.push({
    categoria: 'fixacao',
    subcategoria: 'curva',
    descricao: `Curva eletroduto ${bitolaEletroduto.polegadas} 90°`,
    qtd: 4,
    unidade: 'un',
    observacao: '2 curvas por eletroduto',
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
    observacao: 'Suficiente para 8 pontos de abraçadeira + fixação do quadro',
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

/**
 * Bitola CA (mm²) pra FV residencial padrão Spin.
 * Considera corrente nominal do inversor com fator de segurança 1.15.
 * Uso: eletroduto embutido em parede/PVC com 4 condutores.
 */
function calcularBitolaCa(potenciaKw: number, isTri: boolean): number {
  const tensao = isTri ? 380 : 220
  const factor = isTri ? Math.sqrt(3) : 1
  const correnteNominal = (potenciaKw * 1000) / (tensao * factor)
  const correnteProjeto = correnteNominal * 1.15

  // Bitolas comerciais BR (NBR 5410)
  if (correnteProjeto <= 25) return 4
  if (correnteProjeto <= 32) return 6
  if (correnteProjeto <= 45) return 10
  if (correnteProjeto <= 60) return 16
  if (correnteProjeto <= 80) return 25
  if (correnteProjeto <= 100) return 35
  return 50
}

/** Aterramento: >30kWp exige bitola maior que 6mm² */
function bitolaAterramento(potenciaKw: number): number {
  if (potenciaKw <= 30) return 6
  if (potenciaKw <= 50) return 10
  if (potenciaKw <= 100) return 16
  return 25
}

/**
 * Diâmetro do eletroduto em POLEGADAS pra FV residencial padrão Spin.
 * Taxa de ocupação NBR 5410 simplificada: eletroduto embutido com 4 condutores.
 *
 * Padrão comercial mais comum na Grande Florianópolis (fornecedores locais):
 *   - Até 10mm²: cabe em 1" tranquilamente
 *   - 16mm²: 1.1/4"
 *   - 25mm²: 1.1/2"
 *   - 35mm² pra cima: 2"
 *
 * Cap de 2" — sistemas FV residenciais até 30kW não passam disso.
 */
function eletrodutoEmPolegadas(bitolaCabo: number, qtdCondutores: number): { polegadas: string; equivMm: number } {
  if (bitolaCabo <= 10) return { polegadas: '1"', equivMm: 25 }
  if (bitolaCabo <= 16) return { polegadas: '1.1/4"', equivMm: 32 }
  if (bitolaCabo <= 25) return { polegadas: '1.1/2"', equivMm: 40 }
  return { polegadas: '2"', equivMm: 50 } // 35mm² ou mais
}
