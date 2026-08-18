'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { CriativoRow } from './CriativosAdminClient'

const TIPO_EMOJI: Record<string, string> = { imagem: '🖼', video: '🎬', pdf: '📄', texto: '💬' }

/**
 * Modal compacto que abre pelo card do CRM (fases prospeccao/contato).
 * Vendedor escolhe um criativo → dispara wa.me direto pro cliente com
 * mensagem template + link do arquivo.
 */
export function EscolherCriativoModal({
  clienteNome, clienteTelefone, onFechar,
}: {
  clienteNome: string | null
  clienteTelefone: string | null
  onFechar: () => void
}) {
  const [criativos, setCriativos] = useState<CriativoRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [bucketUrl, setBucketUrl] = useState('')

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    setBucketUrl(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/criativos-vendas`)
    supabase
      .from('criativos_vendas')
      .select('id, tipo, titulo, descricao, categoria, arquivo_url, texto, mensagem_whatsapp_template, ativo, criado_em')
      .eq('ativo', true)
      .order('criado_em', { ascending: false })
      .then(({ data }) => {
        setCriativos((data || []) as CriativoRow[])
        setCarregando(false)
      })
  }, [])

  function montarLinkWa(criativo: CriativoRow): string {
    const primeiroNome = clienteNome?.trim().split(' ')[0] || 'cliente'
    const url = criativo.arquivo_url ? `${bucketUrl}/${criativo.arquivo_url}` : ''
    const template = criativo.mensagem_whatsapp_template ||
      (criativo.tipo === 'texto'
        ? '{link}'
        : 'Oi {cliente_nome}! Dá uma olhada nesse material da SPIN: {link}')
    const conteudo = criativo.tipo === 'texto' ? (criativo.texto || '') : url
    const mensagem = template
      .replace(/\{cliente_nome\}/g, primeiroNome)
      .replace(/\{link\}/g, conteudo)
    const telLimpo = clienteTelefone?.replace(/\D/g, '')
    return telLimpo
      ? `https://wa.me/55${telLimpo}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={onFechar}>
      <div className="bg-noite border border-sol/25 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-white font-bold">📚 Escolher criativo</p>
            <p className="text-white/40 text-xs mt-0.5">
              {clienteNome ? `→ ${clienteNome}` : 'sem cliente'}
              {clienteTelefone ? ` · ${clienteTelefone}` : ' · sem telefone (você escolhe o destinatário no WhatsApp)'}
            </p>
          </div>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-xl">×</button>
        </div>

        <div className="p-4">
          {carregando ? (
            <p className="text-xs text-white/40 text-center py-8">carregando...</p>
          ) : criativos.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-8 italic">
              Nenhum criativo ativo. Peça pro admin cadastrar em <code className="text-sol">/admin/criativos</code>.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {criativos.map((c) => {
                const url = c.arquivo_url ? `${bucketUrl}/${c.arquivo_url}` : null
                return (
                  <div key={c.id} className="bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden">
                    {c.tipo === 'imagem' && url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="w-full h-28 object-cover bg-black/40" />
                    )}
                    {c.tipo === 'video' && url && <video src={url} className="w-full h-28 object-cover bg-black/40" />}
                    {c.tipo === 'pdf' && <div className="h-28 bg-white/5 flex items-center justify-center text-4xl">📄</div>}
                    {c.tipo === 'texto' && (
                      <div className="h-28 p-2 bg-white/[0.03] overflow-y-auto text-[11px] text-white/70 whitespace-pre-wrap">
                        {c.texto}
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-bold text-white truncate">{TIPO_EMOJI[c.tipo]} {c.titulo}</p>
                      {c.categoria && <p className="text-[10px] text-sol truncate">🏷 {c.categoria}</p>}
                      <a
                        href={montarLinkWa(c)}
                        target="_blank" rel="noopener"
                        onClick={onFechar}
                        className="block mt-2 text-center px-2 py-1.5 bg-verde/20 border border-verde/40 text-verde font-bold text-[11px] rounded hover:bg-verde/30"
                      >
                        📱 Enviar WhatsApp
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
