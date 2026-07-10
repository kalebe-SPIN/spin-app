'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { atualizarEtapaAction } from '@/app/admin/homologacoes/actions'

type Etapa = {
  id: string
  ordem: number
  chave: string
  nome_exibicao: string
  status: string
  url_arquivo_pdf: string | null
  url_arquivo_dwg: string | null
  url_arquivo_svg: string | null
  observacoes: string | null
  iniciado_em: string | null
  concluido_em: string | null
}

const CONFIG_ETAPAS: Record<string, { emoji: string; descricao: string; link_gerar?: (projetoId: string) => string }> = {
  diagrama_unifilar: {
    emoji: '⚡',
    descricao: 'Unifilar padrão CELESC com selo Spin + dados do RT',
    link_gerar: (id) => `/projetos/${id}/diagrama`,
  },
  layout_instalacao: {
    emoji: '🏠',
    descricao: 'Planta baixa com disposição das placas no telhado',
  },
  memorial_descritivo: {
    emoji: '📝',
    descricao: 'Documento descritivo do sistema pra CELESC',
  },
  lista_kit: {
    emoji: '📦',
    descricao: 'Composição de compra do kit WEG (placas, inversor)',
  },
  lista_ca: {
    emoji: '🔌',
    descricao: 'Materiais CA: cabos, disjuntor, DPS, quadro, aterramento',
  },
  aprovacao_celesc: {
    emoji: '✅',
    descricao: 'Protocolo emitido, aguarda parecer técnico da CELESC',
  },
}

const STATUS_CONFIG: Record<string, { emoji: string; classe: string; label: string }> = {
  pendente:     { emoji: '⏳', classe: 'bg-white/5 border-white/10 text-white/60', label: 'Pendente' },
  em_andamento: { emoji: '🚧', classe: 'bg-sol/10 border-sol/40 text-sol', label: 'Em andamento' },
  concluido:    { emoji: '✓',  classe: 'bg-verde/10 border-verde/40 text-verde', label: 'Concluído' },
  erro:         { emoji: '❌', classe: 'bg-coral/10 border-coral/40 text-coral', label: 'Erro' },
  bloqueado:    { emoji: '🔒', classe: 'bg-white/5 border-white/10 text-white/40', label: 'Bloqueado' },
}

export function HomologacaoPipeline({ etapas, projetoId }: { etapas: Etapa[]; projetoId: string }) {
  return (
    <div className="space-y-3">
      {etapas.map((etapa, idx) => (
        <EtapaCard
          key={etapa.id}
          etapa={etapa}
          projetoId={projetoId}
          eUltima={idx === etapas.length - 1}
        />
      ))}
    </div>
  )
}

