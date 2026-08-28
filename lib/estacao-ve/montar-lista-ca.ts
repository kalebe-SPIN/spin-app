/**
 * Sugestão automática da Lista CA da estação de recarga VE.
 *
 * Kalebe pediu 2026-08-25: "a lista CA deve ser montada a partir da
 * potência da estação de recarga". Mesma lógica do FV (montarListaComplementarCA)
 * mas dimensionada pra corrente de saída do wallbox.
 *
 * Regras SPIN aplicadas:
 *  - Wallbox mono (7.4 kW residencial): 220V F+N, disjuntor bipolar
 *  - Wallbox tri (11/22 kW comercial): 380V 3F+N, disjuntor tripolar
 *  - DPS classe II (275Vca / In 10kA / Imax 20kA): 2 unid mono (F+N) ou 4 unid tri (3F+N)
 *  - Bitola CA dimensionada por corrente × 1.25 e faixas comerciais
 *  - Quadro de Proteção CA dedicado pra VE (mini QPCA)
 *  - Aterramento haste 5/8" × 2,4m + cabo cobre nu 16mm² (padrão SPIN)
 */

export type FasesRede = 'monofasico' | 'bifasico' | 'trifasico'

export type LinhaSugerida = {
  produto_id: null          // sugestão sintética, não vem do catálogo ainda
  codigo_weg: string
  modelo: string
  categoria: string
  qtd: number
  preco_unitario: number
  origem: 'sugestao'
}

export type EntradaSugestao = {
  potencia_wallbox_kw: number
  qtd_wallboxes: number
  fases: FasesRede          // fase inferida pela potência (ver deduzirFases)
  distancia_qgbt_m?: number // metros até o quadro geral (default 10)
}

/** Grupo de wallboxes com mesma potência — usado quando o kit tem
 *  modelos diferentes e cada um precisa de proteção própria. */
export type GrupoWallbox = {
  potencia_kw: number
  qtd: number
  rotulo?: string  // ex: 'Wallbox 7.4 kW', 'Wallbox 22 kW'
}

export type EntradaSugestaoMulti = {
  grupos: GrupoWallbox[]
  fases: FasesRede
  distancia_qgbt_m?: number
}

/**
 * Deduz o tipo de rede a partir da potência do wallbox.
 * Wallbox residencial 7.4 kW ~ monofásico 220V
 * Wallbox 11/22 kW ~ trifásico 380/220V
 */
export function deduzirFasesPorPotencia(potenciaKw: number): FasesRede {
  if (potenciaKw >= 11) return 'trifasico'
  if (potenciaKw >= 7.5) return 'trifasico' // borderline — 7.4 mono / >7.4 tri
  return 'monofasico'
}

const FAIXAS_DISJUNTOR_A = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200] as const

function arredondarDisjuntor(a: number): number {
  for (const f of FAIXAS_DISJUNTOR_A) if (a <= f) return f
  return 250
}

function bitolaCaSugerida(correnteA: number): { bitola_mm2: number; codigo_faixa: string } {
  if (correnteA <= 20) return { bitola_mm2: 4, codigo_faixa: '3#4(4)+T4' }
  if (correnteA <= 32) return { bitola_mm2: 6, codigo_faixa: '3#6(6)+T6' }
  if (correnteA <= 50) return { bitola_mm2: 10, codigo_faixa: '3#10(10)+T10' }
  if (correnteA <= 80) return { bitola_mm2: 16, codigo_faixa: '3#16(16)+T16' }
  if (correnteA <= 100) return { bitola_mm2: 25, codigo_faixa: '3#25(25)+T16' }
  return { bitola_mm2: 35, codigo_faixa: '3#35(35)+T25' }
}

/**
 * Preços de referência conservadores (WEG/mercado 2026).
 * Usados como fallback — quando o produto tem cadastro no catálogo, o
 * componente substitui pelo preço real vigente.
 */
const PRECO_REF = {
  disjuntor_bipolar: 55,      // MDWP-C__-2
  disjuntor_tripolar: 90,     // MDWH-C__-3
  dps_classe2: 45,            // DPS 275V 20kA
  quadro_ca_vazio: 180,       // Q-CA pra VE, ~8 DIN
  cabo_por_metro: 7.5,        // cabo flexível PVC 4-10mm² média
  aterramento_kit: 85,        // haste 5/8" 2.4m + cabo 16mm² + conector
} as const

