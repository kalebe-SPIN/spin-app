/**
 * Estimativa de geração fotovoltaica mensal.
 *
 * Kalebe 2026-09-06: alimenta o gráfico "consumo × geração" na etapa de
 * orçamento e no PDF da proposta.
 *
 * Fórmula:
 *   geracao_kwh_mes = potencia_kwp × HSP_medio_dia × dias_mes × (1 − perdas)
 *
 * HSP (Horas de Sol Pico) é uma média mensal da irradiação diária dada em
 * kWh/m²/dia. Varia por região (fitas latitudinais brasileiras) e por mês
 * (verão × inverno).
 *
 * Fonte dos HSPs: INMET / CRESESB / normais climatológicas 1991-2020.
 * Perdas típicas 20% (sombreamento residual, temperatura, mismatch,
 * inversor, cabeamento).
 */

export type HspMensal = readonly [number, number, number, number, number, number, number, number, number, number, number, number]

/**
 * Perfis de HSP por região brasileira. Cada perfil traz 12 valores (jan → dez).
 * Escolhido pelo CEP/UF do cliente.
 */
export const HSP_REGIAO: Record<string, HspMensal> = {
  // Santa Catarina (Grande Florianópolis, Sul do estado)
  SC: [5.8, 5.5, 4.9, 4.1, 3.3, 3.0, 3.2, 4.0, 4.4, 5.0, 5.6, 5.9] as const,
  // Rio Grande do Sul (Porto Alegre)
  RS: [5.9, 5.5, 4.8, 3.8, 3.0, 2.7, 3.0, 3.8, 4.2, 5.0, 5.7, 6.0] as const,
  // Paraná (Curitiba)
  PR: [5.5, 5.2, 4.7, 4.0, 3.4, 3.1, 3.4, 4.1, 4.4, 4.9, 5.4, 5.6] as const,
  // São Paulo / MG / RJ (Sudeste)
  SUDESTE: [5.7, 5.5, 5.0, 4.5, 3.9, 3.7, 3.9, 4.6, 4.8, 5.1, 5.4, 5.6] as const,
  // Nordeste (SE, BA, AL, PE, PB, RN, CE, PI, MA — genérico)
  NE: [6.2, 6.0, 5.7, 5.2, 4.8, 4.6, 4.8, 5.4, 5.8, 6.1, 6.3, 6.3] as const,
  // Norte
  N: [5.0, 5.0, 5.1, 5.0, 4.9, 4.9, 5.0, 5.3, 5.4, 5.5, 5.4, 5.2] as const,
  // Centro-Oeste
  CO: [5.7, 5.6, 5.5, 5.3, 5.0, 4.8, 5.0, 5.5, 5.6, 5.7, 5.6, 5.7] as const,
  // Fallback nacional (média Brasil)
  BR: [5.7, 5.5, 5.1, 4.6, 4.0, 3.7, 4.0, 4.7, 4.9, 5.2, 5.5, 5.7] as const,
}

const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MESES_LABEL_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_LABEL_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const UF_TO_PERFIL: Record<string, keyof typeof HSP_REGIAO> = {
  SC: 'SC', RS: 'RS', PR: 'PR',
  SP: 'SUDESTE', RJ: 'SUDESTE', MG: 'SUDESTE', ES: 'SUDESTE',
  BA: 'NE', SE: 'NE', AL: 'NE', PE: 'NE', PB: 'NE', RN: 'NE', CE: 'NE', PI: 'NE', MA: 'NE',
  TO: 'N', PA: 'N', AP: 'N', AM: 'N', RO: 'N', AC: 'N', RR: 'N',
  MT: 'CO', MS: 'CO', GO: 'CO', DF: 'CO',
}

export function escolherPerfilPorUf(uf?: string | null): keyof typeof HSP_REGIAO {
  const u = String(uf || '').toUpperCase().slice(0, 2)
  return UF_TO_PERFIL[u] || 'BR'
}

export type EntradaGeracao = {
  potencia_kwp: number
  perdas_pct?: number          // default 20
  perfil_hsp?: keyof typeof HSP_REGIAO  // default 'SC'
  uf?: string | null           // se passado, tem prioridade sobre perfil_hsp
}

export type SerieMensal = {
  mes: number                   // 1-12
  label_curto: string           // "Jan"
  label_longo: string           // "Janeiro"
  hsp: number                   // horas de sol pico média
  dias: number
  geracao_kwh: number
}

export type ResultadoGeracao = {
  perfil: keyof typeof HSP_REGIAO
  perdas_pct: number
  potencia_kwp: number
  serie: SerieMensal[]
  total_anual_kwh: number
  media_mensal_kwh: number
  min_mensal_kwh: number
  max_mensal_kwh: number
}

/**
 * Estimativa mensal de geração pra um kit.
 */
export function estimarGeracaoMensal(entrada: EntradaGeracao): ResultadoGeracao {
  const perfil = entrada.uf ? escolherPerfilPorUf(entrada.uf) : (entrada.perfil_hsp || 'SC')
  const hsp = HSP_REGIAO[perfil]
  const perdas = (entrada.perdas_pct ?? 20) / 100
  const potencia = entrada.potencia_kwp || 0

  const serie: SerieMensal[] = hsp.map((h, i) => ({
    mes: i + 1,
    label_curto: MESES_LABEL_CURTO[i],
    label_longo: MESES_LABEL_LONGO[i],
    hsp: h,
    dias: DIAS_MES[i],
    geracao_kwh: potencia * h * DIAS_MES[i] * (1 - perdas),
  }))

  const valores = serie.map(s => s.geracao_kwh)
  const total = valores.reduce((a, b) => a + b, 0)

  return {
    perfil,
    perdas_pct: (entrada.perdas_pct ?? 20),
    potencia_kwp: potencia,
    serie,
    total_anual_kwh: total,
    media_mensal_kwh: total / 12,
    min_mensal_kwh: Math.min(...valores),
    max_mensal_kwh: Math.max(...valores),
  }
}

/** Extrai o consumo mensal do projeto (12 meses) do JSONB de fatura. */
export function extrairConsumoMensal(projeto: any): number[] | null {
  const analise = projeto?.analise_fatura
  if (!analise) return null
  // Formatos suportados:
  //   analise_fatura.consumo_mensal_12m = [k1..k12]
  //   analise_fatura.historico = [{ mes, consumo_kwh }]
  //   analise_fatura.consumo_por_mes = { jan: 100, fev: ... }
  if (Array.isArray(analise.consumo_mensal_12m) && analise.consumo_mensal_12m.length === 12) {
    return analise.consumo_mensal_12m.map((v: any) => Number(v) || 0)
  }
  if (Array.isArray(analise.historico) && analise.historico.length >= 12) {
    return analise.historico.slice(-12).map((h: any) => Number(h.consumo_kwh) || 0)
  }
  const porMes = analise.consumo_por_mes
  if (porMes && typeof porMes === 'object') {
    const chaves = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return chaves.map(k => Number(porMes[k]) || 0)
  }
  // Fallback: consumo médio mensal (se cadastrado no projeto)
  const media = Number(projeto?.consumo_kwh_mes) || 0
  if (media > 0) return Array(12).fill(media)
  return null
}
