'use client'

/**
 * Botão destacado "Gerar todos os diagramas" pra homologação.
 * Diferente do ReprocessarArquivosBtn (que regenera arquivos já feitos),
 * esse é a AÇÃO PRINCIPAL do admin — dispara geração de:
 *   - Memorial descritivo (Markdown)
 *   - Lista Kit FV (CSV)
 *   - Lista CA (CSV)
 *   - Layout de instalação (SVG A4 com planta + elevação)
 *   - Padrão de entrada (se toggle marcado)
 *   - Diagrama unifilar (chamada IA — depende Anthropic)
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { reprocessarArquivosHomologacaoAction } from '@/app/homologacoes/[id]/actions'

export function GerarTodosDiagramasBtn({
  homologacaoId,
  projetoId,
  documentosOk,
}: {
  homologacaoId: string
  projetoId?: string
  documentosOk: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<any>(null)

  async function gerarTudo() {
    if (!documentosOk) {
      alert('Envie primeiro todos os documentos obrigatórios (fotos + CNH + procuração etc)')
      return
    }
    if (!window.confirm('Gerar/regerar arquivos automáticos das etapas? (memorial, listas, layout, padrão)')) return

    setResultado(null)
    startTransition(async () => {
      const res = await reprocessarArquivosHomologacaoAction(homologacaoId)
      if ('erro' in res && res.erro) {
        setResultado({ erro: res.erro })
      } else {
        setResultado({ parciais: (res as any).resultados })
      }
      // Recarrega pra ver etapas atualizadas
      setTimeout(() => window.location.reload(), 2000)
    })
  }

  const disabled = !documentosOk || isPending
  return (
    <div className="space-y-2">
      <div className="flex flex-col md:flex-row gap-2">
        <button
          type="button"
          onClick={gerarTudo}
          disabled={disabled}
          className={`flex-1 px-6 py-3 font-bold rounded-lg text-sm transition ${
            disabled
              ? 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
              : 'bg-gradient-to-r from-sol to-verde text-noite hover:opacity-90 shadow-lg'
          }`}
          title={documentosOk
            ? 'Gera memorial + lista kit + lista CA + layout + padrão em 1 clique'
            : 'Aguardando documentos obrigatórios'}
        >
          {isPending ? '⏳ Gerando arquivos...' : '🚀 Gerar TODOS os arquivos'}
        </button>
        {projetoId && documentosOk && (
          <Link
            href={`/projetos/${projetoId}/diagrama`}
            className="px-4 py-3 bg-weg-azul text-white font-bold rounded-lg text-sm text-center hover:bg-weg-azul/90"
            title="Gerar unifilar via Claude Sonnet 5"
          >
            🤖 Gerar unifilar (IA) →
          </Link>
        )}
      </div>
      {!documentosOk && (
        <p className="text-[10px] text-white/50">
          🔒 Complete os documentos obrigatórios acima antes de gerar
        </p>
      )}
      {resultado?.parciais && (
        <div className="text-[10px] space-y-0.5 mt-2 p-2 bg-noite/40 border border-white/10 rounded">
          <p className="text-white/70 font-bold">Resultado:</p>
          {resultado.parciais.map((r: any, i: number) => (
            <p key={i} className={r.sucesso ? 'text-verde' : 'text-coral'}>
              {r.sucesso ? '✓' : '✗'} {r.chave.replace(/_/g, ' ')}
              {!r.sucesso && r.motivo && <span className="text-white/40"> — {r.motivo}</span>}
            </p>
          ))}
        </div>
      )}
      {resultado?.erro && (
        <p className="text-xs text-coral mt-1">⚠️ {resultado.erro}</p>
      )}
    </div>
  )
}
