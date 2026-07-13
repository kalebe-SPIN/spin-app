/**
 * Algoritmo de composição automática de kits fotovoltaicos.
 *
 * Recebe placa escolhida + padrão CELESC do cliente + inversores disponíveis
 * em estoque. Retorna 3-6 kits candidatos ordenados por qualidade.
 *
 * Regras Spin/CELESC aplicadas:
 *  - Monofásico: máx 8 kW CA (limite CELESC-SC)
 *  - Bi/Tri: desbalanceamento entre fases ≤ 5 kW
 *  - Kit CA ≤ potência do disjuntor de entrada × tensão × fator segurança
 *  - FCI (Pot CC / Pot CA) sweet spot 120-135%, aceitável 100-145%
 *  - CELESC não atende 127V — inversores 127V descartados
 */

export type PlacaInput = {
  id: string
  codigo_weg: string
  modelo: string
  fabricante: string | null
  potencia_wp: number
  preco_venda: number
}

export type InversorInput = {
  id: string
  codigo_weg: string
  modelo: string
  subcategoria: string          // 'inversor_string' | 'microinversor'
  potencia_kw: number
  tensao_desc: string           // ex: "Inversor Monofásico 220 V"
  disjuntor_equivalente: string | null
  entradas_mppt: number | null
  preco_venda: number
  disponivel_estoque: boolean
  url_datasheet?: string | null
}

export type PadraoCliente = {
  tipo_ligacao: 'monofasico' | 'bifasico' | 'trifasico'
  amperagem_disjuntor_geral_a: number
  tensao_fornecimento?: string
}

export type ItemKit = {
  produto_id: string
  modelo: string
  codigo_weg: string
  potencia_kw: number
  qtd: number
  preco_unitario: number
  fase_alocada?: 'R' | 'S' | 'T' | 'R+S' | 'R+S+T' // pra tri/bi
  url_datasheet?: string | null
}

export type KitSugerido = {
  id: string                    // chave única
  nome: string                  // "Kit A: 1 tri equilibrado"
  categoria: 'string' | 'microinversor' | 'hibrido'
  placa: {
    id: string
    modelo: string
    potencia_wp: number
    qtd: number
    preco_unitario: number
  }
  inversores: ItemKit[]         // 1 ou mais
  pot_cc_kwp: number
  pot_ca_kw: number
  fci_pct: number
  desbalanceamento_kw: number   // 0 se mono ou 1 inversor
  preco_total_kit_weg: number   // placas + inversores (só WEG)
  validacoes: {
    dentro_limite_celesc: boolean
    dentro_disjuntor_cliente: boolean
    desbalanceamento_ok: boolean
    fci_ideal: boolean            // 120-135%
    is_subdimensionado: boolean   // FCI < 100% — "kit de entrada"
    precisa_upgrade_disjuntor: boolean
    disjuntor_atual_a: number
    disjuntor_sugerido_a: number
    corrente_sistema_a: number
  }
  composicao: {
    placas: string          // "34× 615Wp WEG BIFACIAL"
    inversores: string      // "1× SIW300 M100 W00"
    estrutura: string       // "9 kits estrutura fibrocimento"
    cabo_cc: string         // "50m cabo solar 6mm² preto + 50m vermelho"
    disjuntor: string       // "1× disjuntor CA 50A MDWH-C50-2"
    dps: string             // "1× DPS classe II 2P 275V 20kA"
    quadro: string          // "1× QPCA + acessórios"
    aterramento: string     // "haste 5/8 × 2,4m + cabo cobre nu 16mm²"
  }
  racional: string              // "melhor custo-benefício" etc
  score: number                 // ranking interno
}

// ==========================================================
// CONSTANTES DE REGRAS
// ==========================================================

const CELESC_LIMITE_MONO_KW = 8              // Rede monofásica: máx 8 kW CA total
const DESBALANCEAMENTO_MAX_KW = 5            // Diferença entre fases ≤ 5 kW (bi/tri)
const FCI_MIN_SUBDIMENSIONADO = 80           // FCI mínimo aceito como "kit de entrada"
const FCI_MIN_ACEITAVEL = 100                // FCI mínimo pra kit normal
const FCI_MAX_ACEITAVEL = 145
const FCI_SWEET_MIN = 120
const FCI_SWEET_MAX = 135
const FATOR_SEGURANCA_DISJUNTOR = 0.8