function EtapaCard({ etapa, projetoId, eUltima }: { etapa: Etapa; projetoId: string; eUltima: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expandido, setExpandido] = useState(false)
  const [obs, setObs] = useState(etapa.observacoes || '')

  const configEtapa = CONFIG_ETAPAS[etapa.chave] || { emoji: '📄', descricao: '' }
  const configStatus = STATUS_CONFIG[etapa.status] || STATUS_CONFIG.pendente

  function alterarStatus(novoStatus: string) {
    startTransition(async () => {
      await atualizarEtapaAction(etapa.id, { status: novoStatus })
      router.refresh()
    })
  }

  function salvarObs() {
    startTransition(async () => {
      await atualizarEtapaAction(etapa.id, { observacoes: obs })
      router.refresh()
    })
  }

  return (
    <div className={`rounded-lg border ${configStatus.classe} transition`}>
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Ordem + emoji */}
          <div className="flex flex-col items-center gap-1 w-10 flex-shrink-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-black border-2 ${
              etapa.status === 'concluido' ? 'bg-verde/20 border-verde/40 text-verde' :
              etapa.status === 'em_andamento' ? 'bg-sol/20 border-sol/40 text-sol' :
              'bg-white/5 border-white/10 text-white/40'
            }`}>
              {etapa.status === 'concluido' ? '✓' : etapa.ordem}
            </div>
            {!eUltima && <div className="w-0.5 h-8 bg-white/10 mt-1" />}
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{configEtapa.emoji}</span>
              <h3 className="text-sm font-bold text-white">{etapa.nome_exibicao}</h3>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${configStatus.classe}`}>
                {configStatus.emoji} {configStatus.label}
              </span>
            </div>
            <p className="text-xs text-white/60 mb-3">{configEtapa.descricao}</p>

            {/* Datas de execução */}
            {(etapa.iniciado_em || etapa.concluido_em) && (
              <div className="text-[10px] text-white/40 mb-3 flex gap-4">
                {etapa.iniciado_em && <span>Iniciado: {formatarData(etapa.iniciado_em)}</span>}
                {etapa.concluido_em && <span>Concluído: {formatarData(etapa.concluido_em)}</span>}
              </div>
            )}

            {/* Arquivos gerados */}
            {(etapa.url_arquivo_pdf || etapa.url_arquivo_dwg || etapa.url_arquivo_svg) && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {etapa.url_arquivo_pdf && <ArquivoBadge href={etapa.url_arquivo_pdf} label="📄 PDF" />}
                {etapa.url_arquivo_dwg && <ArquivoBadge href={etapa.url_arquivo_dwg} label="✏️ DWG" />}
                {etapa.url_arquivo_svg && <ArquivoBadge href={etapa.url_arquivo_svg} label="🖼️ SVG" />}
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-wrap gap-2">
              {configEtapa.link_gerar && (
                <Link
                  href={configEtapa.link_gerar(projetoId)}
                  className="text-[10px] px-3 py-1.5 bg-sol/10 border border-sol/30 rounded text-sol hover:bg-sol/20"
                >
                  🖨️ Gerar/editar
                </Link>
              )}

              {etapa.status === 'pendente' && (
                <button
                  disabled={isPending}
                  onClick={() => alterarStatus('em_andamento')}
                  className="text-[10px] px-3 py-1.5 bg-white/5 border border-white/10 rounded text-white/80 hover:bg-white/10 disabled:opacity-40"
                >
                  Iniciar
                </button>
              )}

              {etapa.status === 'em_andamento' && (
                <>
                  <button
                    disabled={isPending}
                    onClick={() => alterarStatus('concluido')}
                    className="text-[10px] px-3 py-1.5 bg-verde/10 border border-verde/30 rounded text-verde hover:bg-verde/20 disabled:opacity-40"
                  >
                    ✓ Marcar concluído
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => alterarStatus('erro')}
                    className="text-[10px] px-3 py-1.5 bg-coral/10 border border-coral/30 rounded text-coral hover:bg-coral/20 disabled:opacity-40"
                  >
                    ❌ Marcar com erro
                  </button>
                </>
              )}

              {(etapa.status === 'concluido' || etapa.status === 'erro') && (
                <button
                  disabled={isPending}
                  onClick={() => alterarStatus('em_andamento')}
                  className="text-[10px] px-3 py-1.5 bg-white/5 border border-white/10 rounded text-white/60 hover:bg-white/10 disabled:opacity-40"
                >
                  Reabrir
                </button>
              )}

              <button
                onClick={() => setExpandido(!expandido)}
                className="text-[10px] px-3 py-1.5 text-white/40 hover:text-white/60"
              >
                {expandido ? '▲ Esconder obs.' : '▼ Ver/editar obs.'}
              </button>
            </div>

            {/* Observações expansíveis */}
            {expandido && (
              <div className="mt-3">
                <textarea
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  rows={3}
                  placeholder="Observações internas sobre essa etapa..."
                  className="w-full text-xs px-3 py-2 bg-noite/40 border border-white/10 rounded text-white/80 placeholder:text-white/30"
                />
                <button
                  onClick={salvarObs}
                  disabled={isPending}
                  className="mt-2 text-[10px] px-3 py-1.5 bg-sol/10 border border-sol/30 rounded text-sol hover:bg-sol/20 disabled:opacity-40"
                >
                  💾 Salvar observações
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ArquivoBadge({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[10px] px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/70 hover:bg-white/10"
    >
      {label}
    </a>
  )
}

function formatarData(d?: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