/**
 * Gera a Lista CA sugerida pra estação VE.
 *
 * Fluxo:
 *  1. Calcula corrente CA total (P × qtd / V / fator_fase)
 *  2. Dimensiona disjuntor (corrente × 1.25 arredondado)
 *  3. Escolhe bitola de cabo por faixa de corrente
 *  4. DPS classe II — 2 unid mono / 4 unid tri
 *  5. Quadro de proteção CA + aterramento
 */
export function sugerirListaCaVE(entrada: EntradaSugestao): LinhaSugerida[] {
  // Compat retroativa: 1 grupo com o wallbox único
  return sugerirListaCaVEMulti({
    grupos: [{
      potencia_kw: entrada.potencia_wallbox_kw,
      qtd: entrada.qtd_wallboxes,
    }],
    fases: entrada.fases,
    distancia_qgbt_m: entrada.distancia_qgbt_m,
  })
}

/**
 * Sugere lista CA pra kit com MÚLTIPLOS modelos de wallbox.
 * Kalebe 2026-08-27: 'quando os equipamentos são diferentes deve-se
 * criar uma lista para cada' — cada grupo de potência ganha proteção
 * própria (disjuntor individual + DPS + cabo ramal), compartilhando
 * quadro central + aterramento + disjuntor geral.
 *
 * Regra pra escala:
 *  - Disjuntor CA principal (QGBT) → 1, dimensionado pra corrente total
 *  - Por grupo: N disjuntores + N conjuntos de DPS + N ramais de cabo
 *  - Compartilhado: 1 quadro CA + 1 aterramento + 1 cabo principal
 */