// Linhas WEG por categoria (ongrid)
// SIW100 = microinversor
// SIW200, SIW300 = inversor string monofásico
// SIW400, SIW500 = inversor string trifásico
// SIW600+ = híbrido/BESS (não entra em ongrid puro)
const LINHAS_ONGRID = {
  micro: /^SIW100/i,
  mono: /^SIW(200|300)/i,
  tri: /^SIW(400|500)/i,
}

// ==========================================================
// PONTO DE ENTRADA
// ==========================================================

export function sugerirKits(input: {
  placa: PlacaInput
  padrao: PadraoCliente
  potCcAlvoKwp: number
  inversores: InversorInput[]
}): KitSugerido[] {
  const { placa, padrao, potCcAlvoKwp, inversores } = input

  // 1. Calcular limites de potência CA
  const potCaLimiteCelesc = calcularLimiteCelesc(padrao.tipo_ligacao)
  const potCaLimiteDisjuntor = calcularLimiteDisjuntor(padrao)
  const potCaMax = Math.min(potCaLimiteCelesc, potCaLimiteDisjuntor)

  // 2. Calcular qtd placas e potência CC real
  const qtdPlacas = Math.max(1, Math.ceil((potCcAlvoKwp * 1000) / placa.potencia_wp))
  const potCcRealKwp = (qtdPlacas * placa.potencia_wp) / 1000

  // 3. Filtrar inversores válidos por fase E por tensão (excluir 127V)
  const inversoresValidos = inversores
    .filter(i => i.disponivel_estoque)
    .filter(i => !isTensao127(i.tensao_desc))

  const inversoresPorTipo = agruparPorTipo(inversoresValidos, padrao.tipo_ligacao)

  // 4. Gerar candidatos
  const candidatos: KitSugerido[] = []

  // 4a. String monofásico (1x inversor mono)
  for (const inv of inversoresPorTipo.mono) {
    for (let qtd = 1; qtd <= 3; qtd++) {
      const kit = tentarComposicao({
        placa,
        qtdPlacas,
        potCcRealKwp,
        inversorPrincipal: inv,
        qtdInversorPrincipal: qtd,
        padrao,
        potCaMax,
        categoria: 'string',
        idPrefix: `mono-${inv.codigo_weg}-x${qtd}`,
      })
      if (kit) candidatos.push(kit)
    }
  }

  // 4b. String trifásico — SÓ pra cliente TRI (bifásico NÃO usa inversor tri)
  if (padrao.tipo_ligacao === 'trifasico') {
    for (const inv of inversoresPorTipo.tri) {
      for (let qtd = 1; qtd <= 2; qtd++) {
        const kit = tentarComposicao({
          placa,
          qtdPlacas,
          potCcRealKwp,
          inversorPrincipal: inv,
          qtdInversorPrincipal: qtd,
          padrao,
          potCaMax,
          categoria: 'string',
          idPrefix: `tri-${inv.codigo_weg}-x${qtd}`,
        })
        if (kit) candidatos.push(kit)
      }
    }
  }

  // 4c. Combinação 2-3 mono balanceados (pra tri/bi)
  // Bifásico: 2 mono um em cada fase, balanceado
  // Trifásico: 2 ou 3 mono distribuídos entre 3 fases
  if (padrao.tipo_ligacao === 'trifasico' || padrao.tipo_ligacao === 'bifasico') {
    for (const inv of inversoresPorTipo.mono) {
      const qtdsPossiveis = padrao.tipo_ligacao === 'bifasico' ? [2] : [2, 3]
      for (const qtd of qtdsPossiveis) {
        const kit = tentarComposicao({
          placa,
          qtdPlacas,
          potCcRealKwp,
          inversorPrincipal: inv,
          qtdInversorPrincipal: qtd,
          padrao,
          potCaMax,
          categoria: 'string',
          idPrefix: `${qtd}mono-${inv.codigo_weg}`,
          distribuirEntreFases: true,
        })
        if (kit) candidatos.push(kit)
      }
    }
  }

  // 4d. Microinversor
  // Mono: um por placa (ou grupo). Bi/Tri: distribuído entre fases balanceado.
  for (const inv of inversoresPorTipo.micro) {
    for (let qtd = 1; qtd <= 12; qtd++) {
      // Pra bi/tri: só qtd divisível pelo número de fases (equilibrio perfeito)
      if (padrao.tipo_ligacao === 'bifasico' && qtd % 2 !== 0) continue
      if (padrao.tipo_ligacao === 'trifasico' && qtd % 3 !== 0) continue

      const kit = tentarComposicao({
        placa,
        qtdPlacas,
        potCcRealKwp,
        inversorPrincipal: inv,
        qtdInversorPrincipal: qtd,
        padrao,
        potCaMax,
        categoria: 'microinversor',
        idPrefix: `micro-${inv.codigo_weg}-x${qtd}`,
        distribuirEntreFases: padrao.tipo_ligacao !== 'monofasico',
      })
      if (kit) candidatos.push(kit)
    }
  }

  // 5. Ordenar por score (melhor FCI, menor preço, menos inversores)
  candidatos.sort((a, b) => b.score - a.score)

  // 6. Deduplicar por composição essencial (mesma placa qtd + mesmo inversor + qtd)
  const vistos = new Set<string>()
  const unicos: KitSugerido[] = []
  for (const c of candidatos) {
    const chave = `${c.placa.qtd}p-${c.inversores.map(i => `${i.codigo_weg}x${i.qtd}`).join('|')}`
    if (!vistos.has(chave)) {
      vistos.add(chave)
      unicos.push(c)
    }
  }

  // 7. Nomear com racional e retornar top 6
  return unicos.slice(0, 6).map((k, idx) => ({
    ...k,
    nome: gerarNomeKit(k, idx),
    racional: gerarRacional(k),
  }))
}

