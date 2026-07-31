/**
 * Tipos e interface comum pros adaptadores de Orçamento Rápido.
 * Cada vertical (solar, BESS, VE, serviços, aluguel, construção) implementa
 * um adaptador que segue essa interface.
 */

import type { TipoItem } from '@/lib/tipos-projeto'

export type ModoEntrada =
  | 'fatura'           // PDF/imagem da conta de luz (usa OCR)
  | 'valor_mensal'     // R$/mês (converte pra kWh via preço médio CELESC)
  | 'consumo_kwh'      // kWh/mês direto
  | 'qtd_placas'       // quantidade de placas desejada / a limpar / a instalar
  | 'backup_kwh'       // BESS: kWh de autonomia backup desejada
  | 'modelo_carro'     // VE: modelo do carro pra sugerir carregador
  | 'qtd_diarias'      // Aluguel: diárias × equipamento
  | 'descricao_livre'  // Serviços/construção/outros: descrição + valor estimado

/**
 * Parâmetros globais editáveis pelo admin — usados por todos os adaptadores.
 * Ficam em cache no cliente (SSR) e recarregam quando admin altera.
 */
export type ParametrosOrcamento = {
  preco_medio_kwh_celesc: number       // R$/kWh, default 0.75
  fator_dimensionamento_sc: number     // horas de sol/dia SC, default 4.0
  potencia_padrao_modulo_wp: number    // Wp por painel, default 555
  preco_medio_kwp_instalado: number    // R$/kWp completo, default 6000
  // Kit sugerido por faixa de kWp
  kit_por_faixa_kwp: {
    min: number
    max: number
    descricao: string
  }[]
}

// ⚠️ TODO KALEBE — valores abaixo são placeholders. Precisam vir do painel
// admin/precificacao (a criar) OU serem confirmados por Kalebe:
//   - preco_medio_kwh_celesc: R$/kWh que aparece na fatura CELESC (~0,75-0,90 varia mês)
//   - fator_dimensionamento_sc: horas de sol/dia em SC (3,9-4,4 depende da cidade)
//   - preco_medio_kwp_instalado: R$/kWp instalado — CHUTE ATUAL FICOU MUITO ACIMA (Kalebe apontou 2026-07-31)
// Enquanto isso, o adaptador solar já busca placas e inversores REAIS do catálogo
// Supabase (ver lib/orcamento-rapido/catalogo.ts) — só o R$/kWp final ainda usa esse fallback.
export const PARAMETROS_DEFAULT: ParametrosOrcamento = {
  preco_medio_kwh_celesc: 0.75,
  fator_dimensionamento_sc: 4.0,
  // potencia_padrao_modulo_wp: DEPRECATED — usar placaPadrao() do catalogo.ts
  potencia_padrao_modulo_wp: 615, // 615 Wp WEG BIFACIAL é a placa hoje disponível
  // preco_medio_kwp_instalado: DEPRECATED — usar montarKit() do catalogo.ts e somar custos reais
  preco_medio_kwp_instalado: 4200, // ⚠️ ESTIMATIVA — confirmar com Kalebe
  kit_por_faixa_kwp: [], // vazio — kit vem dinâmico do catálogo agora
}

/** Tipo de rede elétrica pra escolha do inversor no Orçamento Rápido */
export type TipoRede = 'mono_220' | 'bi_220' | 'tri_220' | 'tri_380'

export const TIPOS_REDE_INFO: Record<TipoRede, { label: string; fases: 'mono' | 'bi' | 'tri'; tensao: 220 | 380; hint: string }> = {
  mono_220: { label: 'Monofásico 220V', fases: 'mono', tensao: 220, hint: 'Residencial pequeno (padrão ≤ 40A)' },
  bi_220:   { label: 'Bifásico 220V',   fases: 'bi',   tensao: 220, hint: 'Residencial médio (padrão 60-80A)' },
  tri_220:  { label: 'Trifásico 220V',  fases: 'tri',  tensao: 220, hint: 'Comercial/rural (rede antiga)' },
  tri_380:  { label: 'Trifásico 380V',  fases: 'tri',  tensao: 380, hint: 'Comercial/industrial (padrão moderno)' },
}

/** Fator de dimensionamento (horas sol/dia) por macrorregião SC. Valores CRESESB médios anuais. */
export const FATOR_SOL_POR_CIDADE: Record<string, number> = {
  florianopolis: 4.10,
  saojose: 4.10,
  palhoca: 4.10,
  biguacu: 4.10,
  tijucas: 4.15,
  itajai: 4.15,
  balnearioCamboriu: 4.15,
  itapema: 4.15,
  brusque: 4.20,
  blumenau: 4.20,
  joinville: 4.15,
  jaragua: 4.20,
  chapeco: 4.35,
  concordia: 4.30,
  xanxere: 4.35,
  lages: 4.25,
  criciuma: 4.05,
  tubarao: 4.05,
  araranguá: 4.00,
  saoBento: 4.20,
  rioNegrinho: 4.15,
}

/** Retorna fator de sol pra cidade (case-insensitive, sem acentos), fallback default. */
export function fatorSolPorCidade(cidade: string | undefined | null, fallback = 4.10): number {
  if (!cidade) return fallback
  // Remove acentos combinantes (U+0300..U+036F), espaços, hífens e apóstrofos
  const chave = cidade
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s'-]/g, '')
  return FATOR_SOL_POR_CIDADE[chave] || fallback
}

/**
 * Resultado padrão da calculadora — mesmo formato pra todos os verticais.
 * `resumo` é o que o cliente vê. `estimativa_tecnica` é opcional (só solar/BESS).
 */
export type ResultadoOrcamento = {
  valor_estimado: number
  resumo: string                    // "Sistema solar 5,55 kWp · Kit ~10 mód WEG"
  detalhes: {                       // linhas apresentáveis
    label: string
    valor: string
  }[]
  estimativa_tecnica?: Record<string, unknown> // { kwp, kit, ... }
  observacao_padrao: string         // "*valor sujeito a análise técnica*"
}

/**
 * Interface comum implementada por cada adaptador de vertical.
 */
export interface AdaptadorOrcamento<TEntrada = Record<string, unknown>> {
  tipoItem: TipoItem | TipoItem[]              // 1 adaptador pode servir vários tipos
  label: string                                 // "Solar on-grid" / "Limpeza fotovoltaica"
  emoji: string
  modosSuportados: ModoEntrada[]
  descricaoModo(modo: ModoEntrada): string     // "Digite o consumo médio em kWh/mês"
  placeholderModo(modo: ModoEntrada): string   // "Ex: 400"
  unidadeModo(modo: ModoEntrada): string       // "kWh/mês" / "placas"
  calcular(entrada: TEntrada, params: ParametrosOrcamento): ResultadoOrcamento
  formatarWhatsApp(
    entrada: TEntrada,
    resultado: ResultadoOrcamento,
    empresa: { nome: string; consultor: string },
    ajuste: number,          // valor final após ajuste manual do consultor
  ): string
}

/**
 * Escolhe kit sugerido pela faixa de kWp.
 */
export function escolherKitSugerido(kwp: number, params: ParametrosOrcamento): string {
  const faixa = params.kit_por_faixa_kwp.find(f => kwp >= f.min && kwp < f.max)
  return faixa?.descricao ?? params.kit_por_faixa_kwp[params.kit_por_faixa_kwp.length - 1].descricao
}

/**
 * Formata número BR pra R$ com 2 casas.
 */
export function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
