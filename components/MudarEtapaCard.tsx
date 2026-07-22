'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { mudarEtapaProjetoAction } from '@/app/projetos/[id]/etapa/actions'
import { INFO_STATUS, getProximasEtapas, INFO_FASE, FASE_DE_STATUS, type StatusProjeto } from '@/lib/projeto-pipeline'

export function MudarEtapaCard({
  projetoId,
  statusAtual,
  soServicos = false,
}: {
  projetoId: string
  statusAtual: string
  soServicos?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [expandido, setExpandido] = useState(false)
  const [obs, setObs] = useState('')

  const info = INFO_STATUS[statusAtual as StatusProjeto] || INFO_STATUS.rascunho
  const fase = INFO_FASE[FASE_DE_STATUS[statusAtual as StatusProjeto] || 'projeto']
  const proximas = getProximasEtapas(statusAtual as StatusProjeto, soServicos)

  function mudar(novo: StatusProjeto) {
    setErro(null)
    startTransition(async () => {
      const res = await mudarEtapaProjetoAction(projetoId, novo, obs || undefined)
      if ('erro' in res) setErro(res.erro || 'Erro desconhecido')
      else {
        setObs('')
        setExpandido(false)
        router.refresh()
      }
    })
  }

  return (
    <section className={`p-4 rounded-xl border ${fase.bgClass} ${fase.borderClass}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-0.5">
            Etapa atual
          </p>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{info.emoji}</span>
            <div>
              <p className={`text-lg font-black ${info.cor}`}>{info.label}</p>
              <p className="text-[10px] text-white/50">{fase.label} · {fase.descricao}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpandido(!expandido)}
          className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded text-white/70 hover:bg-white/10"
        >
          {expandido ? '▲ Fechar' : '▼ Mudar etapa'}
        </button>
      </div>

      {expandido && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
          <p className="text-xs text-white/60">Avançar para:</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {proximas.map((prox) => {
              const infoProx = INFO_STATUS[prox]
              const faseProx = INFO_FASE[FASE_DE_STATUS[prox] || 'projeto']
              return (
                <button
                  key={prox}
                  onClick={() => mudar(prox)}
                  disabled={isPending}
                  className={`p-3 rounded-lg border text-left transition disabled:opacity-40 hover:bg-white/5 ${faseProx.borderClass}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{infoProx.emoji}</span>
                    <span className={`text-sm font-bold ${infoProx.cor}`}>{infoProx.label}</span>
                  </div>
                  <p className="text-[10px] text-white/40 uppercase">{faseProx.label}</p>
                </button>
              )
            })}
          </div>

          {/* Selector avançado — todas as opções */}
          <details className="mt-3">
            <summary className="text-[10px] text-white/40 cursor-pointer hover:text-white/60">
              ⚙️ Mudar para outra etapa (avançado)
            </summary>
            <div className="mt-2 flex gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value && confirm(`Mudar para ${INFO_STATUS[e.target.value as StatusProjeto]?.label}?`)) {
                    mudar(e.target.value as StatusProjeto)
                  }
                }}
                defaultValue=""
                className="flex-1 px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white"
              >
                <option value="">— Escolher etapa —</option>
                {Object.entries(INFO_STATUS)
                  .filter(([k]) => k !== statusAtual)
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.emoji} {v.label} ({INFO_FASE[FASE_DE_STATUS[k as StatusProjeto]].label})
                    </option>
                  ))}
              </select>
            </div>
          </details>

          <div>
            <label className="text-[10px] text-white/50 block mb-1">Observações (opcional, salva no histórico)</label>
            <input
              type="text"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: cliente pediu 5% de desconto"
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
            />
          </div>

          {erro && (
            <p className="text-xs text-coral">⚠️ {erro}</p>
          )}
        </div>
      )}
    </section>
  )
}
