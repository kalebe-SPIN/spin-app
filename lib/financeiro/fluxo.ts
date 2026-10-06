/**
 * Fluxo de caixa — previsto × realizado (Kalebe 2026-09-29).
 * Sem import de servidor: usado nas telas e nas server actions.
 */

export type Direcao = 'entrada' | 'saida'
export type Grupo =
  | 'receita_vendas' | 'outras_receitas'
  | 'fornecedores' | 'impostos' | 'passivo_bancario' | 'capital_giro' | 'comissoes'
  | 'custos_projeto' | 'pessoal' | 'despesas_operacionais' | 'outras_despesas'

export type Lancamento = {
  id: string
  direcao: Direcao
  grupo: Grupo
  categoria_id: string | null
  descricao: string
  valor_previsto: number
  data_prevista: string
  valor_realizado: number | null
  data_realizada: string | null
  forma_pagamento: string | null
  parcela_num: number | null
  parcelas_total: number | null
  fornecedor_id: string | null
  passivo_id: string | null
  projeto_id: string | null
  programacao_id: string | null
  origem: 'manual' | 'projeto' | 'venda_manual' | 'passivo'
  lote_id: string | null
  detalhes: Record<string, any>
  observacoes: string | null
  /** Kalebe 2026-10-02 (mig 136): com o que foi pago — conta, cartão ou caixa */
  conta_id?: string | null
  /** Cartão: conta bancária de onde saiu o pagamento da fatura */
  pago_pela_conta_id?: string | null
}

/** Conta bancária, cartão de crédito ou caixa (mig 136). */
export type ContaFluxo = {
  id: string
  tipo: 'conta_bancaria' | 'cartao_credito' | 'caixa'
  nome: string
  banco: string | null
  final: string | null
  dia_fechamento: number | null
  dia_vencimento: number | null
  saldo_inicial: number
  ativo: boolean
}

export const ICONE_CONTA: Record<ContaFluxo['tipo'], string> = { conta_bancaria: '🏦', cartao_credito: '💳', caixa: '💵' }

export const rotuloConta = (c: Pick<ContaFluxo, 'tipo' | 'nome' | 'final'>) =>
  `${ICONE_CONTA[c.tipo]} ${c.nome}${c.final ? ` •••• ${c.final}` : ''}`

/**
 * Vencimento da fatura em que cai uma compra no cartão. Compra até a véspera
 * do fechamento entra na fatura que fecha naquele mês; do dia do fechamento
 * em diante, na seguinte. Vencimento depois do fechamento = mesmo mês; antes
 * (ex.: fecha 28, vence 5) = mês seguinte.
 */
export function vencimentoFatura(dataCompra: string, diaFechamento: number, diaVencimento: number): string {
  const [a, m, d] = dataCompra.split('-').map(Number)
  const primeiroDoMes = `${a}-${String(m).padStart(2, '0')}-01`
  const mesFechamento = addMeses(primeiroDoMes, d < diaFechamento ? 0 : 1)
  return addMeses(mesFechamento, diaVencimento > diaFechamento ? 0 : 1, diaVencimento)
}

/** Datas (vencimento de fatura) de cada parcela/repetição de uma compra no cartão. */
export function datasNoCartao(
  dataCompra: string, qtd: number, rep: 'unica' | 'parcelado' | 'recorrente',
  diaFechamento: number, diaVencimento: number,
): string[] {
  const primeira = vencimentoFatura(dataCompra, diaFechamento, diaVencimento)
  return Array.from({ length: Math.max(1, qtd) }, (_, i) => rep === 'recorrente'
    ? vencimentoFatura(addMeses(dataCompra, i), diaFechamento, diaVencimento)
    : addMeses(primeira, i, diaVencimento))
}

/** Conta onde o dinheiro de fato entrou/saiu (cartão: a conta que pagou a fatura). */
export const contaDoCaixa = (l: Lancamento) => l.pago_pela_conta_id || l.conta_id || null

