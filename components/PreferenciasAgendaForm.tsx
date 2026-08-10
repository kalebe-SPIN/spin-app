'use client'

import { useState, useTransition } from 'react'
import { salvarPreferenciasAgendaAction } from '@/app/conta/actions'

export function PreferenciasAgendaForm({
  limiteInicial,
  zonaInicial,
  podeEditarZona,
}: {
  limiteInicial: number
  zonaInicial: string | null
  podeEditarZona: boolean
}) {
  const [limite, setLimite] = useState<number>(limiteInicial)
  const [zona, setZona] = useState<string>(zonaInicial || '')
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function salvar() {
    setMsg(null)
    startTransition(async () => {
      const r = await salvarPreferenciasAgendaAction({
        limite_horas_agenda: limite,
        zona: podeEditarZona ? (zona.trim() || null) : undefined,
      })
      setMsg(r?.erro ? `❌ ${r.erro}` : '✓ Salvo')
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">
          Dia é considerado "cheio" quando tem
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={2} max={12} step={0.5}
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
            className="flex-1 accent-sol"
          />
          <span className="w-20 text-center px-3 py-1.5 bg-sol/10 border border-sol/30 rounded text-sol font-bold text-sm tabular-nums">
            {limite.toFixed(1)}h
          </span>
        </div>
        <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
          Acima desse total de horas agendadas no dia, o widget "Dia" na /agenda mostra <span className="text-coral">vermelho — sem espaço</span>.
          Serve pra decidir na hora se dá pra oferecer horário pro cliente.
        </p>
      </div>

      {podeEditarZona && (
        <div>
          <label className="block text-xs uppercase tracking-wider text-white/50 font-bold mb-2">
            Sua zona de atuação
          </label>
          <input
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            placeholder="Ex: Grande Florianópolis"
            className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-sm text-white"
          />
          <p className="text-[11px] text-white/40 mt-1.5">
            Vendedor e profissional de campo com a <strong className="text-white/70">mesma zona</strong> viram par: um vê e agenda na agenda do outro.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={salvar}
          disabled={isPending}
          className="px-4 py-2 bg-sol/20 border border-sol/40 text-sol text-sm font-bold rounded-lg hover:bg-sol/30 disabled:opacity-40"
        >
          {isPending ? 'Salvando...' : 'Salvar preferências'}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith('✓') ? 'text-verde' : 'text-coral'}`}>{msg}</span>}
      </div>
    </div>
  )
}
