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

export const PARAMETROS_DEFAULT: ParametrosOrcamento = {
  preco_medio_kwh_celesc: 0.75,
  fator_dimensionamento_sc: 4.0,
  potencia_padrao_modulo_wp: 555,
  preco_medio_kwp_instalado: 6000,
  kit_por_faixa_kwp: [
    { min: 0,    max: 5,   descricao: '~5,5 kWp · 10 mód WEG 555W · 1 inv WEG 5K mono' },
    { min: 5,    max: 10,  descricao: '~8,9 kWp · 16 mód WEG 555W · 1 inv WEG 8K mono' },
    { min: 10,  max: 20,  descricao: '~13,3 kWp · 24 mód WEG 555W · 1 inv WEG 15K tri' },
    { min: 20,  max: 40,  descricao: '~27,7 kWp · 50 mód WEG 555W · 1 inv WEG 25K tri' },
    { min: 40,  max: 999, descricao: 'Sob dimensionamento — sugerir visita técnica' },
  ],
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
