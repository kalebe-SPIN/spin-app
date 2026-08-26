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
  const { potencia_wallbox_kw, qtd_wallboxes, fases, distancia_qgbt_m = 10 } = entrada

  const potTotalKw = potencia_wallbox_kw * qtd_wallboxes
  const isTri = fases === 'trifasico'
  const tensao = isTri ? 380 : 220
  const fatorFase = isTri ? Math.sqrt(3) : 1
  const correnteA = (potTotalKw * 1000) / (tensao * fatorFase)
  const disjuntorA = arredondarDisjuntor(correnteA * 1.25)
  const bitola = bitolaCaSugerida(correnteA)
  const linhas: LinhaSugerida[] = []

  // 1. Disjuntor CA principal
  if (isTri) {
    linhas.push({
      produto_id: null,
      codigo_weg: `MDWH-C${disjuntorA}-3`,
      modelo: `Disjuntor CA tripolar ${disjuntorA}A curva C (MDWH)`,
      categoria: 'disjuntor',
      qtd: 1,
      preco_unitario: PRECO_REF.disjuntor_tripolar,
      origem: 'sugestao',
    })
  } else {
    linhas.push({
      produto_id: null,
      codigo_weg: `MDWP-C${disjuntorA}-2`,
      modelo: `Disjuntor CA bipolar ${disjuntorA}A curva C (MDWP)`,
      categoria: 'disjuntor',
      qtd: 1,
      preco_unitario: PRECO_REF.disjuntor_bipolar,
      origem: 'sugestao',
    })
  }

  // 2. DPS classe II — F+N mono ou 3F+N tri
  const qtdDps = isTri ? 4 : 2
  const labelFase = isTri ? '3F+N' : 'F+N'
  linhas.push({
    produto_id: null,
    codigo_weg: 'DPS-CL2-275V-20KA',
    modelo: `DPS classe II 275Vca In 10kA Imax 20kA (${labelFase})`,
    categoria: 'dps',
    qtd: qtdDps,
    preco_unitario: PRECO_REF.dps_classe2,
    origem: 'sugestao',
  })

  // 3. Cabo CA — distância × qtd condutores × fator folga 15%
  const numCondutores = isTri ? 5 : 3 // 3F+N+T ou F+N+T
  const metrosCabo = Math.ceil(distancia_qgbt_m * numCondutores * 1.15)
  linhas.push({
    produto_id: null,
    codigo_weg: `CABO-${bitola.bitola_mm2}MM2`,
    modelo: `Cabo CA ${bitola.codigo_faixa} mm² PVC (${metrosCabo}m aprox.)`,
    categoria: 'cabo',
    qtd: metrosCabo,
    preco_unitario: PRECO_REF.cabo_por_metro,
    origem: 'sugestao',
  })

  // 4. Quadro CA dedicado
  linhas.push({
    produto_id: null,
    codigo_weg: 'QCA-VE-MINI',
    modelo: 'Quadro de proteção CA dedicado VE (mini QPCA + acessórios)',
    categoria: 'quadro',
    qtd: 1,
    preco_unitario: PRECO_REF.quadro_ca_vazio,
    origem: 'sugestao',
  })

  // 5. Aterramento
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
