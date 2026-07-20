'use client'

import { useState, useTransition } from 'react'
import { togglePadraoNovoAction } from '@/app/homologacoes/[id]/actions'

type Props = {
  homologacaoId: string
  precisaAtual: boolean
  amperagemAtual?: number | null
  observacaoAtual?: string | null
  grupoTarifaAtual?: 'A' | 'B' | null
  tensaoAtual?: number | null
}

const AMPERAGENS_B = [32, 40, 50, 63, 80, 100, 125, 150, 200]
const AMPERAGENS_A = [100, 150, 200, 250, 300, 400, 500, 630]
const TENSOES_A = [13800, 23100, 34500]  // MT típicas CELESC

export function PadraoNovoToggle({
  homologacaoId, precisaAtual, amperagemAtual, observacaoAtual,
  grupoTarifaAtual, tensaoAtual,
}: Props) {
  const [precisa, setPrecisa] = useState(precisaAtual)
  const [grupo, setGrupo] = useState<'A' | 'B'>(grupoTarifaAtual || 'B')
  const [amperagem, setAmperagem] = useState<number>(amperagemAtual || 63)
  const [tensao, setTensao] = useState<number>(tensaoAtual || 13800)
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
        grupoTarifa: novo ? grupo : undefined,
        tensaoV: novo && grupo === 'A' ? tensao : undefined,
      })
      if ('erro' in res && res.erro) setMsg('⚠️ ' + res.erro)
      else setMsg(novo ? `✓ Etapa 7 adicionada (Grupo ${grupo})` : '✓ Etapa removida')
    })
  }

  function salvar() {
    setMsg(null)
    startTransition(async () => {
      const res = await togglePadraoNovoAction({
        homologacaoId,
        precisa: true,
        amperagem,
        observacao: obs,
        grupoTarifa: grupo,
        tensaoV: grupo === 'A' ? tensao : undefined,
      })
      if ('erro' in res && res.erro) setMsg('⚠️ ' + res.erro)
      else setMsg('✓ Detalhes salvos')
    })
  }

  const amperagens = grupo === 'A' ? AMPERAGENS_A : AMPERAGENS_B

  return (
    <section className={`p-4 rounded-xl border ${precisa ? 'bg-weg-azul/5 border-weg-azul/30' : 'bg-white/[0.02] border-white/10'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider font-bold text-weg-azul">
            ⚡ Padrão de entrada NOVO?
          </p>
          <p className="text-[10px] text-white/60 mt-1">
            Marque se o projeto precisa gerar um <strong>novo padrão CELESC</strong>
            {' '}(upgrade ou instalação nova). Sistema gera SVG específico por Grupo tarifário.
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
        <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
          {/* Seletor Grupo A vs B */}
          <div>
            <label className="text-[10px] uppercase font-bold text-white/50 block mb-2">Grupo tarifário</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGrupo('B')}
                className={`p-3 rounded border text-left ${
                  grupo === 'B' ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10'
                }`}
              >
                <p className="text-sm font-bold text-white">🏠 Grupo B</p>
                <p className="text-[10px] text-white/50">Baixa tensão (residencial/comercial baixo)</p>
                <p className="text-[9px] text-white/40 mt-1">Medidor comum · 220/380V · até ~75 kW</p>
              </button>
              <button
                type="button"
                onClick={() => setGrupo('A')}
                className={`p-3 rounded border text-left ${
                  grupo === 'A' ? 'bg-weg-azul/10 border-weg-azul/40' : 'bg-white/[0.02] border-white/10'
                }`}
              >
                <p className="text-sm font-bold text-white">🏭 Grupo A</p>
                <p className="text-[10px] text-white/50">Média tensão (industrial/comercial alto)</p>
                <p className="text-[9px] text-white/40 mt-1">TC/TP + trafo · 13.8/23.1/34.5 kV · ≥75 kW</p>
              </button>
            </div>
          </div>

          {/* Detalhes técnicos */}
          <div className={`grid grid-cols-1 ${grupo === 'A' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-2`}>
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">
                Amperagem BT (A)
              </label>
              <select
                value={amperagem}
                onChange={(e) => setAmperagem(parseInt(e.target.value))}
                disabled={isPending}
                className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs"
              >
                {amperagens.map((a) => (
                  <option key={a} value={a}>{a}A</option>
                ))}
              </select>
            </div>
            {grupo === 'A' && (
              <div>
                <label className="text-[10px] uppercase text-white/50 block mb-1">Tensão MT</label>
                <select
                  value={tensao}
                  onChange={(e) => setTensao(parseInt(e.target.value))}
                  disabled={isPending}
                  className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs"
                >
                  {TENSOES_A.map((v) => (
                    <option key={v} value={v}>{(v / 1000).toFixed(1)} kV</option>
                  ))}
                </select>
              </div>
            )}
            <div className={grupo === 'A' ? '' : 'md:col-span-1'}>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Observação (opcional)</label>
              <input
                type="text"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={grupo === 'A' ? 'Ex: nova SE 300kVA' : 'Ex: upgrade 40→63A por GD'}
                disabled={isPending}
                className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/40"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={salvar}
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