// ==========================================================
// COMPOSIÇÃO INDIVIDUAL
// ==========================================================

function tentarComposicao(args: {
  placa: PlacaInput
  qtdPlacas: number
  potCcRealKwp: number
  inversorPrincipal: InversorInput
  qtdInversorPrincipal: number
  padrao: PadraoCliente
  potCaMax: number
  categoria: 'string' | 'microinversor' | 'hibrido'
  idPrefix: string
  distribuirEntreFases?: boolean
}): KitSugerido | null {
  const { placa, qtdPlacas, potCcRealKwp, inversorPrincipal, qtdInversorPrincipal, padrao, potCaMax, categoria, idPrefix } = args

  const potCaTotal = inversorPrincipal.potencia_kw * qtdInversorPrincipal
  const fci = (potCcRealKwp / potCaTotal) * 100

  // FCI: aceita 80-145% (100-145 normal, 80-99 subdimensionado "kit de entrada")
  if (fci < FCI_MIN_SUBDIMENSIONADO || fci > FCI_MAX_ACEITAVEL) return null
  const isSubdimensionado = fci < FCI_MIN_ACEITAVEL

  // Limite CELESC pra rede monofásica: 8 kW CA total
  if (padrao.tipo_ligacao === 'monofasico' && potCaTotal > CELESC_LIMITE_MONO_KW) return null

  // Desbalanceamento (só faz sentido se >1 inversor em bi/tri usando MONO)
  // Regra CELESC: diferença entre fases não pode ultrapassar 5 kW
  // NOTA: NÃO filtra fases zeradas — se uma fase fica sem inversor, isso É desbalanceamento
  let desbalanceamento = 0
  const usaMonoEmBiTri = padrao.tipo_ligacao !== 'monofasico' &&
    LINHAS_ONGRID.mono.test(inversorPrincipal.modelo)
  if (usaMonoEmBiTri && qtdInversorPrincipal > 1) {
    const numFases = padrao.tipo_ligacao === 'trifasico' ? 3 : 2
    const porFase = distribuirPorFases(inversorPrincipal.potencia_kw, qtdInversorPrincipal, numFases)
    const maxFase = Math.max(...porFase)
    const minFase = Math.min(...porFase) // sem filtro de zeros!
    desbalanceamento = maxFase - minFase
    if (desbalanceamento > DESBALANCEAMENTO_MAX_KW) return null
  }
  // Se usa 1 único inversor mono numa rede bi/tri, o desbalanceamento é a própria pot dele
  if (usaMonoEmBiTri && qtdInversorPrincipal === 1) {
    desbalanceamento = inversorPrincipal.potencia_kw
    if (desbalanceamento > DESBALANCEAMENTO_MAX_KW) return null
  }

  // Verificar necessidade de upgrade do disjuntor de entrada
  const correnteCaA = calcularCorrenteCA(potCaTotal, padrao)
  const disjuntorAtualA = Number(padrao.amperagem_disjuntor_geral_a) || 0
  const correnteMaxSuportadaA = disjuntorAtualA * FATOR_SEGURANCA_DISJUNTOR
  const precisaUpgradeDisjuntor = correnteCaA > correnteMaxSuportadaA
  const disjuntorSugeridoA = precisaUpgradeDisjuntor ? arredondarDisjuntorComercial(correnteCaA / FATOR_SEGURANCA_DISJUNTOR) : disjuntorAtualA

  const precoTotal = (placa.preco_venda * qtdPlacas) + (inversorPrincipal.preco_venda * qtdInversorPrincipal)

  const validacoes = {
    dentro_limite_celesc: padrao.tipo_ligacao !== 'monofasico' || potCaTotal <= CELESC_LIMITE_MONO_KW,
    dentro_disjuntor_cliente: !precisaUpgradeDisjuntor,
    desbalanceamento_ok: desbalanceamento <= DESBALANCEAMENTO_MAX_KW,
    fci_ideal: fci >= FCI_SWEET_MIN && fci <= FCI_SWEET_MAX,
    is_subdimensionado: isSubdimensionado,
    precisa_upgrade_disjuntor: precisaUpgradeDisjuntor,
    disjuntor_atual_a: disjuntorAtualA,
    disjuntor_sugerido_a: disjuntorSugeridoA,
    corrente_sistema_a: Math.round(correnteCaA * 10) / 10,
  }

  const score = calcularScore(fci, desbalanceamento, qtdInversorPrincipal, precoTotal, isSubdimensionado)

  // Composição extra do kit (estrutura, cabos, disjuntor, DPS, quadros)
  // Baseada no que a Spin compra da WEG pra montar o kit CA
  const composicao = gerarComposicao(placa, qtdPlacas, inversorPrincipal, qtdInversorPrincipal, padrao)

  return {
    id: idPrefix,
    nome: '',
    categoria,
    placa: {
      id: placa.id,
      modelo: placa.modelo,
      potencia_wp: placa.potencia_wp,
      qtd: qtdPlacas,
      preco_unitario: placa.preco_venda,
    },
    inversores: [{
      produto_id: inversorPrincipal.id,
      modelo: inversorPrincipal.modelo,
      codigo_weg: inversorPrincipal.codigo_weg,
      potencia_kw: inversorPrincipal.potencia_kw,
      qtd: qtdInversorPrincipal,
      preco_unitario: inversorPrincipal.preco_venda,
      url_datasheet: inversorPrincipal.url_datasheet,
    }],
    pot_cc_kwp: potCcRealKwp,
    pot_ca_kw: potCaTotal,
    fci_pct: fci,
    desbalanceamento_kw: desbalanceamento,
    preco_total_kit_weg: precoTotal,
    validacoes,
    composicao,
    racional: '',
    score,
  }
}

