'use client'

import { useState, useTransition } from 'react'
import { togglePadraoNovoAction } from '@/app/homologacoes/[id]/actions'

type Props = {
  homologacaoId: string
  precisaAtual: boolean
  amperagemAtual?: number | null
  observacaoAtual?: string | null
}

export function PadraoNovoToggle({
  homologacaoId, precisaAtual, amperagemAtual, observacaoAtual,
}: Props) {
  const [precisa, setPrecisa] = useState(precisaAtual)
  const [amperagem, setAmperagem] = useState<number>(amperagemAtual || 63)
  const [obs, setObs] = useState(observacaoAtual || '')
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function alternar(novo: boolean) {
    setPrecisa(novo)
    setMsg(null)
    startTransition(async () => {
      const res = await togglePadraoNovoAction({
        homologacaoId,
        precisa: novo,
        amperagem: novo ? amperagem : undefined,
        observacao: novo ? obs : undefined,
      })
      if ('erro' in res && res.erro) setMsg('⚠️ ' + res.erro)
      else setMsg(novo ? '✓ Etapa 7 adicionada' : '✓ Etapa removida')
    })
  }

  function salvarDetalhes() {
    setMsg(null)
    startTransition(async () => {
      const res = await togglePadraoNovoAction({
        homologacaoId,
        precisa: true,
        amperagem,
        observacao: obs,
      })
      if ('erro' in res && res.erro) setMsg('⚠️ ' + res.erro)
      else setMsg('✓ Detalhes salvos')
    })
  }

  return (
    <section className={`p-4 rounded-xl border ${precisa ? 'bg-weg-azul/5 border-weg-azul/30' : 'bg-white/[0.02] border-white/10'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider font-bold text-weg-azul">
            ⚡ Padrão de entrada NOVO?
          </p>
          <p className="text-[10px] text-white/60 mt-1">
            Marque se o projeto precisa gerar um <strong>novo padrão CELESC</strong>
            {' '}(upgrade ou instalação nova). Sistema adiciona etapa 7 e gera o SVG do diagrama.
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={precisa}
            onChange={(e) => alternar(e.target.checked)}
            disabled={isPending}
            className="w-4 h-4 accent-weg-azul"
          />
          <span className={`text-xs font-bold ${precisa ? 'text-weg-azul' : 'text-white/50'}`}>
            {precisa ? 'Sim, precisa' : 'Não precisa'}
          </span>
        </label>
      </div>

      {precisa && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Amperagem (A)</label>
              <select
                value={amperagem}
                onChange={(e) => setAmperagem(parseInt(e.target.value))}
                disabled={isPending}
                className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs"
              >
                {[32, 40, 50, 63, 80, 100, 125, 150, 200, 250].map((a) => (
                  <option key={a} value={a}>{a}A</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase text-white/50 block mb-1">Observação (opcional)</label>
              <input
                type="text"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Ex: upgrade de 40A→63A por causa da GD"
                disabled={isPending}
                className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={salvarDetalhes}
            disabled={isPending}
            className="px-3 py-1.5 bg-weg-azul/20 border border-weg-azul/40 text-weg-azul text-xs font-bold rounded hover:bg-weg-azul/30 disabled:opacity-40"
          >
            {isPending ? '⏳ Salvando...' : '💾 Salvar detalhes do padrão'}
          </button>
        </div>
      )}

      {msg && <p className="text-[10px] text-white/60 mt-2">{msg}</p>}
    </section>
  )
}
