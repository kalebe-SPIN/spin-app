/**
 * Tipagens da proposta dinâmica Spin.
 */

export type SegmentoCliente = 'residencial' | 'comercial' | 'industrial'
export type VersaoProposta = 'simplificada' | 'refinada'

/** Configuração do parâmetro (chave → número). */
export type ParametrosProposta = Record<string, number>

/** Dados brutos que alimentam todas as seções da proposta. */
export type DadosProposta = {
  // Contexto
  projeto: any
  segmento: SegmentoCliente
  versao: VersaoProposta
  itens: any[]                          // projeto_itens ativos
  parametros: ParametrosProposta
  configEmpresa: any

  // Consumo/geração
  consumoMedioKwhMes: number
  geracaoEstimadaKwhMes: number
  geracaoEstimadaKwhAno: number

  // Sistema
  potenciaKwp: number
  qtdPlacas: number
  qtdInversores: number
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico'

  // Preços
  valorTotal: number                    // preço final ao cliente
  parcelaFinanciada60x: number          // parcela em 60x (calculada com taxa de financiamento)
}

/**
 * Resultado do "Comparativo Financeiro" — a estrela da proposta.
 * Responde as 3 objeções que Kalebe sempre precisa matar.
 */
export type ComparativoFinanceiro = {
  // OBJEÇÃO 1: parcela vs conta atual
  contaAtualMensal: number              // R$ que o cliente paga hoje na CELESC
  parcelaSolarMensal: number            // R$ do financiamento
  economiaMensalDesdePrimeiroMes: number  // conta - parcela - conta_pos_solar

  // OBJEÇÃO 2: o que continua com a CELESC
  taxaMinimaDisponibilidade: number     // R$/mês da taxa mínima
  fioBCompensadoMensal: number          // R$/mês do fio B sobre geração compensada
  totalContaPosSolarMensal: number      // taxa + fio B (tudo que continua)

  // OBJEÇÃO 3: rendimento à vista
  economiaAnualMediaSolar: number       // R$/ano economizado em média
  retornoSolarPercAA: number            // % a.a. equivalente
  rendimentoCDIPercAA: number
  rendimentoPoupancaPercAA: number
  economia25Anos: number                // total economizado em 25 anos (VPL simplificado)

  // Payback
  paybackAnos: number                   // qtos anos pra pagar
}