// ==========================================================
// HELPERS DE CÁLCULO
// ==========================================================

function calcularCorrenteCA(potKw: number, padrao: PadraoCliente): number {
  const isTri = padrao.tipo_ligacao === 'trifasico'
  const tensao = isTri ? 380 : 220
  const fator = isTri ? Math.sqrt(3) : 1
  return (potKw * 1000) / (tensao * fator)
}

function arredondarDisjuntorComercial(a: number): number {
  const opcoes = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 300]
  for (const o of opcoes) if (a <= o) return o
  return 400
}

function gerarComposicao(
  placa: PlacaInput,
  qtdPlacas: number,
  inversor: InversorInput,
  qtdInversor: number,
  padrao: PadraoCliente
) {
  const isTri = /trif/i.test(inversor.tensao_desc) || LINHAS_ONGRID.tri.test(inversor.modelo)
  const isBi = /bif/i.test(inversor.tensao_desc)
  const isMicro = LINHAS_ONGRID.micro.test(inversor.modelo)

  // Estrutura: 1 kit por 4 placas
  const qtdKitsEstrutura = Math.ceil(qtdPlacas / 4)

  // Cabos CC: distância padrão 15m ida+volta com folga 15%
  const numStrings = Math.max(1, inversor.entradas_mppt || 2)
  const cabocc = Math.ceil(15 * 2 * numStrings * 1.15)

  // === DISJUNTORES ===
  // Regra Spin:
  //  - Micro: sem disjuntor por inversor (só o geral)
  //  - String c/ 1 inversor: 1 disjuntor CA
  //  - String c/ 2+ inversores: 1 disjuntor por inversor + 1 geral
  const disjuntorRef = inversor.disjuntor_equivalente || estimarDisjuntor(inversor, padrao)
  const potenciaTotalKW = inversor.potencia_kw * qtdInversor
  const disjuntorGeralAmp = arredondarDisjuntorComercial(
    calcularCorrenteCA(potenciaTotalKW, padrao) * 1.25
  )
  const disjuntorGeralRef = `MDW${isTri ? 'H' : 'P'}-C${disjuntorGeralAmp}-${isTri ? '3' : '2'}`

  let disjuntorTxt: string
  if (isMicro) {
    disjuntorTxt = `1× disjuntor CA geral — ${disjuntorGeralRef}`
  } else if (qtdInversor === 1) {
    disjuntorTxt = `1× disjuntor CA — ${disjuntorRef}`
  } else {
    disjuntorTxt = `${qtdInversor}× disjuntor por inversor (${disjuntorRef}) + 1× disjuntor geral (${disjuntorGeralRef})`
  }

  // === DPS ===
  // Regra Spin: SEMPRE incluir o DPS do neutro (fases + neutro)
  //  - Mono (Fase+Neutro): 2 DPS (1 fase + 1 neutro)
  //  - Bi   (2F+N): 3 DPS (2 fases + 1 neutro)
  //  - Tri  (3F+N): 4 DPS (3 fases + 1 neutro)
  const qtdDps = isTri ? 4 : isBi ? 3 : 2
  const dpsTxt = `${qtdDps}× DPS classe II 275V 20kA (${isTri ? '3F+N' : isBi ? '2F+N' : 'F+N'})`

  return {
    placas: `${qtdPlacas}× ${placa.potencia_wp}Wp ${placa.fabricante || 'WEG'} (${placa.modelo})`,
    inversores: isMicro
      ? `${qtdInversor}× Microinversor ${inversor.modelo}`
      : `${qtdInversor}× ${inversor.modelo} (${inversor.potencia_kw}kW)`,
    estrutura: `${qtdKitsEstrutura} kit(s) estrutura WEG p/ 4 placas`,
    cabo_cc: `${cabocc}m cabo solar 6mm² preto + ${cabocc}m vermelho`,
    disjuntor: disjuntorTxt,
    dps: dpsTxt,
    quadro: '1× Quadro de Proteção CA (QPCA) + acessórios',
    aterramento: 'Haste 5/8" × 2,4m + cabo cobre nu 16mm²',
  }
}

