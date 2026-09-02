'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { aplicarCampanhaAoProjetoAction, removerCampanhaDoProjetoAction } from '@/app/admin/campanhas/actions'

type CampanhaResumo = {
  id: string
  titulo: string
  subtitulo?: string | null
  condicao_especial: string
  pv_promocional?: number | null
  qtd_placas?: number | null
  qtd_inversores?: number | null
  vigente_ate?: string | null
}

type Props = {
  projetoId: string
  campanhaAplicada: CampanhaResumo | null
  campanhasAtivas: CampanhaResumo[]
}

/**
 * Kalebe 2026-09-02: card de campanha do mês no /projetos/[id].
 * Dois estados:
 *  - Sem campanha aplicada: mostra 1 card por campanha ativa com botão
 *    "Gerar proposta com esta campanha". Ao clicar, chama action que
 *    monta kit_selecionado + pv_promocional_forcado e redireciona pra
 *    /orcamento — a proposta pula os passos 6/7 (kit/lista) e sai pronta.
 *  - Com campanha aplicada: mostra o resumo dela + botão pra remover.
 */
export function CardCampanhaProjeto({ projetoId, campanhaAplicada, campanhasAtivas }: Props) {
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  function aplicar(id: string, titulo: string) {
    if (!confirm(`Aplicar campanha "${titulo}" ao projeto?\n\nIsso substitui o kit atual (se houver) e vai direto pro orçamento. O PDF sai com o banner de condição especial.`)) return
    setMsg(null)
    startTransition(async () => {
      const r = await aplicarCampanhaAoProjetoAction(projetoId, id)
      if ('sucesso' in r) {
        window.location.href = `/projetos/${projetoId}/orcamento`
      } else {
        setMsg('❌ ' + r.erro)
      }
    })
  }

  function remover() {
    if (!confirm('Remover a campanha aplicada? O projeto volta ao fluxo normal.')) return
    startTransition(async () => {
      await removerCampanhaDoProjetoAction(projetoId)
      window.location.reload()
    })
  }

  if (campanhaAplicada) {
    return (
      <div className="mb-6 p-6 bg-gradient-to-r from-sol/20 to-sol/5 border-2 border-sol/40 rounded-xl">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="text-3xl">🎁</div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest bg-sol text-noite px-2 py-0.5 rounded-full font-black">
                Condição especial
              </span>
              <h2 className="text-lg font-bold text-white">
                Campanha aplicada: {campanhaAplicada.titulo}
              </h2>
            </div>
            {campanhaAplicada.subtitulo && (
              <p className="text-sm text-sol/90 mb-2">{campanhaAplicada.subtitulo}</p>
            )}
            <p className="text-sm text-white/80 leading-relaxed mb-3">
              {campanhaAplicada.condicao_especial}
            </p>
            <div className="flex gap-3 items-center flex-wrap">
              <Link href={`/projetos/${projetoId}/orcamento`}
                className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg">
                Ver proposta →
              </Link>
              <button type="button" onClick={remover} disabled={isPending}
                className="text-xs text-white/60 hover:text-coral underline">
                Remover campanha
              </button>
              {msg && <span className="text-xs text-white/70">{msg}</span>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 p-6 bg-sol/5 border border-sol/20 rounded-xl">
      <div className="flex items-start gap-4 mb-4">
        <div className="text-2xl">🎁</div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white mb-1">
            Campanhas do mês disponíveis
          </h2>
          <p className="text-xs text-white/60">
            Oferta pronta pra fechamento rápido — sem precisar dimensionar kit. Aplica o preço promocional e gera a proposta com selo "condição especial".
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {campanhasAtivas.map((c) => (
          <div key={c.id} className="p-4 bg-white/[0.03] border border-white/10 rounded-lg hover:border-sol/40 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-bold text-white">{c.titulo}</h3>
                {c.subtitulo && <p className="text-[11px] text-white/60 mt-0.5">{c.subtitulo}</p>}
              </div>
              {c.pv_promocional && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-sol font-bold">Por</p>
                  <p className="text-sol font-black font-mono">R$ {fmt(Number(c.pv_promocional))}</p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-white/50 mb-3 line-clamp-2">{c.condicao_especial}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-white/40">
                {c.qtd_placas ? `${c.qtd_placas} placas` : ''}
                {c.qtd_placas && c.qtd_inversores ? ' · ' : ''}
                {c.qtd_inversores ? `${c.qtd_inversores} inversor(es)` : ''}
                {c.vigente_ate && (
                  <span className="ml-2 text-coral">até {c.vigente_ate}</span>
                )}
              </span>
              <button type="button"
                onClick={() => aplicar(c.id, c.titulo)}
                disabled={isPending}
                className="text-[11px] font-bold px-3 py-1.5 bg-sol text-noite rounded disabled:opacity-40">
                {isPending ? '⏳' : '✨ Aplicar'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs text-white/70 mt-3">{msg}</p>}
    </div>
  )
}
