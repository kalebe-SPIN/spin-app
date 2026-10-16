/**
 * Fechamento da venda pelo Spinzap (Kalebe 2026-10-16): "abrir a proposta que
 * enviei, editar se precisar e transformar em venda — forma de pagamento,
 * desconto negociado e dados do cliente — e mandar a proposta final
 * atualizada; depois vira negócio fechado no dashboard".
 *
 * Módulo puro (tela, servidor e PDFs). A venda grava no mesmo formato do
 * "Fechar venda" do projeto (orcamento_consolidado.venda_fechada), que é o
 * que o dashboard ("vendas do mês") e o fluxo de caixa já leem.
 */

/** Mesmas condições do "Fechar venda" do projeto — o fluxo de caixa lê esse texto (plano-venda.ts). */
export const CONDICOES_VENDA = [
  'À vista (PIX/transferência)',
  'Entrada + saldo (50/50)',
  '3× no cartão',
  '6× no cartão',
  '12× no cartão',
  'Financiamento bancário',
  'Outra (descrever nas observações)',
] as const

export type FechamentoVenda = {
  /** Valor da última proposta (antes do desconto) */
  valor_proposta: number
  /** Desconto negociado em R$ (0 = sem desconto) */
  desconto: number
  /** valor_proposta − desconto */
  valor_final: number
  condicao_pagamento: string
  parcelas: number | null
  /** Entrada + saldo: valor da entrada (vazio = 50%) */
  entrada_valor?: number | null
  /** YYYY-MM-DD */
  data_venda: string
  /** 1º pagamento do cliente (YYYY-MM-DD) */
  data_pagamento?: string | null
  observacoes?: string | null
}

export type ClienteVenda = {
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string
  endereco: { cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string }
}

const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Texto da forma de pagamento acordada (vai no PDF final). Não calcula juros de cartão. */
export function textoCondicao(f: FechamentoVenda): string {
  const c = f.condicao_pagamento
  if (/entrada/i.test(c)) {
    const entrada = f.entrada_valor && f.entrada_valor > 0 ? f.entrada_valor : f.valor_final / 2
    const saldo = Math.max(0, f.valor_final - entrada)
    return `Entrada de ${reais(entrada)} + saldo de ${reais(saldo)}${f.parcelas && f.parcelas > 2 ? ` em ${f.parcelas - 1} parcelas` : ''}`
  }
  if (/cart/i.test(c)) return c.replace(/\s*no cartão/i, ' no cartão de crédito')
  if (/^outra/i.test(c)) return f.observacoes?.trim() || 'Conforme combinado'
  return c
}

/** Linhas do bloco "Investimento" do PDF final. */
export function linhasInvestimentoFinal(f: FechamentoVenda): Array<{ rotulo: string; valor: string; destaque?: boolean }> {
  const linhas: Array<{ rotulo: string; valor: string; destaque?: boolean }> = []
  if (f.desconto > 0) {
    linhas.push({ rotulo: 'Valor da proposta', valor: reais(f.valor_proposta) })
    // Hífen comum: o "−" (menos tipográfico) não existe na fonte padrão do PDF
    linhas.push({ rotulo: 'Desconto negociado', valor: `- ${reais(f.desconto)}` })
  }
  linhas.push({ rotulo: 'Valor final', valor: reais(f.valor_final), destaque: true })
  linhas.push({ rotulo: 'Forma de pagamento', valor: textoCondicao(f) })
  return linhas
}

/** Arredonda pra centavos e confere as contas (a tela não decide o preço). */
export function normalizarFechamento(f: FechamentoVenda): FechamentoVenda {
  const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
  const valor_proposta = r2(f.valor_proposta)
  const desconto = Math.min(Math.max(r2(f.desconto), 0), valor_proposta)
  return {
    ...f,
    valor_proposta, desconto, valor_final: r2(valor_proposta - desconto),
    parcelas: f.parcelas && f.parcelas > 0 ? Math.round(f.parcelas) : null,
    entrada_valor: f.entrada_valor && f.entrada_valor > 0 ? r2(f.entrada_valor) : null,
    condicao_pagamento: String(f.condicao_pagamento || '').trim(),
    observacoes: f.observacoes?.trim() || null,
  }
}
