'use client'

import { useState, useTransition } from 'react'
import { atualizarEtapaHomologacaoAction } from '@/app/homologacoes/[id]/actions'

const OPCOES_STATUS = [
  { valor: 'pendente',     label: '⏳ Pendente' },
  { valor: 'em_andamento', label: '🚧 Em andamento' },
  { valor: 'concluido',    label: '✓ Concluído' },
  { valor: 'erro',         label: '⚠️ Erro' },
  { valor: 'bloqueado',    label: '🚫 Bloqueado' },
]

export function EtapaHomologacaoClient({
  etapa, statusInfo,
}: {
  etapa: any
  statusInfo: Record<string, { label: string; cor: string; classe: string; emoji: string }>
}) {
  const [isPending, startTransition] = useTransition()
  const [obsAberto, setObsAberto] = useState(false)
  const [obs, setObs] = useState(etapa.observacoes || '')
  const info = statusInfo[etapa.status] || statusInfo.pendente

  function trocar(novo: string) {
    startTransition(async () => {
      await atualizarEtapaHomologacaoAction({ etapaId: etapa.id, status: novo })
    })
  }

  function salvarObs() {
    startTransition(async () => {
      await atualizarEtapaHomologacaoAction({ etapaId: etapa.id, observacoes: obs })
      setObsAberto(false)
    })
  }

  return (
    <div className={`p-3 rounded-lg border ${info.classe}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-lg font-mono text-white/40">{etapa.ordem}</span>
        <span className="text-xl">{info.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{etapa.nome_exibicao}</p>
          <p className={`text-[10px] uppercase ${info.cor}`}>{info.label}</p>
        </div>

        <select
          value={etapa.status}
          onChange={(e) => trocar(e.target.value)}
          disabled={isPending}
          className="text-xs bg-noite border border-white/20 rounded px-2 py-1 text-white"
        >
          {OPCOES_STATUS.map((o) => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setObsAberto((s) => !s)}
          className="text-[10px] px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60 hover:text-white"
        >
          {obsAberto ? '✕' : '💬'}
        </button>
      </div>

      {etapa.iniciado_em && (
        <p className="text-[10px] text-white/40 mt-1">
          Iniciado {new Date(etapa.iniciado_em).toLocaleString('pt-BR')}
          {etapa.concluido_em && ` · concluído ${new Date(etapa.concluido_em).toLocaleString('pt-BR')}`}
        </p>
      )}

      {/* Arquivos gerados: PDF/MD/CSV/SVG */}
      {(etapa.url_arquivo_pdf || etapa.url_arquivo_svg || etapa.url_arquivo_dwg) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {etapa.url_arquivo_pdf && (
            <a
              href={etapa.url_arquivo_pdf}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 bg-verde/20 border border-verde/40 rounded text-[10px] text-verde font-bold hover:bg-verde/30"
              title="Baixar arquivo gerado"
            >
              📥 Baixar arquivo
            </a>
          )}
          {etapa.url_arquivo_svg && !etapa.url_arquivo_pdf && (
            <a
              href={etapa.url_arquivo_svg}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 bg-weg-azul/20 border border-weg-azul/40 rounded text-[10px] text-weg-azul font-bold hover:bg-weg-azul/30"
            >
              🖼️ Baixar SVG
            </a>
          )}
          {etapa.url_arquivo_dwg && (
            <a
              href={etapa.url_arquivo_dwg}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 bg-white/10 border border-white/20 rounded text-[10px] text-white/80 font-bold hover:bg-white/20"
            >
              ✏️ Baixar DWG
            </a>
          )}
        </div>
      )}

      {etapa.observacoes && !obsAberto && (
        <p className="text-[11px] text-white/70 italic mt-2">💬 {etapa.observacoes}</p>
      )}

      {obsAberto && (
        <div className="mt-2 space-y-1">
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            placeholder="Observações desta etapa (ex: aguardando ART, protocolo #123 rejeitado por bitola)..."
            className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-xs text-white placeholder:text-white/40"
          />
          <button
            type="button"
            onClick={salvarObs}
            disabled={isPending}
            className="px-3 py-1 bg-sol text-noite text-xs font-bold rounded disabled:opacity-40"
          >
            {isPending ? '⏳' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  )
}