function estimarDisjuntor(inversor: InversorInput, padrao: PadraoCliente): string {
  const corrente = calcularCorrenteCA(inversor.potencia_kw, padrao)
  const disjuntor = arredondarDisjuntorComercial(corrente * 1.25)
  const isTri = padrao.tipo_ligacao === 'trifasico'
  return `MDW${isTri ? 'H' : 'P'}-C${disjuntor}-${isTri ? '3' : '2'}`
}

// ==========================================================
// HELPERS
// ==========================================================

function calcularLimiteCelesc(fase: string): number {
  if (fase === 'monofasico') return CELESC_LIMITE_MONO_KW
  return 999 // sem limite fixo pra bi/tri (limite vem do disjuntor)
}

function calcularLimiteDisjuntor(padrao: PadraoCliente): number {
  const amp = Number(padrao.amperagem_disjuntor_geral_a) || 0
  if (amp === 0) return 999
  const tensao = padrao.tipo_ligacao === 'trifasico' ? 380 : 220
  const fatorFase = padrao.tipo_ligacao === 'trifasico' ? Math.sqrt(3) : 1
  return (amp * tensao * fatorFase * FATOR_SEGURANCA_DISJUNTOR) / 1000
}

function isTensao127(desc: string): boolean {
  return /127\s*V/i.test(desc) && !/220\s*V/i.test(desc)
}

