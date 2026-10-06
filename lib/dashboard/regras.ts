import { STATUS_FECHADOS, dataFechamento, valorVendaProjeto } from '@/lib/financeiro/vendas-sistema'

/**
 * Regras únicas dos números do Dashboard (Kalebe 2026-10-06: "cada um dos
 * campos eu posso acessar a lista dele"). O painel conta e a lista
 * (/dashboard/lista) mostra com EXATAMENTE a mesma regra. Sem imports de
 * servidor.
 */

export { STATUS_FECHADOS }
/** Proposta viva (em negociação). */
export const STATUS_PROPOSTA = ['proposta_enviada', 'negociando', 'em_fechamento']
/** PDF gerado = proposta emitida (Kalebe 2026-09-16). */
export const STATUS_PROPOSTA_EMITIDA = new Set([
  'orcamento_gerado', 'proposta_enviada', 'negociando', 'em_fechamento',
  ...STATUS_FECHADOS, 'recusado', 'expirado', 'cancelado',
])
/** Perdidos: os mesmos da coluna "Perdido" do pipeline (+ grafias antigas). */
export const STATUS_PERDIDOS = new Set(['recusado', 'cancelado', 'expirado', 'perdido', 'perdida', 'cancelada', 'desistiu'])

export const hojeBRT = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

/** Mês 'YYYY-MM' → { de: 'YYYY-MM-01', ate: 1º dia do mês seguinte } (datas BRT). */
export function janelaMes(mes?: string | null): { mes: string; de: string; ate: string } {
  const m = /^\d{4}-\d{2}$/.test(mes || '') ? mes! : hojeBRT().slice(0, 7)
  const [a, mm] = m.split('-').map(Number)
  const prox = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`
  return { mes: m, de: `${m}-01`, ate: `${prox}-01` }
}

/** Data (BRT, YYYY-MM-DD) de um timestamp. */
export const diaBRT = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : ''

/**
 * Venda fechada no mês: status de fechado + DATA DA VENDA no mês. A data é a
 * informada no fechamento ou a 1ª entrada em "vendido" — não a última troca
 * de etapa (uma venda de agosto que foi pra homologação em outubro NÃO é
 * venda de outubro). Mesma regra do fluxo de caixa.
 */
export function dataDaVenda(p: any, primeiroFechamento?: Map<string, string>): string {
  return dataFechamento(p, primeiroFechamento)
}
export function fechadoNoMes(p: any, janela: { de: string; ate: string }, primeiroFechamento?: Map<string, string>): boolean {
  if (!STATUS_FECHADOS.includes(p.status)) return false
  const d = dataDaVenda(p, primeiroFechamento)
  return !!d && d >= janela.de && d < janela.ate
}

/** Valor da venda: o acordado no fechamento (não o simulado da proposta). */
export const valorDaVenda = (p: any) => valorVendaProjeto(p)

/** Valor da proposta (multi-UC: consolidado). */
export const valorDaProposta = (p: any): number =>
  Number(p.pv_total || p.orcamento_consolidado?.pv_total || p.orcamento_final?.pv_total) || 0

/** Um cliente = um lead (dedupe por cliente). */
export const chaveCliente = (p: any) => String(p.cliente_id || p.cliente_razao_social || p.id)
