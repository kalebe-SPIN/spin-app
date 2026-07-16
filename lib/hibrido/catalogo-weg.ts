/**
 * Catálogo WEG para Sistemas Híbridos com Armazenamento (BESS).
 * Constantes baseadas nas regras que Kalebe passou.
 *
 * REGRAS DE PARALELISMO DE BATERIAS:
 *   • Inversor MONO (SIW200H): 1 entrada × 4 baterias = 4 max por inversor
 *   • Inversor TRI (SIW400H): 2 entradas × 4 baterias = 8 max por inversor
 *   • Ligação em paralelo requer JBW 41DC 50A W0
 *
 * REGRA CRÍTICA DE HOMOGENEIDADE:
 *   TODAS as baterias devem ter a MESMA capacidade — ou tudo 5kWh OU tudo 10kWh.
 *   NUNCA misturar, mesmo em entradas diferentes.
 *
 * PARALELISMO DE INVERSORES:
 *   • Controlador EMBOX (gerenciamento do paralelismo)
 *   • Multimedidor MMW03-M22CH (medição + comunicação queda de energia)
 *   • Os dois trabalham juntos — quando tem paralelismo, ambos são obrigatórios
 */

// ═══════════════════ INVERSORES HÍBRIDOS ═══════════════════

export type InversorHibrido = {
  modelo: string
  codigo_weg: string
  fase: 'monofasico' | 'trifasico'
  potencia_kw: number
  entradas_bateria: number       // 1 (mono) ou 2 (tri)
  max_baterias_por_entrada: number  // 4 sempre (via JBW)
  suporta_paralelismo: boolean
  descricao: string
}

