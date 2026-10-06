'use client'

import { useEffect, useState } from 'react'

/**
 * Kalebe 2026-09-17: modal reutilizável de confirmação de venda.
 * Vendedor confirma preço final acordado + condição de pagamento antes
 * de fechar. Não é edição livre — sugere o valor calculado e força o
 * vendedor a olhar antes de confirmar.
 *
 * Usado em: OrcamentoServicosClient, AcoesRapidasCard (solar) — e em
 * qualquer outro fluxo que fechar venda a partir de agora.
 */

type Props = {
  aberto: boolean
  onCancelar: () => void
  onConfirmar: (dados: DadosConfirmacao) => Promise<void> | void
  precoSugerido: number
  condicoesDisponiveis?: string[]
  /** Rótulo do preço no header — "Preço final da proposta", etc. */
  rotuloPreco?: string
  processando?: boolean
  /** Kalebe 2026-10-06: editar uma venda já fechada (troca de projeto) */
  modoEdicao?: boolean
  inicial?: Partial<DadosConfirmacao> | null
}

export type DadosConfirmacao = {
  preco_final: number
  condicao_pagamento: string
  parcelas: number | null
  observacoes: string | null
  /** Kalebe 2026-10-06: data da venda e do 1º pagamento (YYYY-MM-DD) */
  data_venda: string
  data_pagamento: string | null
}

const hojeBRT = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

