'use client'

import { useEffect, useState } from 'react'
import { inputCls } from './CampoNumero'

/**
 * Rodapé das propostas montadas no Spinzap (Kalebe 2026-10-14): gera o PDF
 * (fica nos arquivos e no projeto), abre e envia no WhatsApp — mesmo fluxo
 * do fotovoltaico. Qualquer mudança na composição (chave) invalida o PDF.
 */
export function RodapeProposta({ chave, podeGerar, motivo, gerar, enviar, legendaPadrao, onEnviada }: {
  chave: string
  podeGerar: boolean
  motivo?: string | null
  gerar: () => Promise<{ url_pdf: string; projeto_id: string } | { erro: string }>
  enviar?: (projeto_id: string, url_pdf: string, legenda: string) => Promise<{ sucesso: true } | { erro: string }>
  legendaPadrao: string
  onEnviada?: () => void
}) {
  const [pdf, setPdf] = useState<{ url_pdf: string; projeto_id: string } | null>(null)
  const [legenda, setLegenda] = useState(legendaPadrao)
  const [ocupado, setOcupado] = useState<null | 'gerando' | 'enviando'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)
  useEffect(() => { setPdf(null) }, [chave])

  async function gerarPdf() {
    if (pdf) return pdf
    setErro(null); setOcupado('gerando')
    try {
      const r = await gerar()
      if ('erro' in r) { setErro(r.erro); return null }
      setPdf(r)
      return r
    } finally { setOcupado(null) }
  }
  async function verPdf() {
    const aba = window.open('', '_blank')
    const r = await gerarPdf()
    if (r && aba) aba.location.href = r.url_pdf
    else aba?.close()
  }
  async function enviarPdf() {
    if (!enviar) return
    const r = pdf || (await gerarPdf())
    if (!r) return
    setOcupado('enviando'); setErro(null)
    try {
      const e = await enviar(r.projeto_id, r.url_pdf, legenda)
      if ('erro' in e) setErro(e.erro)
      else { setEnviada(true); onEnviada?.() }
    } finally { setOcupado(null) }
  }

  if (enviada) {
    return (
      <div className="rounded-2xl border border-verde/45 p-4 space-y-1">
        <p className="text-sm font-bold text-white">✅ Proposta enviada no WhatsApp</p>
        <p className="text-xs text-white/60">O PDF ficou nos arquivos do contato e no projeto.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {!podeGerar && motivo && <p className="text-[11px] text-white/70 rounded-xl border border-coral/45 px-3 py-2">⚠ {motivo}</p>}
      {enviar && (
        <label className="block">
          <span className="block text-[11px] font-bold text-white/60 mb-1">Mensagem junto do PDF</span>
          <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </label>
      )}
      <div className={`grid gap-2 ${enviar ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button type="button" onClick={verPdf} disabled={!!ocupado || !podeGerar}
          className="py-3 rounded-xl bg-weg-azul text-white font-bold text-sm disabled:opacity-40">
          {ocupado === 'gerando' ? 'Gerando PDF…' : pdf ? '📄 Abrir PDF' : '📄 Gerar PDF'}
        </button>
        {enviar && (
          <button type="button" onClick={enviarPdf} disabled={!!ocupado || !podeGerar}
            className="py-3 rounded-xl bg-verde text-white font-bold text-sm disabled:opacity-40">
            {ocupado === 'enviando' ? 'Enviando…' : '📲 Enviar no WhatsApp'}
          </button>
        )}
      </div>
      {pdf && <p className="text-[11px] text-white/50 text-center">PDF salvo nos arquivos do contato e no projeto.</p>}
      {erro && <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>}
    </div>
  )
}
