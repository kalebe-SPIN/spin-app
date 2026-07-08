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
}

export type PadraoCliente = {
  tipo_ligacao: 'monofasico' | 'bifasico' | 'trifasico'
  amperagem: number
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
  }
  racional: string              // "melhor custo-benefício" etc
  score: number                 // ranking interno
}

// ==========================================================
// CONSTANTES DE REGRAS
// ==========================================================

const CELESC_LIMITE_MONO_KW = 8
const DESBALANCEAMENTO_MAX_KW = 5
const FCI_MIN_ACEITAVEL = 100
const FCI_MAX_ACEITAVEL = 145
const FCI_SWEET_MIN = 120
const FCI_SWEET_MAX = 135
const FATOR_SEGURANCA_DISJUNTOR = 0.8

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

  // 4b. String trifásico (só se cliente tri ou bi)
  if (padrao.tipo_ligacao === 'trifasico' || padrao.tipo_ligacao === 'bifasico') {
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

  // 4c. Combinação 2 mono balanceados (pra tri/bi)
  if (padrao.tipo_ligacao === 'trifasico' || padrao.tipo_ligacao === 'bifasico') {
    for (const inv of inversoresPorTipo.mono) {
      const kit = tentarComposicao({
        placa,
        qtdPlacas,
        potCcRealKwp,
        inversorPrincipal: inv,
        qtdInversorPrincipal: 2,
        padrao,
        potCaMax,
        categoria: 'string',
        idPrefix: `2mono-${inv.codigo_weg}`,
        distribuirEntreFases: true,
      })
      if (kit) candidatos.push(kit)
    }
  }

  // 4d. Microinversor (distribuído entre fases se tri/bi)
  for (const inv of inversoresPorTipo.micro) {
    const potInvKw = inv.potencia_kw
    for (let qtd = 1; qtd <= 10; qtd++) {
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

  // Filtros de aceitação
  if (fci < FCI_MIN_ACEITAVEL || fci > FCI_MAX_ACEITAVEL) return null
  if (potCaTotal > potCaMax) return null
  if (padrao.tipo_ligacao === 'monofasico' && potCaTotal > CELESC_LIMITE_MONO_KW) return null

  // Desbalanceamento (só faz sentido se >1 inversor em bi/tri)
  let desbalanceamento = 0
  if (qtdInversorPrincipal > 1 && padrao.tipo_ligacao !== 'monofasico') {
    const numFases = padrao.tipo_ligacao === 'trifasico' ? 3 : 2
    const porFase = distribuirPorFases(inversorPrincipal.potencia_kw, qtdInversorPrincipal, numFases)
    const maxFase = Math.max(...porFase)
    const minFase = Math.min(...porFase.filter(p => p > 0))
    desbalanceamento = maxFase - minFase
    if (desbalanceamento > DESBALANCEAMENTO_MAX_KW) return null
  }

  const precoTotal = (placa.preco_venda * qtdPlacas) + (inversorPrincipal.preco_venda * qtdInversorPrincipal)

  const validacoes = {
    dentro_limite_celesc: padrao.tipo_ligacao !== 'monofasico' || potCaTotal <= CELESC_LIMITE_MONO_KW,
    dentro_disjuntor_cliente: potCaTotal <= potCaMax,
    desbalanceamento_ok: desbalanceamento <= DESBALANCEAMENTO_MAX_KW,
    fci_ideal: fci >= FCI_SWEET_MIN && fci <= FCI_SWEET_MAX,
  }

  const score = calcularScore(fci, desbalanceamento, qtdInversorPrincipal, precoTotal)

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
    }],
    pot_cc_kwp: potCcRealKwp,
    pot_ca_kw: potCaTotal,
    fci_pct: fci,
    desbalanceamento_kw: desbalanceamento,
    preco_total_kit_weg: precoTotal,
    validacoes,
    racional: '',
    score,
  }
}

// ==========================================================
// HELPERS
// ==========================================================

function calcularLimiteCelesc(fase: string): number {
  if (fase === 'monofasico') return CELESC_LIMITE_MONO_KW
  return 999 // sem limite fixo pra bi/tri (limite vem do disjuntor)
}

function calcularLimiteDisjuntor(padrao: PadraoCliente): number {
  const amp = Number(padrao.amperagem) || 0
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
    const desc = inv.tensao_desc.toLowerCase()
    const isMicro = inv.subcategoria === 'microinversor'
    const isTri = /trif/i.test(desc)
    const isMono = /monof/i.test(desc)

    if (isMicro) micro.push(inv)
    else if (isTri) tri.push(inv)
    else if (isMono) mono.push(inv)
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

function calcularScore(fci: number, desbalanceamento: number, qtdInv: number, precoTotal: number): number {
  let score = 100

  // FCI ideal (peso alto)
  if (fci >= FCI_SWEET_MIN && fci <= FCI_SWEET_MAX) score += 40
  else if (fci >= 115 && fci <= 140) score += 20
  else score -= 10

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
  if (kit.validacoes.fci_ideal) partes.push('FCI ideal (120-135%)')
  else partes.push(`FCI ${kit.fci_pct.toFixed(0)}%`)

  if (kit.inversores[0].qtd === 1) partes.push('menor complexidade')
  if (kit.desbalanceamento_kw > 0 && kit.desbalanceamento_kw < 3) partes.push('bem balanceado')

  return partes.join(' · ')
}