const CONDICOES_PADRAO = [
  'À vista (PIX/transferência)',
  'Entrada + saldo (50/50)',
  '3× no cartão',
  '6× no cartão',
  '12× no cartão',
  'Financiamento bancário',
  'Outra (descrever nas observações)',
]

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ConfirmarVendaModal({
  aberto,
  onCancelar,
  onConfirmar,
  precoSugerido,
  condicoesDisponiveis,
  rotuloPreco = 'Preço final acordado com o cliente',
  processando = false,
  modoEdicao = false,
  inicial = null,
}: Props) {
  const [preco, setPreco] = useState<string>(String(precoSugerido.toFixed(2)))
  const [condicao, setCondicao] = useState<string>(CONDICOES_PADRAO[0])
  const [parcelas, setParcelas] = useState<string>('1')
  const [observacoes, setObservacoes] = useState<string>('')
  const [dataVenda, setDataVenda] = useState<string>(hojeBRT())
  const [dataPagamento, setDataPagamento] = useState<string>('')
  const [erro, setErro] = useState<string | null>(null)

  // Ao abrir: valores da venda atual (edição) ou sugeridos (fechamento)
  useEffect(() => {
    if (!aberto) return
    setErro(null)
    setPreco(String((inicial?.preco_final ?? precoSugerido).toFixed(2)))
    setCondicao(inicial?.condicao_pagamento || CONDICOES_PADRAO[0])
    setParcelas(String(inicial?.parcelas || 1))
    setObservacoes(inicial?.observacoes || '')
    setDataVenda(inicial?.data_venda || hojeBRT())
    setDataPagamento(inicial?.data_pagamento || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  if (!aberto) return null

  const opcoesBase = condicoesDisponiveis && condicoesDisponiveis.length > 0
    ? [...condicoesDisponiveis, 'Outra (descrever nas observações)']
    : CONDICOES_PADRAO
  // Venda antiga com condição fora da lista continua selecionável
  const opcoes = condicao && !opcoesBase.includes(condicao) ? [condicao, ...opcoesBase] : opcoesBase

  const precoNum = parseFloat(preco.replace(',', '.')) || 0
  const parcelasNum = parseInt(parcelas, 10) || 1
  const diffPct = precoSugerido > 0 ? ((precoNum - precoSugerido) / precoSugerido) * 100 : 0
  const diffAviso = Math.abs(diffPct) > 5

  async function confirmar() {
    setErro(null)
    if (precoNum <= 0) {
      setErro('Preço final tem que ser maior que zero.')
      return
    }
    if (!condicao) {
      setErro('Escolha a condição de pagamento.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) {
      setErro('Informe a data da venda.')
      return
    }
    if (dataPagamento && dataPagamento < dataVenda) {
      setErro('A data do pagamento não pode ser antes da data da venda.')
      return
    }
    try {
      await onConfirmar({
        preco_final: precoNum,
        condicao_pagamento: condicao,
        parcelas: parcelasNum > 0 ? parcelasNum : null,
        observacoes: observacoes.trim() || null,
        data_venda: dataVenda,
        data_pagamento: dataPagamento || null,
      })
    } catch (e: any) {
      setErro(e?.message || 'Erro ao fechar venda')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCancelar}>
      <div
        className="bg-noite border border-verde/40 rounded-xl max-w-lg w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-black text-white">{modoEdicao ? '✏️ Atualizar dados da venda' : '🎯 Fechar venda'}</h2>
          <p className="text-xs text-white/60 mt-1">
            {modoEdicao
              ? 'Venda já fechada (troca de projeto, novo valor ou nova condição). O que estava antes fica registrado no histórico da venda e o fluxo de caixa é refeito quando dá.'
              : 'Confirme o preço final acordado e a condição de pagamento com o cliente. Isso vai virar o valor real da venda no sistema.'}
          </p>
        </div>

        {/* Kalebe 2026-10-06: data da venda e do 1º pagamento */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase font-bold text-white/70 tracking-wider">Data da venda</label>
            <input
              type="date"
              value={dataVenda}
              max={hojeBRT()}
              onChange={(e) => setDataVenda(e.target.value)}
              className="mt-1 w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-verde"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase font-bold text-white/70 tracking-wider">Data do pagamento</label>
            <input
              type="date"
              value={dataPagamento}
              min={dataVenda}
              onChange={(e) => setDataPagamento(e.target.value)}
              className="mt-1 w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-verde"
            />
            <p className="text-[10px] text-white/40 mt-1">À vista, entrada ou 1ª parcela. Vazio = na data da venda.</p>
          </div>
        </div>

        {/* Preço final */}
        <div>
          <label className="text-[11px] uppercase font-bold text-white/70 tracking-wider">
            {rotuloPreco}
          </label>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-white/40 text-sm">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value.replace(/[^\d.,]/g, ''))}
              className="flex-1 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-lg font-bold text-white font-mono focus:outline-none focus:border-verde"
            />
          </div>
          <p className="text-[10px] text-white/40 mt-1">
            Sugerido pela proposta: {fmtBRL(precoSugerido)}
            {diffAviso && (
              <span className={`ml-2 font-bold ${diffPct < 0 ? 'text-coral' : 'text-sol'}`}>
                ⚠️ diferença de {diffPct > 0 ? '+' : ''}
                {diffPct.toFixed(1)}%
              </span>
            )}
          </p>
        </div>

        {/* Condição */}
        <div>
          <label className="text-[11px] uppercase font-bold text-white/70 tracking-wider">
            Condição de pagamento acordada
          </label>
          <select
            value={condicao}
            onChange={(e) => setCondicao(e.target.value)}
            className="mt-1 w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-verde"
          >
            {opcoes.map((o) => (
              <option key={o} value={o} className="bg-noite">{o}</option>
            ))}
          </select>
        </div>

        {/* Parcelas */}
        <div>
          <label className="text-[11px] uppercase font-bold text-white/70 tracking-wider">
            Parcelas (deixe 1 se à vista)
          </label>
          <input
            type="number"
            min={1}
            max={24}
            value={parcelas}
            onChange={(e) => setParcelas(e.target.value)}
            className="mt-1 w-24 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-verde"
          />
        </div>

        {/* Observações */}
        <div>
          <label className="text-[11px] uppercase font-bold text-white/70 tracking-wider">
            Observações (opcional)
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            placeholder="Ex: entrada de 30% na assinatura, saldo no início da obra"
            className="mt-1 w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-verde resize-none"
          />
        </div>

        {erro && (
          <div className="text-xs text-coral bg-coral/10 border border-coral/30 rounded p-2">
            {erro}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={processando}
            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/15 text-white font-semibold text-sm rounded-lg hover:bg-white/10 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={processando || precoNum <= 0}
            className="flex-1 px-4 py-2.5 bg-verde text-white font-bold text-sm rounded-lg hover:bg-verde/90 disabled:opacity-40"
          >
            {processando ? 'Salvando…' : modoEdicao ? '✏️ Salvar alterações' : '🎯 Confirmar venda'}
          </button>
        </div>
      </div>
    </div>
  )
}
