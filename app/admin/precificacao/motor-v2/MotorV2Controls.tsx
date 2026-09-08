'use client'

import { useState, useTransition } from 'react'
import {
  toggleMotorV2Action,
  toggleComissaoModoAction,
  atualizarRbt12Action,
  atualizarAnexoAction,
} from './actions'

type Props = {
  v2Ativo: boolean
  comissaoFixa7: boolean
  rbt12: number
  anexoAtual: 'III' | 'V'
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function MotorV2Controls({ v2Ativo, comissaoFixa7, rbt12, anexoAtual }: Props) {
  const [pending, startTransition] = useTransition()
  const [rbt12Str, setRbt12Str] = useState(fmtBRL(rbt12))

  function runToggleV2() {
    startTransition(async () => { await toggleMotorV2Action(!v2Ativo) })
  }

  function runToggleComissao() {
    startTransition(async () => { await toggleComissaoModoAction(!comissaoFixa7) })
  }

  function saveRbt12() {
    const num = Number(rbt12Str.replace(/\./g, '').replace(',', '.'))
    if (!isFinite(num) || num < 0) return
    startTransition(async () => { await atualizarRbt12Action(num) })
  }

  function saveAnexo(ax: 'III' | 'V') {
    startTransition(async () => { await atualizarAnexoAction(ax) })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Toggle motor v2 */}
      <div className={`rounded-xl p-5 border transition ${v2Ativo ? 'bg-verde/10 border-verde/40' : 'bg-white/[0.03] border-white/10'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">Motor de cálculo</p>
            <p className="text-xl font-bold text-white mt-1">
              {v2Ativo ? 'v2 ativo' : 'v1 legado'}
            </p>
            <p className="text-xs text-white/60 mt-2 leading-relaxed">
              {v2Ativo
                ? 'Precificação usando margem alvo sobre nota SPIN + comissão efetiva + alíquota calculada por projeto.'
                : 'Precificação usando margem 20% + comissão 5% + imposto 15% fixos sobre a nota Spin.'}
            </p>
          </div>
          <button
            onClick={runToggleV2}
            disabled={pending}
            className={`px-4 py-2 rounded-lg text-sm font-bold shrink-0 transition ${
              v2Ativo
                ? 'bg-verde text-verde-fundo hover:bg-verde/80'
                : 'bg-sol text-sol-fundo hover:bg-sol/80'
            } disabled:opacity-50`}
          >
            {v2Ativo ? 'Voltar pra v1' : 'Ativar v2'}
          </button>
        </div>
      </div>

      {/* Toggle comissão */}
      <div className={`rounded-xl p-5 border transition ${v2Ativo ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.02] border-white/5 opacity-50'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">Modo comissão</p>
            <p className="text-xl font-bold text-white mt-1">
              {comissaoFixa7 ? 'Referência fixa 7%' : 'Variável real'}
            </p>
            <p className="text-xs text-white/60 mt-2 leading-relaxed">
              {comissaoFixa7
                ? 'Todos os cálculos usam 7% de comissão referência (rápido, uniforme).'
                : 'Comissão = taxa da linha × acelerador do consultor × multiplicador da origem do lead.'}
            </p>
          </div>
          <button
            onClick={runToggleComissao}
            disabled={pending || !v2Ativo}
            className="px-4 py-2 rounded-lg text-sm font-bold shrink-0 bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 transition"
          >
            Alternar
          </button>
        </div>
      </div>

      {/* RBT12 */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">RBT12 corrente</p>
        <p className="text-xs text-white/60 mt-1 mb-3 leading-relaxed">
          Receita bruta acumulada últimos 12 meses (só nota SPIN — não inclui pass-through do kit WEG).
          Usado pra escolher a faixa da alíquota do Simples.
        </p>
        <div className="flex gap-2">
          <span className="inline-flex items-center px-3 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={rbt12Str}
            onChange={(e) => setRbt12Str(e.target.value)}
            onBlur={saveRbt12}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-sol/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Anexo */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">Anexo Simples atual</p>
        <p className="text-xs text-white/60 mt-1 mb-3 leading-relaxed">
          Anexo III (serviços com fator R alcançado, alíquotas menores) ou Anexo V (sem fator R, mais alto).
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['III', 'V'] as const).map((ax) => (
            <button
              key={ax}
              onClick={() => saveAnexo(ax)}
              disabled={pending}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${
                anexoAtual === ax
                  ? 'bg-sol/20 border-sol/50 text-sol'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              } disabled:opacity-50`}
            >
              Anexo {ax}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
