'use client'

import { useState } from 'react'
import Link from 'next/link'
import { enviarPropostaPeloCanalAction } from '@/app/inbox/actions'

/**
 * Botão "Enviar por WhatsApp" das propostas (Kalebe 2026-09-29): envia o PDF
 * pelo canal Spin — fica registrado na conversa do inbox — em vez de abrir
 * o wa.me. Com a janela de 24h fechada, oferece copiar o link do PDF.
 */
export function BotaoEnviarPropostaCanal({
  projetoId,
  urlPdf,
  nomeArquivo,
  legenda,
  rotulo = '💬 Enviar ao cliente pelo WhatsApp',
  onEnviado,
}: {
  projetoId: string
  urlPdf: string | null
  nomeArquivo: string
  legenda: string
  rotulo?: string
  onEnviado?: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [janelaFechada, setJanelaFechada] = useState(false)
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [copiado, setCopiado] = useState(false)

  async function enviar() {
    if (!urlPdf) { setErro('Gere o PDF primeiro'); return }
    setEnviando(true); setErro(null); setJanelaFechada(false); setEnviado(false)
    try {
      const r = await enviarPropostaPeloCanalAction({ projeto_id: projetoId, url_pdf: urlPdf, nome_arquivo: nomeArquivo, legenda })
      if ('erro' in r) {
        setErro(r.erro)
        setJanelaFechada(!!r.janela_fechada)
        setConversaId(r.conversa_id || null)
        return
      }
      setEnviado(true)
      setConversaId(r.conversa_id)
      onEnviado?.()
    } finally {
      setEnviando(false)
    }
  }

  async function copiarLink() {
    if (!urlPdf) return
    try { await navigator.clipboard.writeText(urlPdf); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch {}
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={enviar}
        disabled={enviando || !urlPdf}
        className="px-4 py-3 bg-verde/20 border border-verde/40 text-verde font-bold text-sm rounded-lg hover:bg-verde/30 disabled:opacity-40"
      >
        {enviando ? '⏳ Enviando…' : rotulo}
      </button>
      {enviado && (
        <p className="text-xs text-verde">
          ✓ Proposta enviada pelo canal Spin.{' '}
          {conversaId && <Link href={`/inbox?c=${conversaId}`} className="underline">Ver no inbox</Link>}
        </p>
      )}
      {erro && (
        <div className="text-xs text-coral bg-coral/10 border border-coral/30 rounded-lg p-2 space-y-1.5 max-w-md">
          <p>⚠ {erro}</p>
          {janelaFechada && (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={copiarLink} className="underline text-white/80">
                {copiado ? '✓ Link copiado' : '📋 Copiar link do PDF'}
              </button>
              {conversaId && <Link href={`/inbox?c=${conversaId}`} className="underline text-white/80">Abrir conversa no inbox</Link>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
