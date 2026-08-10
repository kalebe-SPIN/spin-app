/**
 * Valores da proposta do PROFISSIONAL DE CAMPO (empreitada por OS).
 * Fonte única — tela, simulador e (futuro) PDF/contrato leem daqui.
 *
 * Modelo: contratação por demanda, via ordem de serviço (OS), tipo empreitada.
 *   Valor da OS = BASE + POR_PLACA × nº de placas + POR_KM × km (ida e volta).
 *   NF por serviço executado; recebe a cada serviço.
 */
export const OS_BASE = 150        // R$ de largada por OS
export const OS_POR_PLACA = 2     // R$ por placa limpa e revisada
export const OS_POR_KM = 1        // R$ por km rodado (ida e volta)

export function valorOS(placas: number, km: number): number {
  const p = Math.max(0, placas || 0)
  const k = Math.max(0, km || 0)
  return OS_BASE + OS_POR_PLACA * p + OS_POR_KM * k
}
