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
  modelo?: string    // ex: SIW400H — usado pra detectar rede (SIW400/500 = tri)
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
  // Tipo de ligação vem PRIORITARIAMENTE do padrão de entrada / fatura CELESC,
  // não do modelo do inversor. Valores esperados: 'monofasico' | 'bifasico' | 'trifasico'
  tipo_ligacao?: string
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

  // Detecção robusta do tipo de rede (várias heurísticas em cascata)
  const { isTri, isBi } = detectarRede(inversor, dados.tipo_ligacao)
  const numFases = isTri ? 3 : isBi ? 2 : 1
  const potenciaCA = dados.potencia_ca_total_kw || (inversor.potencia_kw * dados.qtd_inversores)
  const ateResidencial = potenciaCA <= 30 // limite 30kWp

  // ============== CABO TERRA (1 único item — 30m totais SEMPRE) ==============
  // Padrão Spin: sempre 30m verde, cobre TODO o percurso:
  //   placas→inversor + inversor→quadro + quadro→rede + inversor→haste (aterramento)
  // Bitola 6mm² até 30kWp residencial; acima disso escala.
  items.push({
    categoria: 'cabo_terra',
    subcategoria: 'cabo_terra',
    descricao: ateResidencial
      ? 'Cabo 6mm² verde (terra — percurso completo)'
      : `Cabo ${bitolaAterramento(potenciaCA)}mm² verde (terra — percurso completo)`,
    qtd: 30,
    unidade: 'm',
    observacao: 'Padrão Spin: 30m sempre — cobre placas→inversor→quadro→rede + aterramento haste',
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

  // ============== CABOS HEPR (por cor, 6m padrão cada) ==============
  // Padrão Spin: 6m por cabo (≈2m inversor→quadro + ≈4m quadro→rede)
  // Cores NBR 5410: F1=preto, F2=vermelho, F3=branco, N=azul, T=verde-amarelo
  const coresFases: { cor: string; hex: string; label: string }[] = []
  if (numFases >= 1) coresFases.push({ cor: 'preto', hex: '#000', label: 'F1' })
  if (numFases >= 2) coresFases.push({ cor: 'vermelho', hex: '#c22', label: 'F2' })
  if (numFases >= 3) coresFases.push({ cor: 'branco', hex: '#eee', label: 'F3' })

  for (const { cor, label } of coresFases) {
    items.push({
      categoria: 'cabo_ca',
      subcategoria: 'cabo_hepr_fase',
      descricao: `Cabo HEPR ${bitolaCA}mm² ${cor} (fase ${label})`,
      qtd: 8,
      unidade: 'm',
      observacao: 'Padrão Spin: 8m (≈3m inversor→quadro + ≈5m quadro→rede)',
      automatico: true,
    })
  }
  items.push({
    categoria: 'cabo_ca',
    subcategoria: 'cabo_hepr_neutro',
    descricao: `Cabo HEPR ${bitolaCA}mm² azul (neutro)`,
    qtd: 8,
    unidade: 'm',
    observacao: 'Padrão Spin: 8m (≈3m inversor→quadro + ≈5m quadro→rede)',
    automatico: true,
  })
  // Terra: cabo único de 30m já cobre TODO o percurso (placas→inversor→quadro→rede + aterramento haste).
  // Ver item de aterramento no início da lista.

  // ============== FIXACAO DOS ELETRODUTOS ==============
  // Abraçadeira metálica D com cunha: ancoragem dos eletrodutos na parede/estrutura
  // Padrão: 1 a cada 50cm em telhado exposto = 6 pontos por barra × 2 barras = 12
  items.push({
    categoria: 'fixacao',
    subcategoria: 'abracadeira_d',
    descricao: `Abraçadeira tipo "D" ${bitolaEletroduto.polegadas} com cunha`,
    qtd: 12,
    unidade: 'un',
    observacao: 'Fixação dos 2 eletrodutos (6 pontos por barra de 3m — ancoragem a cada ~50cm)',
    automatico: true,
  })
  // Abraçadeira nylon pra amarração de cabos internos e organização
  items.push({
    categoria: 'fixacao',
    subcategoria: 'abracadeira_nylon',
    descricao: 'Abraçadeira nylon 300mm × 4,8mm (preta UV)',
    qtd: 50,
    unidade: 'un',
    observacao: 'Amarração de cabos, organização telhado + fixação corrugado',
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

  // ============== CAIXAS DE PASSAGEM ==============
  // Padrão Spin: 2 caixas por projeto residencial (emenda/derivação/inspeção)
  items.push({
    categoria: 'fixacao',
    subcategoria: 'caixa_passagem',
    descricao: 'Caixa de passagem PVC 100×100mm (4"×4") com tampa',
    qtd: 2,
    unidade: 'un',
    observacao: 'Emenda de eletrodutos + inspeção de trajeto',
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

  // ============== PARAFUSOS E BUCHAS (DETALHADOS) ==============
  // Bucha S8 + parafuso 6×40: quadro (4) + caixas passagem 2×(4) + reserva = 14
  items.push({
    categoria: 'fixacao',
    subcategoria: 'bucha_s8',
    descricao: 'Bucha nylon S8',
    qtd: 14,
    unidade: 'un',
    observacao: 'Fixação do quadro (4) + 2 caixas de passagem (8) + reserva',
    automatico: true,
  })
  items.push({
    categoria: 'fixacao',
    subcategoria: 'parafuso_6x40',
    descricao: 'Parafuso cabeça chata Phillips 6×40mm',
    qtd: 14,
    unidade: 'un',
    observacao: 'Pareado com bucha S8',
    automatico: true,
  })
  // Bucha S6 + parafuso 4×30: 12 pontos de abraçadeira D + reserva
  items.push({
    categoria: 'fixacao',
    subcategoria: 'bucha_s6',
    descricao: 'Bucha nylon S6',
    qtd: 16,
    unidade: 'un',
    observacao: 'Fixação das 12 abraçadeiras D + reserva',
    automatico: true,
  })
  items.push({
    categoria: 'fixacao',
    subcategoria: 'parafuso_4x30',
    descricao: 'Parafuso cabeça chata Phillips 4×30mm',
    qtd: 16,
    unidade: 'un',
    observacao: 'Pareado com bucha S6',
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
 * Detecta tipo de rede em cascata:
 *  1. Modelo WEG (SIW400/500 = tri, SIW100/200/300 = mono)
 *  2. tensao_desc do inversor (palavras "trif"/"bif"/"mono", "3F"/"2F"/"1F", 380V/220V)
 *  3. tipo_ligacao explícito (padrão de entrada / fatura, se veio)
 *  4. Fallback: monofásico
 */
function detectarRede(inversor: InversorSelecionado, tipoLigExplicito?: string): { isTri: boolean; isBi: boolean } {
  const desc = inversor.tensao_desc || ''
  const modelo = (inversor.modelo || '').toUpperCase()

  // 1. Modelo WEG
  if (/SIW[45]0\d/i.test(modelo)) return { isTri: true, isBi: false }
  if (/SIW[123]0\d/i.test(modelo)) return { isTri: false, isBi: false }

  // 2. Palavras + numeração no tensao_desc
  if (/trif|3\s*f\b|3\s*fase|380\s*v/i.test(desc)) return { isTri: true, isBi: false }
  if (/bif|2\s*f\b|2\s*fase/i.test(desc)) return { isTri: false, isBi: true }
  if (/mono|1\s*f\b|1\s*fase|220\s*v/i.test(desc)) return { isTri: false, isBi: false }

  // 3. tipo_ligacao explícito (fallback)
  const t = (tipoLigExplicito || '').toLowerCase()
  if (/trif/i.test(t)) return { isTri: true, isBi: false }
  if (/bif/i.test(t)) return { isTri: false, isBi: true }

  // 4. Fallback monofásico (mais seguro)
  return { isTri: false, isBi: false }
}

/**
 * Bitola CA (mm²) pra FV residencial padrão Spin.
 * Fator de segurança 1.15 sobre corrente nominal.
 * Uso: eletroduto embutido em parede/PVC com 4 condutores.
 *
 * CAP RESIDENCIAL: sistemas ≤ 30kW nunca passam de 16mm² (padrão Spin).
 * Isso reflete a realidade da Grande Florianópolis — sistemas maiores
 * são comerciais/usina e precisam de especificação separada.
 */
function calcularBitolaCa(potenciaKw: number, isTri: boolean): number {
  const RESIDENCIAL_LIMITE_KW = 30

  const tensao = isTri ? 380 : 220
  const factor = isTri ? Math.sqrt(3) : 1
  const correnteNominal = (potenciaKw * 1000) / (tensao * factor)
  const correnteProjeto = correnteNominal * 1.15

  let bitola: number
  if (correnteProjeto <= 25) bitola = 4
  else if (correnteProjeto <= 32) bitola = 6
  else if (correnteProjeto <= 45) bitola = 10
  else if (correnteProjeto <= 60) bitola = 16
  else if (correnteProjeto <= 80) bitola = 25
  else if (correnteProjeto <= 100) bitola = 35
  else bitola = 50

  // Cap residencial — nunca superdimensiona
  if (potenciaKw <= RESIDENCIAL_LIMITE_KW && bitola > 16) bitola = 16

  return bitola
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