export function sugerirListaCaVEMulti(entrada: EntradaSugestaoMulti): LinhaSugerida[] {
  const { grupos, fases, distancia_qgbt_m = 10 } = entrada
  const gruposValidos = grupos.filter((g) => g.potencia_kw > 0 && g.qtd > 0)
  if (gruposValidos.length === 0) return []

  const isTri = fases === 'trifasico'
  const isBi = fases === 'bifasico'
  // 220V pra mono/bi (residencial predial); 380V pra tri (fase-fase = 380, fase-neutro = 220)
  const tensao = isTri ? 380 : 220
  // Fator de fase pra P = V × I × fator: 1 (mono), 2 (bi 2F+N), sqrt(3) (tri 3F+N)
  const fatorFase = isTri ? Math.sqrt(3) : (isBi ? 2 : 1)
  // DPS: 1 por fase + 1 pro neutro
  const qtdDpsPorRamal = isTri ? 4 : (isBi ? 3 : 2)
  const labelFase = isTri ? '3F+N' : (isBi ? '2F+N' : 'F+N')
  // Condutores: F+N+T (3), 2F+N+T (4), 3F+N+T (5)
  const numCondutores = isTri ? 5 : (isBi ? 4 : 3)

  // Totais pra dimensionar disjuntor principal + cabo principal
  const potTotalKw = gruposValidos.reduce((s, g) => s + g.potencia_kw * g.qtd, 0)
  const correnteTotalA = (potTotalKw * 1000) / (tensao * fatorFase)
  const disjuntorPrincipalA = arredondarDisjuntor(correnteTotalA * 1.25)
  const bitolaPrincipal = bitolaCaSugerida(correnteTotalA)

  const linhas: LinhaSugerida[] = []

  // 1. Disjuntor CA principal (QGBT → quadro da estação)
  linhas.push({
    produto_id: null,
    codigo_weg: isTri ? `MDWH-C${disjuntorPrincipalA}-3` : `MDWP-C${disjuntorPrincipalA}-2`,
    modelo: `Disjuntor CA principal ${isTri ? 'tripolar' : 'bipolar'} ${disjuntorPrincipalA}A curva C (proteção geral da estação)`,
    categoria: 'disjuntor',
    qtd: 1,
    preco_unitario: isTri ? PRECO_REF.disjuntor_tripolar : PRECO_REF.disjuntor_bipolar,
    origem: 'sugestao',
  })

  // 2. Por grupo: disjuntor individual + DPS ramal + cabo ramal
  for (const g of gruposValidos) {
    const correnteInd = (g.potencia_kw * 1000) / (tensao * fatorFase)
    const disjuntorIndA = arredondarDisjuntor(correnteInd * 1.25)
    const rotulo = g.rotulo || `wallbox ${g.potencia_kw}kW`
    const codigoInd = isTri ? `MDWH-C${disjuntorIndA}-3` : `MDWP-C${disjuntorIndA}-2`

    // Disjuntor individual — 1 por wallbox
    linhas.push({
      produto_id: null,
      codigo_weg: codigoInd,
      modelo: `Disjuntor CA ${isTri ? 'tripolar' : 'bipolar'} ${disjuntorIndA}A curva C — ${rotulo}`,
      categoria: 'disjuntor',
      qtd: g.qtd,
      preco_unitario: isTri ? PRECO_REF.disjuntor_tripolar : PRECO_REF.disjuntor_bipolar,
      origem: 'sugestao',
    })

    // DPS ramal — qtdDps por wallbox
    linhas.push({
      produto_id: null,
      codigo_weg: 'DPS-CL2-275V-20KA',
      modelo: `DPS classe II 275Vca 10kA/20kA ${labelFase} — ${rotulo}`,
      categoria: 'dps',
      qtd: qtdDpsPorRamal * g.qtd,
      preco_unitario: PRECO_REF.dps_classe2,
      origem: 'sugestao',
    })

    // Cabo ramal — do quadro central até cada wallbox (5m padrão × qtd × condutores × 1.15)
    const bitolaInd = bitolaCaSugerida(correnteInd)
    const metrosRamal = Math.ceil(5 * numCondutores * 1.15 * g.qtd)
    linhas.push({
      produto_id: null,
      codigo_weg: `CABO-${bitolaInd.bitola_mm2}MM2`,
      modelo: `Cabo CA ramal ${bitolaInd.codigo_faixa} mm² PVC (${metrosRamal}m aprox., ${g.qtd}× ramais) — ${rotulo}`,
      categoria: 'cabo',
      qtd: metrosRamal,
      preco_unitario: PRECO_REF.cabo_por_metro,
      origem: 'sugestao',
    })
  }

  // 3. Cabo principal — QGBT → quadro da estação (compartilhado)
  const metrosCaboPrincipal = Math.ceil(distancia_qgbt_m * numCondutores * 1.15)
  linhas.push({
    produto_id: null,
    codigo_weg: `CABO-${bitolaPrincipal.bitola_mm2}MM2`,
    modelo: `Cabo CA principal ${bitolaPrincipal.codigo_faixa} mm² PVC (${metrosCaboPrincipal}m aprox., QGBT → estação)`,
    categoria: 'cabo',
    qtd: metrosCaboPrincipal,
    preco_unitario: PRECO_REF.cabo_por_metro,
    origem: 'sugestao',
  })

  // 4. Quadro CA (central)
  linhas.push({
    produto_id: null,
    codigo_weg: 'QCA-VE-MINI',
    modelo: 'Quadro de proteção CA dedicado VE (mini QPCA + acessórios)',
    categoria: 'quadro',
    qtd: 1,
    preco_unitario: PRECO_REF.quadro_ca_vazio,
    origem: 'sugestao',
  })

  // 5. Aterramento (compartilhado)
  linhas.push({
    produto_id: null,
    codigo_weg: 'ATERRAMENTO-KIT',
    modelo: 'Kit aterramento: haste 5/8" × 2,4m + cabo cobre nu 16mm² + conector',
    categoria: 'conector',
    qtd: 1,
    preco_unitario: PRECO_REF.aterramento_kit,
    origem: 'sugestao',
  })

  return linhas
}

/**
 * Resumo textual do cálculo pra exibir na UI.
 */
export function resumoDimensionamento(entrada: EntradaSugestao): string {
  const { potencia_wallbox_kw, qtd_wallboxes, fases } = entrada
  const potTotalKw = potencia_wallbox_kw * qtd_wallboxes
  const isTri = fases === 'trifasico'
  const tensao = isTri ? '380/220V' : '220V'
  const fatorFase = isTri ? Math.sqrt(3) : 1
  const correnteA = (potTotalKw * 1000) / ((isTri ? 380 : 220) * fatorFase)
  return `${qtd_wallboxes}× ${potencia_wallbox_kw}kW = ${potTotalKw}kW · ${fases} ${tensao} · ${correnteA.toFixed(1)}A`
}