/** Saldo efetivado de uma conta bancária/caixa até a data (saldo inicial + realizados). */
export function saldoDaConta(lancs: Lancamento[], conta: ContaFluxo, cfg: ConfigFluxo, data: string): number {
  let s = Number(conta.saldo_inicial) || 0
  for (const l of lancs) {
    if (!l.data_realizada || l.data_realizada < cfg.data_inicio || l.data_realizada > data) continue
    if (contaDoCaixa(l) !== conta.id) continue
    s += (l.direcao === 'entrada' ? 1 : -1) * (Number(l.valor_realizado) || 0)
  }
  return arred(s)
}

export type ConfigFluxo = {
  saldo_inicial: number
  data_inicio: string
  reserva_minima: number
  regime_imposto: 'competencia' | 'caixa'
  /** Vendas automáticas: kit passa pelo caixa? (padrão: faturado direto ao cliente) */
  kit_passa_caixa_padrao: boolean
}

export type Passivo = {
  id: string
  banco: string
  modalidade: string
  numero_contrato: string | null
  valor_contratado: number
  data_contratacao: string
  taxa_juros_mes: number | null
  parcelas_total: number
  valor_parcela: number | null
  primeiro_vencimento: string | null
  observacoes: string | null
  // Dívidas (migration 130): face × negociado; desconto = face − negociado
  valor_face?: number | null
  valor_negociado?: number | null
  renegociacoes?: Array<{ data: string; saldo_anterior: number; valor_negociado: number; parcelas: number; primeiro_vencimento: string; motivo: string | null }>
}

export type Fornecedor = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; categoria: string | null; contato_telefone: string | null; ativo: boolean }
export type Categoria = { id: string; nome: string; tipo: 'receita' | 'despesa' }

/** Venda do sistema aguardando programação de recebimento. */
export type VendaPendente = {
  origem: 'projeto' | 'venda_manual'
  origem_id: string
  projeto_id: string | null
  cliente: string
  data_venda: string
  /** Kalebe 2026-10-06: 1º pagamento informado no fechamento (senão = data da venda) */
  data_pagamento?: string | null
  valor_venda: number
  condicao_vendedor: string | null
  parcelas_vendedor: number | null
  observacoes_vendedor: string | null
  // Custos do orçamento (projeto) — viram PREVISTOS; efetivados com o valor pago
  custos: { kit: number; comissao: number; imposto: number; instalacao: number; frete: number; projeto_art: number; custo_estimado: number }
  vendedor_nome: string | null
  /** Venda direta: a Spin fatura tudo → equipamentos sempre passam pelo caixa */
  kit_sempre_caixa?: boolean
}

// ─── Catálogos do cadastro dinâmico ─────────────────────────────────────────

export const GRUPOS: Record<Grupo, { rotulo: string; emoji: string; direcao: Direcao | 'ambas' }> = {
  receita_vendas:        { rotulo: 'Receita de vendas',       emoji: '💰', direcao: 'entrada' },
  outras_receitas:       { rotulo: 'Outras receitas',         emoji: '➕', direcao: 'entrada' },
  fornecedores:          { rotulo: 'Fornecedores',            emoji: '🏭', direcao: 'saida' },
  impostos:              { rotulo: 'Impostos',                emoji: '🧾', direcao: 'saida' },
  passivo_bancario:      { rotulo: 'Passivo bancário',        emoji: '🏦', direcao: 'ambas' },
  capital_giro:          { rotulo: 'Capital de giro',         emoji: '💼', direcao: 'ambas' },
  comissoes:             { rotulo: 'Comissões',               emoji: '🤝', direcao: 'saida' },
  custos_projeto:        { rotulo: 'Custos de projeto',       emoji: '🔧', direcao: 'saida' },
  pessoal:               { rotulo: 'Pessoal',                 emoji: '👥', direcao: 'saida' },
  despesas_operacionais: { rotulo: 'Despesas operacionais',   emoji: '🏢', direcao: 'saida' },
  outras_despesas:       { rotulo: 'Outras despesas',         emoji: '📦', direcao: 'saida' },
}

/** Ordem das linhas na visão mensal (semântica — não alfabética). */
export const ORDEM_ENTRADAS: Grupo[] = ['receita_vendas', 'outras_receitas', 'capital_giro', 'passivo_bancario']
export const ORDEM_SAIDAS: Grupo[] = [
  'fornecedores', 'custos_projeto', 'comissoes', 'impostos', 'pessoal',
  'despesas_operacionais', 'passivo_bancario', 'capital_giro', 'outras_despesas',
]

