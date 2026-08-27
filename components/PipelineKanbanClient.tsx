'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  FASES_ORDEM, FASE_DE_STATUS, INFO_STATUS, INFO_FASE,
  type StatusProjeto, type FasePipeline,
} from '@/lib/projeto-pipeline'
import { PipelineCardActions } from '@/components/PipelineCardActions'

type Projeto = {
  id: string
  codigo: string
  status: string
  cliente_razao_social: string | null
  tipo_projeto?: string | null
  updated_at?: string
  status_atualizado_em?: string
}

/**
 * Kanban do pipeline com busca em memória.
 * Kalebe pediu 2026-08-27 campo de pesquisa no CRM.
 * Filtra projetos por: código, cliente, tipo, status/fase.
 */
export function PipelineKanbanClient({
  projetos, isAdmin, ctaNovoHref, ctaNovoLabel,
}: {
  projetos: Projeto[]
  isAdmin: boolean
  /** Se passado, mostra botão em destaque ao lado da busca */
  ctaNovoHref?: string
  ctaNovoLabel?: string
}) {
  const [busca, setBusca] = useState('')

  const projetosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return projetos
    return projetos.filter((p) => {
      const statusInfo = INFO_STATUS[p.status as StatusProjeto]
      const fase = FASE_DE_STATUS[p.status as StatusProjeto] || 'projeto'
      const faseInfo = INFO_FASE[fase]
      const alvo = [
        p.codigo, p.cliente_razao_social, p.tipo_projeto, p.status,
        statusInfo?.label, faseInfo?.label,
      ].filter(Boolean).join(' ').toLowerCase()
      return alvo.includes(q)
    })
  }, [projetos, busca])

  // Agrupa por fase
  const porFase: Record<FasePipeline, Projeto[]> = {
    projeto: [], negocio: [], venda: [], execucao: [], pos_venda: [], perdido: [],
  }
  for (const p of projetosFiltrados) {
    const fase = FASE_DE_STATUS[p.status as StatusProjeto] || 'projeto'
    porFase[fase].push(p)
  }
  const fasesVisiveis = FASES_ORDEM.filter((f) => f !== 'perdido' || porFase[f].length > 0)

  return (
    <>
      <div className="mb-4 flex flex-col sm:flex-row gap-2 items-stretch">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">🔍</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, cliente, tipo, status, fase…"
            className="w-full h-12 pl-10 pr-10 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-sol/40 focus:outline-none"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs px-2 py-1"
              aria-label="Limpar busca">
              ✕
            </button>
          )}
        </div>
        {ctaNovoHref && (
          <Link
            href={ctaNovoHref}
            className="h-12 inline-flex items-center justify-center gap-1 px-6 bg-sol text-noite font-black text-sm rounded-lg hover:bg-sol/90 shadow-lg shadow-sol/20 whitespace-nowrap"
          >
            {ctaNovoLabel || '+ Novo'}
          </Link>
        )}
      </div>
      {busca && (
        <p className="text-[10px] text-white/50 mb-3">
          <strong className="text-white">{projetosFiltrados.length}</strong> de {projetos.length} projeto{projetos.length === 1 ? '' : 's'} bate{projetos.length === 1 ? '' : 'm'} com &ldquo;{busca}&rdquo;
        </p>
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-min">
          {fasesVisiveis.map((fase) => {
            const info = INFO_FASE[fase]
            const items = porFase[fase]
            return (
              <div key={fase} className={`flex-shrink-0 w-72 rounded-xl border ${info.bgClass} ${info.borderClass}`}>
                <div className="p-3 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">{info.label}</h2>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 text-white">{items.length}</span>
                  </div>
                  <p className="text-[10px] text-white/50 mt-0.5">{info.descricao}</p>
                </div>

                <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                  {items.length === 0 && (
                    <p className="text-[10px] text-white/30 text-center py-6 italic">
                      {busca ? 'nada bate com a busca aqui' : 'Nada nessa fase.'}
                    </p>
                  )}
                  {items.map((p) => {
                    const statusInfo = INFO_STATUS[p.status as StatusProjeto] || INFO_STATUS.rascunho
                    const dias = p.status_atualizado_em
                      ? Math.floor((Date.now() - new Date(p.status_atualizado_em).getTime()) / 86400000)
                      : null
                    return (
                      <div key={p.id} className="block p-3 bg-noite/60 border border-white/10 rounded-lg hover:border-sol/40 hover:bg-noite/80 transition">
                        <Link href={`/projetos/${p.id}`} className="block">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs font-bold text-white truncate flex-1">
                              {p.cliente_razao_social}
                            </p>
                            <span className="text-sm">{statusInfo.emoji}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px]">
                            <span className="text-white/40">{p.codigo}</span>
                            {p.tipo_projeto && (
                              <>
                                <span className="text-white/20">·</span>
                                <span className="text-white/40 truncate">{p.tipo_projeto}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className={`text-[9px] uppercase font-bold ${statusInfo.cor}`}>{statusInfo.label}</span>
                            {dias !== null && dias > 0 && (
                              <span className={`text-[9px] ${dias > 7 ? 'text-coral' : dias > 3 ? 'text-sol' : 'text-white/40'}`}>
                                {dias}d
                              </span>
                            )}
                          </div>
                        </Link>
                        <PipelineCardActions
                          projetoId={p.id}
                          codigo={p.codigo}
                          clienteNome={p.cliente_razao_social || 'sem nome'}
                          podeExcluir={isAdmin}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
