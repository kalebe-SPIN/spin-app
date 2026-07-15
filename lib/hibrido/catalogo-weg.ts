/**
 * Catálogo WEG para Sistemas Híbridos com Armazenamento (BESS).
 * Constantes baseadas nas regras que Kalebe passou.
 */

// ═══════════════════ INVERSORES HÍBRIDOS ═══════════════════

export type InversorHibrido = {
  modelo: string
  codigo_weg: string
  fase: 'monofasico' | 'trifasico'
  potencia_kw: number
  entradas_bateria: number   // qtas baterias suporta por entrada (parcial)
  suporta_paralelismo: boolean
  descricao: string
}

export const INVERSORES_HIBRIDOS_WEG: InversorHibrido[] = [
  // Monofásico
  {
    modelo: 'SIW200H 3kW',
    codigo_weg: 'SIW200H-M030',
    fase: 'monofasico',
    potencia_kw: 3,
    entradas_bateria: 1,
    suporta_paralelismo: true,
    descricao: 'Inversor híbrido monofásico 3kW · até 4 baterias por entrada',
  },
  {
    modelo: 'SIW200H 5kW',
    codigo_weg: 'SIW200H-M050',
    fase: 'monofasico',
    potencia_kw: 5,
    entradas_bateria: 1,
    suporta_paralelismo: true,
    descricao: 'Inversor híbrido monofásico 5kW · até 4 baterias por entrada',
  },
  {
    modelo: 'SIW200H 8kW',
    codigo_weg: 'SIW200H-M080',
    fase: 'monofasico',
    potencia_kw: 8,
    entradas_bateria: 1,
    suporta_paralelismo: true,
    descricao: 'Inversor híbrido monofásico 8kW · limite CELESC mono',
  },
  // Trifásico
  {
    modelo: 'SIW400H 10kW',
    codigo_weg: 'SIW400H-T100',
    fase: 'trifasico',
    potencia_kw: 10,
    entradas_bateria: 2,
    suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 10kW · até 8 baterias (2 entradas × 4)',
  },
  {
    modelo: 'SIW400H 15kW',
    codigo_weg: 'SIW400H-T150',
    fase: 'trifasico',
    potencia_kw: 15,
    entradas_bateria: 2,
    suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 15kW',
  },
  {
    modelo: 'SIW400H 20kW',
    codigo_weg: 'SIW400H-T200',
    fase: 'trifasico',
    potencia_kw: 20,
    entradas_bateria: 2,
    suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 20kW',
  },
  {
    modelo: 'SIW400H 30kW',
    codigo_weg: 'SIW400H-T300',
    fase: 'trifasico',
    potencia_kw: 30,
    entradas_bateria: 2,
    suporta_paralelismo: true,
    descricao: 'Inversor híbrido trifásico 30kW · comercial',
  },
]

// ═══════════════════ BATERIAS ═══════════════════

export type Bateria = {
  modelo: string
  codigo_weg: string
  capacidade_kwh: number
  descricao: string
}

export const BATERIAS_WEG: Bateria[] = [
  {
    modelo: 'SBW CB050 W00',
    codigo_weg: 'SBW-CB050-W00',
    capacidade_kwh: 5,
    descricao: 'Bateria WEG 5 kWh — Lítio LiFePO4 modular',
  },
  {
    modelo: 'SBW CB100 W00',
    codigo_weg: 'SBW-CB100-W00',
    capacidade_kwh: 10,
    descricao: 'Bateria WEG 10 kWh — Lítio LiFePO4 modular',
  },
]

// ═══════════════════ COMPONENTES OBRIGATÓRIOS/OPCIONAIS ═══════════════════

export const MULTIMEDIDOR_WEG = {
  modelo: 'Multimedidor SIW-MMED',
  codigo_weg: 'SIW-MMED-01',
  descricao:
    'Multimedidor obrigatório — comunicação com inversor pra detectar queda de energia e ativar modo off-grid (backup EPS)',
  obrigatorio: true,
}

export const CAIXA_JUNCAO_WEG = {
  modelo: 'JBW 41DC 50A W0',
  codigo_weg: 'JBW-41DC-50A-W0',
  descricao: 'Caixa de junção DC — permite paralelismo de até 4 baterias por entrada no inversor',
  max_baterias_por_caixa: 4,
}

export const CONTROLADOR_PARALELISMO_WEG = {
  modelo: 'Controlador paralelismo SIW-CTRL',
  codigo_weg: 'SIW-CTRL-PAR',
  descricao:
    'Controlador para paralelismo de inversores — permite aumento de potência despachada, peak shaving e complementação de demanda',
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
 * Calcula qtd de caixas de junção JBW necessárias.
 * Regra: 1 caixa por entrada de bateria do inversor SE tiver mais que 1 bateria naquela entrada.
 */
export function calcularQtdCaixasJuncao(qtdBaterias: number, entradasInversor: number): number {
  if (qtdBaterias <= entradasInversor) return 0 // 1 bat direto na entrada, sem caixa
  return entradasInversor // 1 caixa por entrada quando há paralelismo
}
