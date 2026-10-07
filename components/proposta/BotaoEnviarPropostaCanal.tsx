'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { enviarPropostaPeloCanalAction, registrarPropostaEnviadaPeloAppAction } from '@/app/inbox/actions'

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
  const [telefone, setTelefone] = useState<string | null>(null)
  const [abriuApp, setAbriuApp] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Kalebe 2026-10-07: proposta enviada → volta pro projeto do cliente (o card
  // já foi pra "negociando" e o follow-up de 1 dia foi criado no servidor)
  function voltarAoProjeto(atraso = 1500) {
    setTimeout(() => {
      if (pathname === `/projetos/${projetoId}`) router.refresh()
      else router.push(`/projetos/${projetoId}`)
    }, atraso)
  }

  async function enviar() {
    if (!urlPdf) { setErro('Gere o PDF primeiro'); return }
    setEnviando(true); setErro(null); setJanelaFechada(false); setEnviado(false)
    try {
      const r = await enviarPropostaPeloCanalAction({ projeto_id: projetoId, url_pdf: urlPdf, nome_arquivo: nomeArquivo, legenda })
      if ('erro' in r) {
        setErro(r.erro)
        setJanelaFechada(!!r.janela_fechada)
        setConversaId(r.conversa_id || null)
        setTelefone(r.telefone || null)
        return
      }
      setEnviado(true)
      setConversaId(r.conversa_id)
      onEnviado?.()
      voltarAoProjeto()
    } finally {
      setEnviando(false)
    }
  }

  async function copiarLink() {
    if (!urlPdf) return
    try { await navigator.clipboard.writeText(urlPdf); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch {}
  }

  /**
   * Kalebe 2026-09-30: janela de 24h fechada → abre o WhatsApp Business (app
   * do número Spin, sem a trava da API) já na conversa do cliente, com o texto
   * e o link do PDF. O envio aparece no inbox pelo eco do app; quando o cliente
   * responder, o sistema volta a mandar sozinho.
   */
  async function enviarPeloApp() {
    if (!telefone || !urlPdf) return
    let tel = telefone.replace(/\D/g, '')
    if (tel.length === 10 || tel.length === 11) tel = '55' + tel
    const texto = `${legenda}\n\n📄 Proposta: ${urlPdf}`
    const celular = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    const url = celular
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `whatsapp://send?phone=${tel}&text=${encodeURIComponent(texto)}`   // app do computador direto, sem página
    // Mesmo efeito do envio pelo sistema: negociação + follow-up de 1 dia
    await registrarPropostaEnviadaPeloAppAction(projetoId).catch(() => {})
    window.location.href = url
    setAbriuApp(true)
    if (!celular) voltarAoProjeto(4000)
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
          ✓ Proposta enviada pelo canal Spin — card em negociação e follow-up pra amanhã criado. Voltando ao projeto…{' '}
          {conversaId && <Link href={`/inbox?c=${conversaId}`} className="underline">Ver no inbox</Link>}
        </p>
      )}
      {erro && !janelaFechada && (
        <div className="text-xs text-coral bg-coral/10 border border-coral/30 rounded-lg p-2 max-w-md">⚠ {erro}</div>
      )}
      {janelaFechada && (
        <div className="text-xs bg-sol/10 border border-sol/30 rounded-lg p-3 space-y-2 max-w-md">
          <p className="text-white/80">
            🔒 {erro} Envie pelo <strong className="text-white">WhatsApp Business do número Spin</strong> — lá não tem essa trava:
          </p>
          {telefone ? (
            <button type="button" onClick={enviarPeloApp}
              className="w-full px-3 py-2.5 bg-verde text-noite font-bold text-sm rounded-lg hover:bg-verde/90">
              📱 Enviar pelo WhatsApp Business (abre a conversa pronta)
            </button>
          ) : (
            <p className="text-coral">Projeto sem telefone do cliente — cadastre o telefone pra enviar.</p>
          )}
          {abriuApp && (
            <p className="text-verde">
              ✓ Aperte enviar no WhatsApp. A mensagem aparece no inbox e, quando o cliente responder, o envio pelo sistema volta a funcionar.
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-white/70">
            <button type="button" onClick={copiarLink} className="underline">
              {copiado ? '✓ Link copiado' : '📋 Copiar link do PDF'}
            </button>
            {conversaId && <Link href={`/inbox?c=${conversaId}`} className="underline">Abrir conversa no inbox</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