export const INVERSORES_HIBRIDOS_WEG: InversorHibrido[] = [
  // Monofásico — 1 entrada × 4 baterias = 4 max
  { modelo: 'SIW200H 3kW',  codigo_weg: 'SIW200H-M030', fase: 'monofasico', potencia_kw: 3,
    entradas_bateria: 1, max_baterias_por_entrada: 4, suporta_paralelismo: true,
    descricao: 'Inversor híbrido monofásico 3kW · máx 4 baterias' },
  { modelo: 'SIW200H 5kW',  codigo_weg: 'SIW200H-M050', fase: 'monofasico', potencia_kw: 5,
    entradas_bateria: 1, max_baterias_por_entrada: 4, suporta_paralelismo: true,
    descricao: 'Inversor híbrido monofásico 5kW · máx 4 baterias' },
  { modelo: 'SIW200H 8kW',  codigo_weg: 'SIW200H-M080', fase: 'monofasico', potencia_kw: 8,
    entradas_bateria: 1, max_baterias_por_entrada: 4, suporta_paralelismo: true,
    descricao: 'Inversor híbrido monofásico 8kW · limite CELESC mono' },

  // Trifásico — 2 entradas × 4 baterias = 8 max
  { modelo: 'SIW400H 10kW', codigo_weg: 'SIW400H-T100', fase: 'trifasico',  potencia_kw: 10,
    entradas_bateria: 2, max_baterias_por_entrada: 4, suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 10kW · máx 8 baterias (2 entradas × 4)' },
  { modelo: 'SIW400H 15kW', codigo_weg: 'SIW400H-T150', fase: 'trifasico',  potencia_kw: 15,
    entradas_bateria: 2, max_baterias_por_entrada: 4, suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 15kW · máx 8 baterias' },
  { modelo: 'SIW400H 20kW', codigo_weg: 'SIW400H-T200', fase: 'trifasico',  potencia_kw: 20,
    entradas_bateria: 2, max_baterias_por_entrada: 4, suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 20kW · máx 8 baterias' },
  { modelo: 'SIW400H 30kW', codigo_weg: 'SIW400H-T300', fase: 'trifasico',  potencia_kw: 30,
    entradas_bateria: 2, max_baterias_por_entrada: 4, suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 30kW · comercial · máx 8 baterias' },
]

// ═══════════════════ BATERIAS ═══════════════════

export type Bateria = {
  modelo: string
  codigo_weg: string
  capacidade_kwh: number
  potencia_continua_kw: number  // ← NOVO: taxa C1 (descarrega em 1h)
  descricao: string
}

export const BATERIAS_WEG: Bateria[] = [
  { modelo: 'SBW CB050 W00', codigo_weg: 'SBW-CB050-W00', capacidade_kwh: 5, potencia_continua_kw: 5,
    descricao: 'Bateria WEG 5 kWh — Lítio LiFePO4 modular · pot. contínua 5kW (1C)' },
  { modelo: 'SBW CB100 W00', codigo_weg: 'SBW-CB100-W00', capacidade_kwh: 10, potencia_continua_kw: 10,
    descricao: 'Bateria WEG 10 kWh — Lítio LiFePO4 modular · pot. contínua 10kW (1C)' },
]

// ═══════════════════ COMPONENTES OBRIGATÓRIOS/OPCIONAIS ═══════════════════

export const MULTIMEDIDOR_WEG = {
  modelo: 'MMW03-M22CH',
  codigo_weg: 'MMW03-M22CH',
  descricao:
    'Multimedidor MMW03-M22CH — comunicação com inversor pra detectar queda de energia e ativar modo off-grid (EPS/backup). Obrigatório também no paralelismo de inversores.',
  obrigatorio: true,
}

export const CAIXA_JUNCAO_WEG = {
  modelo: 'JBW 41DC 50A W0',
  codigo_weg: 'JBW-41DC-50A-W0',
  descricao: 'Caixa de junção DC — permite paralelismo de até 4 baterias por entrada no inversor',
  max_baterias_por_caixa: 4,
}

export const CONTROLADOR_PARALELISMO_WEG = {
  modelo: 'EMBOX',
  codigo_weg: 'WEG-EMBOX',
  descricao:
    'Controlador EMBOX — obrigatório para paralelismo de inversores. Faz aumento de potência despachada, peak shaving e complementação de demanda. Precisa do multimedidor MMW03-M22CH pra funcionar.',
  obrigatorio_se_paralelismo: true,
}

// ═══════════════════ HELPERS ═══════════════════

/**
 * Retorna inversores compatíveis com o tipo de rede + potência mínima necessária.
 */
export function inversoresCompativeis(
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico',
  potenciaMinKw: number,
): InversorHibrido[] {
  const fase = tipoLigacao === 'trifasico' ? 'trifasico' : 'monofasico'
  return INVERSORES_HIBRIDOS_WEG.filter(
    (i) => i.fase === fase && i.potencia_kw >= potenciaMinKw,
  ).sort((a, b) => a.potencia_kw - b.potencia_kw)
}

/**
 * Capacidade máxima de baterias por inversor:
 *   Mono: 1 entrada × 4 = 4
 *   Tri:  2 entradas × 4 = 8
 */
export function maxBateriasPorInversor(inv: InversorHibrido): number {
  return inv.entradas_bateria * inv.max_baterias_por_entrada
}

/**
 * Calcula qtd de caixas de junção JBW necessárias.
 * Regra: 1 caixa por entrada de bateria QUE tenha mais de 1 bateria em paralelo.
 * Como distribuímos igualmente, se qtdBaterias > entradas → precisa JBW em todas as entradas.
 */
export function calcularQtdCaixasJuncao(qtdBaterias: number, totalEntradas: number): number {
  if (qtdBaterias <= totalEntradas) return 0 // 1 bat direto na entrada, sem paralelismo
  return totalEntradas // 1 JBW por entrada
}

/**
 * Margem de segurança do inversor conforme composição de cargas.
 * Cargas indutivas têm pico de partida ~3-5× nominal (motores, ar cond, geladeira).
 * Cargas capacitivas geram harmônicos (mas não pico de partida).
 * Cargas resistivas são lineares (chuveiro, incandescente, forno).
 */
export function calcularMargemInversor(percIndutiva: number, percCapacitiva: number): {
  fator: number
  motivo: string
} {
  // Indutiva alta = precisa margem grande pro pico de partida
  if (percIndutiva >= 60) {
    return { fator: 1.6, motivo: `${percIndutiva.toFixed(0)}% indutiva — margem 60% para picos de partida de motores/ar cond` }
  }
  if (percIndutiva >= 40) {
    return { fator: 1.4, motivo: `${percIndutiva.toFixed(0)}% indutiva — margem 40% para picos de partida` }
  }
  if (percIndutiva >= 20) {
    return { fator: 1.25, motivo: `${percIndutiva.toFixed(0)}% indutiva — margem 25%` }
  }
  // Capacitiva alta = pode gerar THD alto, precisa margem menor
  if (percCapacitiva >= 60) {
    return { fator: 1.15, motivo: `${percCapacitiva.toFixed(0)}% capacitiva — margem 15% por harmônicos` }
  }
  // Predominantemente resistiva
  return { fator: 1.1, motivo: 'Carga majoritariamente resistiva — margem 10%' }
}
