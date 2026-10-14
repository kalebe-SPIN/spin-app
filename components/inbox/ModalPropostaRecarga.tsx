'use client'

import { useMemo, useState } from 'react'
import { PainelPrecificacao } from '@/components/precificacao/PainelPrecificacao'
import {
  dadosPropostaRecargaAction, calcularPropostaRecargaAction, cadastrarEquipamentoRecargaAction, gerarPdfPropostaRecargaAction,
} from '@/app/inbox/proposta-recarga-actions'
import { enviarPdfPropostaRapidaAction } from '@/app/inbox/proposta-actions'
import { ComposicaoRecarga, type ApiRecarga } from '@/components/propostas/ComposicaoRecarga'

/**
 * Proposta de estação de recarga dentro do Spinzap (Kalebe 2026-10-14):
 * compõe, calcula, gera o PDF (fica nos arquivos e no projeto de recarga do
 * contato) e envia no WhatsApp sem sair da conversa.
 */
export function ModalPropostaRecarga({ conversaId, nomeCliente, ehAdmin, onFechar, onEnviada }: {
  conversaId: string
  nomeCliente: string
  ehAdmin?: boolean
  onFechar: () => void
  onEnviada: () => void
}) {
  const [painel, setPainel] = useState(false)
  const [versao, setVersao] = useState(0)
  const api = useMemo<ApiRecarga>(() => ({
    carregar: () => dadosPropostaRecargaAction(conversaId),
    calcular: (e) => calcularPropostaRecargaAction(conversaId, e),
    cadastrar: (i) => cadastrarEquipamentoRecargaAction(conversaId, i),
    gerarPdf: (e) => gerarPdfPropostaRecargaAction(conversaId, e),
    enviar: (projetoId, url, legenda) => enviarPdfPropostaRapidaAction(conversaId, projetoId, url, legenda, 'Proposta-Estacao-de-Recarga.pdf'),
  }), [conversaId])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-noite/85 backdrop-blur-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">⚡ Proposta · estação de recarga</h2>
            <p className="text-[11px] text-white/50">{nomeCliente} · equipamentos → projeto → execução</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ehAdmin && (
              <button type="button" onClick={() => setPainel(true)} className="px-3 py-1.5 rounded-full bg-sol text-white text-[11px] font-bold">⚙️ Precificação</button>
            )}
            <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/70 hover:text-white flex items-center justify-center">✕</button>
          </div>
        </div>
        <ComposicaoRecarga key={versao} api={api} nomeCliente={nomeCliente} onEnviada={onEnviada} />
      </div>
      {painel && <PainelPrecificacao contexto="recarga" onFechar={() => setPainel(false)} onAlterado={() => setVersao((v) => v + 1)} />}
    </div>
  )
}
