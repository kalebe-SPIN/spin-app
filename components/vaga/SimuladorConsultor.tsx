'use client'

import { useState } from 'react'
import { LINHAS, CARTEIRA_PCT, calcularVenda, type LinhaKey } from '@/lib/proposta-consultor'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

export function SimuladorConsultor() {
  const [linha, setLinha] = useState<LinhaKey>('residencial')
  const [valor, setValor] = useState(28000)
  const [mensalidade, setMensalidade] = useState(79)

  const L = LINHAS[linha]
  const r = calcularVenda(linha, valor, mensalidade)
  const temPlano = L.bonusMult > 0

  const linhas: LinhaKey[] = ['residencial', 'comercial', 'industrial', 'carregador']

  return (
    <div className="rounded-2xl border border-sol/30 bg-gradient-to-br from-sol/[0.07] to-transparent overflow-hidden">
      <div className="px-5 md:px-6 py-4 border-b border-white/10">
        <p className="text-sol font-black text-lg">🧮 Simulador de ganho por venda</p>
        <p className="text-white/55 text-sm">Veja o que muda quando o plano de O&amp;M vai junto.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 p-5 md:p-6">
        {/* ENTRADAS */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Linha</label>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {linhas.map((k) => (
                <button key={k} onClick={() => setLinha(k)} className={`py-2 rounded-lg text-xs font-bold border transition-colors ${linha === k ? 'bg-sol text-noite-0 border-sol' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
                  {LINHAS[k].label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-1.5">Comissão da linha: {pct(L.pctSem)} → <span className="text-sol">{pct(L.pctCom)}</span> com plano · ticket {L.ticket}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Valor do sistema</label>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-white/40 text-sm">R$</span>
              <input type="number" min={0} step={1000} value={valor} onChange={(e) => setValor(Math.max(0, Number(e.target.value)))} className="input-spin flex-1" />
            </div>
          </div>

          {temPlano ? (
            <div>
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Mensalidade do plano de O&amp;M</label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-white/40 text-sm">R$</span>
                <input type="number" min={0} step={1} value={mensalidade} onChange={(e) => setMensalidade(Math.max(0, Number(e.target.value)))} className="input-spin flex-1" />
              </div>
              <p className="text-[11px] text-white/40 mt-1">Ref.: residencial R$45–105 · comercial R$485 (150 mód) · usina R$2.442 (1.000 mód).</p>
            </div>
          ) : (
            <p className="text-[11px] text-white/40">Carregador não tem plano de O&amp;M anexado.</p>
          )}
        </div>

        {/* RESULTADO — sem vs com plano */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-noite-0/60 border border-white/10 p-4 flex flex-col">
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-3">Sem plano</p>
            <Linha rot="Comissão" val={brl(r.comissaoSem)} />
            <Linha rot="Bônus" val="—" mut />
            <div className="mt-auto pt-3 border-t border-white/10">
              <p className="text-[11px] text-white/40">Recebe na venda</p>
              <p className="text-xl font-black text-white">{brl(r.recebeVendaSem)}</p>
              <p className="text-[11px] text-white/40 mt-1">Todo mês: —</p>
            </div>
          </div>

          <div className="rounded-xl bg-sol/[0.08] border border-sol/30 p-4 flex flex-col">
            <p className="text-[11px] font-bold text-sol uppercase tracking-wider mb-3">Com plano</p>
            <Linha rot="Comissão" val={brl(r.comissaoCom)} />
            <Linha rot="Bônus" val={temPlano ? brl(r.bonus) : '—'} />
            <div className="mt-auto pt-3 border-t border-white/10">
              <p className="text-[11px] text-white/40">Recebe na venda</p>
              <p className="text-xl md:text-2xl font-black text-sol">{brl(r.recebeVendaCom)}</p>
              <p className="text-[11px] text-verde mt-1">+ {brl(r.carteiraMes)}/mês na carteira ({pct(CARTEIRA_PCT)})</p>
            </div>
          </div>
        </div>
      </div>

      {temPlano && (
        <div className="px-5 md:px-6 pb-5">
          <div className="p-3 bg-verde/[0.06] border border-verde/25 rounded-xl text-sm text-white/75">
            Anexando o plano, você recebe <strong className="text-verde">{brl(r.recebeVendaCom - r.recebeVendaSem)} a mais na venda</strong> e passa a receber{' '}
            <strong className="text-verde">{brl(r.carteiraMes)}/mês</strong> enquanto o cliente existir — <strong className="text-white">{brl(r.carteiraMes * 60)}</strong> em 5 anos, sem vender nada de novo.
          </div>
        </div>
      )}
    </div>
  )
}

function Linha({ rot, val, mut }: { rot: string; val: string; mut?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm mb-1.5">
      <span className="text-white/60">{rot}</span>
      <span className={mut ? 'text-white/30' : 'text-white font-semibold'}>{val}</span>
    </div>
  )
}