export const TIPOS_IMPOSTO = [
  'COFINS', 'CSLL', 'DAS — Simples Nacional', 'FGTS', 'ICMS', 'INSS', 'IPTU / IPVA / taxas', 'IRPJ', 'ISS', 'Outro', 'PIS',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export const SUBTIPOS_CAPITAL_GIRO: Array<{ chave: string; rotulo: string; direcao: Direcao }> = ([
  { chave: 'aplicacao_reserva',   rotulo: 'Aplicação / reserva (sai do caixa)',    direcao: 'saida' },
  { chave: 'aporte_socio',        rotulo: 'Aporte de sócio',                        direcao: 'entrada' },
  { chave: 'devolucao_socio',     rotulo: 'Devolução de aporte ao sócio',           direcao: 'saida' },
  { chave: 'distribuicao_lucros', rotulo: 'Distribuição de lucros',                 direcao: 'saida' },
  { chave: 'emprestimo_socio',    rotulo: 'Empréstimo de sócio para a empresa',     direcao: 'entrada' },
  { chave: 'resgate_aplicacao',   rotulo: 'Resgate de aplicação (volta ao caixa)',  direcao: 'entrada' },
] as Array<{ chave: string; rotulo: string; direcao: Direcao }>).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

export const SUBTIPOS_PESSOAL = [
  'Benefícios (VT, VR, plano)', 'Férias / 13º', 'Outros', 'Pró-labore', 'Rescisão', 'Salário',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export const MODALIDADES_PASSIVO: Array<{ chave: string; rotulo: string; divida?: boolean }> = [
  { chave: 'acordo_renegociacao',    rotulo: 'Acordo / renegociação de dívida', divida: true },
  { chave: 'divida_fornecedor',      rotulo: 'Dívida com fornecedor', divida: true },
  { chave: 'parcelamento_tributos',  rotulo: 'Parcelamento de tributos', divida: true },
  { chave: 'antecipacao_recebiveis', rotulo: 'Antecipação de recebíveis' },
  { chave: 'capital_giro_bancario',  rotulo: 'Capital de giro bancário' },
  { chave: 'cartao_credito',         rotulo: 'Cartão de crédito empresarial' },
  { chave: 'cheque_especial',        rotulo: 'Cheque especial / conta garantida' },
  { chave: 'consorcio',              rotulo: 'Consórcio' },
  { chave: 'emprestimo',             rotulo: 'Empréstimo' },
  { chave: 'financiamento',          rotulo: 'Financiamento (veículo, máquina, imóvel)' },
  { chave: 'outro',                  rotulo: 'Outro' },
].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

export const FORMAS_PAGAMENTO = [
  'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Débito automático', 'Dinheiro', 'Financiamento bancário', 'PIX', 'Transferência',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

// ─── Datas (YYYY-MM-DD, fuso de Brasília) ────────────────────────────────────

export function hojeBR(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

/** Soma meses mantendo o dia (limitado ao último dia do mês). */
export function addMeses(data: string, n: number, dia?: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  const dd = Math.min(dia ?? d, ultimo)
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

export function addDias(data: string, n: number): string {
  const [a, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** DAS do Simples vence no dia 20 do mês seguinte ao da receita. */
export function vencimentoDas(dataReceita: string): string {
  return addMeses(dataReceita.slice(0, 8) + '01', 1, 20)
}

export const mesDe = (data: string) => data.slice(0, 7)          // 'YYYY-MM'
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const nome = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${nome}/${String(a).slice(2)}`
}
export const dataBR = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

// ─── Valores ────────────────────────────────────────────────────────────────

/** Lê "1.234,56", "1234,56" ou "1234.56". */
export function lerValor(s: string | number | null | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0
  const t = String(s ?? '').trim().replace(/[R$\s]/g, '')
  if (!t) return 0
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) ? n : 0
}

export const brl = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const arred = (n: number) => Math.round(n * 100) / 100

/** Divide um total em N parcelas; a diferença de centavos vai na última. */
export function dividirEmParcelas(total: number, n: number): number[] {
  const qtd = Math.max(1, Math.floor(n))
  const base = Math.floor((total / qtd) * 100) / 100
  const parcelas = Array(qtd).fill(base)
  parcelas[qtd - 1] = arred(total - base * (qtd - 1))
  return parcelas
}

// ─── Status e consolidação ──────────────────────────────────────────────────

export type StatusLanc = 'realizado' | 'atrasado' | 'aberto'
export function statusDe(l: Pick<Lancamento, 'data_realizada' | 'data_prevista'>, hoje = hojeBR()): StatusLanc {
  if (l.data_realizada) return 'realizado'
  return l.data_prevista < hoje ? 'atrasado' : 'aberto'
}

const sinal = (l: Lancamento) => (l.direcao === 'entrada' ? 1 : -1)

/** Saldo real (só realizados) até a data, inclusive. */
export function saldoRealizadoAte(lancs: Lancamento[], cfg: ConfigFluxo, data: string): number {
  let s = Number(cfg.saldo_inicial) || 0
  for (const l of lancs) {
    if (l.data_realizada && l.data_realizada >= cfg.data_inicio && l.data_realizada <= data) {
      s += sinal(l) * (Number(l.valor_realizado) || 0)
    }
  }
  return arred(s)
}

/** Saldo projetado: realizado até hoje + tudo em aberto (inclusive atrasado) previsto até a data. */
export function saldoProjetadoAte(lancs: Lancamento[], cfg: ConfigFluxo, data: string, hoje = hojeBR()): number {
  let s = saldoRealizadoAte(lancs, cfg, hoje)
  for (const l of lancs) {
    if (!l.data_realizada && l.data_prevista <= data) s += sinal(l) * (Number(l.valor_previsto) || 0)
  }
  return arred(s)
}

export type CelulaMes = { previsto: number; realizado: number }
export type LinhaMensal = { chave: string; rotulo: string; emoji: string; direcao: Direcao; meses: Record<string, CelulaMes> }

/**
 * Matriz mensal: PREVISTO pela data prevista, REALIZADO pela data em que
 * efetivamente entrou/saiu. Linhas por grupo, separadas por direção.
 */
export function consolidarMensal(lancs: Lancamento[], meses: string[]): { entradas: LinhaMensal[]; saidas: LinhaMensal[] } {
  const vazio = () => Object.fromEntries(meses.map((m) => [m, { previsto: 0, realizado: 0 }])) as Record<string, CelulaMes>
  const mapa = new Map<string, LinhaMensal>()
  const linha = (direcao: Direcao, grupo: Grupo) => {
    const k = `${direcao}:${grupo}`
    if (!mapa.has(k)) mapa.set(k, { chave: k, rotulo: GRUPOS[grupo].rotulo, emoji: GRUPOS[grupo].emoji, direcao, meses: vazio() })
    return mapa.get(k)!
  }
  for (const d of ORDEM_ENTRADAS) linha('entrada', d)
  for (const d of ORDEM_SAIDAS) linha('saida', d)
  for (const l of lancs) {
    const ln = linha(l.direcao, l.grupo)
    const mp = mesDe(l.data_prevista)
    if (ln.meses[mp]) ln.meses[mp].previsto += Number(l.valor_previsto) || 0
    if (l.data_realizada) {
      const mr = mesDe(l.data_realizada)
      if (ln.meses[mr]) ln.meses[mr].realizado += Number(l.valor_realizado) || 0
    }
  }
  const todas = Array.from(mapa.values())
  return {
    entradas: ORDEM_ENTRADAS.map((g) => mapa.get(`entrada:${g}`)!).filter(Boolean),
    saidas: ORDEM_SAIDAS.map((g) => mapa.get(`saida:${g}`)!).filter(Boolean).concat(
      todas.filter((l) => l.direcao === 'saida' && !ORDEM_SAIDAS.some((g) => `saida:${g}` === l.chave)),
    ),
  }
}

export function mesesJanela(inicio: string, qtd: number): string[] {
  return Array.from({ length: qtd }, (_, i) => mesDe(addMeses(inicio + '-01', i)))
}
export const fimDoMes = (mes: string) => addDias(addMeses(mes + '-01', 1), -1)