function agruparPorTipo(inversores: InversorInput[], _faseCliente: string) {
  const mono: InversorInput[] = []
  const tri: InversorInput[] = []
  const micro: InversorInput[] = []

  for (const inv of inversores) {
    const modelo = inv.modelo || ''

    // Classifica pela LINHA (SIW1xx, SIW2xx, SIW3xx, SIW4xx, SIW5xx)
    // Independente da descrição de tensão
    if (LINHAS_ONGRID.micro.test(modelo)) {
      micro.push(inv)
    } else if (LINHAS_ONGRID.mono.test(modelo)) {
      mono.push(inv)
    } else if (LINHAS_ONGRID.tri.test(modelo)) {
      tri.push(inv)
    }
    // Outras linhas (SIW600+, híbridos) ignoradas em ongrid puro
  }

  return { mono, tri, micro }
}

function distribuirPorFases(potCadaKw: number, qtd: number, numFases: number): number[] {
  const fases = new Array(numFases).fill(0)
  for (let i = 0; i < qtd; i++) {
    const idx = i % numFases
    fases[idx] += potCadaKw
  }
  return fases
}

function calcularScore(fci: number, desbalanceamento: number, qtdInv: number, precoTotal: number, isSubdimensionado: boolean): number {
  let score = 100

  // FCI ideal (peso alto)
  if (fci >= FCI_SWEET_MIN && fci <= FCI_SWEET_MAX) score += 40
  else if (fci >= 115 && fci <= 140) score += 20
  else score -= 10

  // Subdimensionado (FCI < 100%) — penaliza mas ainda aparece
  if (isSubdimensionado) score -= 30

  // Menos inversores = simpler = melhor
  score -= (qtdInv - 1) * 5

  // Desbalanceamento penaliza
  score -= desbalanceamento * 10

  // Preço: relativo (menor = melhor). Não normalizado, mas influencia
  score -= precoTotal / 5000

  return score
}

function gerarNomeKit(kit: KitSugerido, idx: number): string {
  const invPrincipal = kit.inversores[0]
  const qtdInv = invPrincipal.qtd
  const isMicro = kit.categoria === 'microinversor'
  const modeloShort = invPrincipal.modelo.replace(/SIW\d+\w?/, m => m).slice(0, 25)

  if (isMicro) {
    return `Kit ${'ABCDEF'[idx]}: ${qtdInv}× Microinversor ${modeloShort}`
  }
  if (qtdInv === 1) {
    return `Kit ${'ABCDEF'[idx]}: 1× ${modeloShort}`
  }
  return `Kit ${'ABCDEF'[idx]}: ${qtdInv}× ${modeloShort} balanceados`
}

function gerarRacional(kit: KitSugerido): string {
  const partes: string[] = []

  if (kit.validacoes.is_subdimensionado) {
    partes.push('⚠️ Kit de entrada (subdimensionado)')
  } else if (kit.validacoes.fci_ideal) {
    partes.push('FCI ideal (120-135%)')
  } else {
    partes.push(`FCI ${kit.fci_pct.toFixed(0)}%`)
  }

  if (kit.inversores[0].qtd === 1) partes.push('menor complexidade')
  if (kit.desbalanceamento_kw > 0 && kit.desbalanceamento_kw < 3) partes.push('bem balanceado')

  return partes.join(' · ')
}
