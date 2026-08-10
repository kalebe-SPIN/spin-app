'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EventoPopover, type EventoResumo } from './EventoPopover'
import { CriarEventoInline } from './CriarEventoInline'

/**
 * Calendário semanal simples — grade 7 dias × horas. Cada evento é um bloco
 * clicável que abre o EventoPopover pra confirmar/editar/excluir/mudar tipo.
 *
 * NÃO faz drag-and-drop (fora do escopo). Criação de novos eventos: clicar em
 * célula vazia abre um mini form inline (CriarEventoInline).
 */
export function CalendarioSemanal({
  eventos,
  usuarioLogadoId,
  donoAtualId,
  donoAtualNome,
}: {
  eventos: EventoResumo[]
  usuarioLogadoId: string
  donoAtualId: string
  donoAtualNome: string
}) {
  const router = useRouter()
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()))
  const [aberto, setAberto] = useState<EventoResumo | null>(null)
  const [criandoEm, setCriandoEm] = useState<{ dia: Date; hora: number } | null>(null)
  const [, startTransition] = useTransition()

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(semana); d.setDate(d.getDate() + i); return d
  }), [semana])

  const horaInicio = 7  // 07h
  const horaFim = 20    // 20h
  const horas = useMemo(() => Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i), [])

  function eventosDo(dia: Date, hora: number) {
    return eventos.filter((e) => {
      const dt = new Date(e.data_hora_inicio)
      return dt.getDate() === dia.getDate()
        && dt.getMonth() === dia.getMonth()
        && dt.getFullYear() === dia.getFullYear()
        && dt.getHours() === hora
    })
  }

  function proxima() { const d = new Date(semana); d.setDate(d.getDate() + 7); setSemana(d) }
  function anterior() { const d = new Date(semana); d.setDate(d.getDate() - 7); setSemana(d) }
  function hoje() { setSemana(inicioDaSemana(new Date())) }

  const fim = new Date(semana); fim.setDate(fim.getDate() + 6)
  const rotuloSemana = `${semana.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
      {/* Controles */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-1">
          <button onClick={anterior} className="px-2 py-1 text-xs text-white/60 hover:text-white bg-white/5 rounded">←</button>
          <button onClick={hoje} className="px-2 py-1 text-xs text-white/60 hover:text-white bg-white/5 rounded">hoje</button>
          <button onClick={proxima} className="px-2 py-1 text-xs text-white/60 hover:text-white bg-white/5 rounded">→</button>
        </div>
        <p className="text-sm font-bold text-white">{rotuloSemana}</p>
      </div>

      {/* Grade */}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-white/10 bg-white/[0.03]">
            <div />
            {dias.map((d) => {
              const eHoje = mesmoDia(d, new Date())
              return (
                <div key={d.toISOString()} className={`px-2 py-2 text-center ${eHoje ? 'bg-sol/10' : ''}`}>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">
                    {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </p>
                  <p className={`text-sm font-bold ${eHoje ? 'text-sol' : 'text-white'}`}>{d.getDate()}</p>
                </div>
              )
            })}
          </div>

          {/* Linhas de horário */}
          {horas.map((h) => (
            <div key={h} className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-white/5 min-h-[54px]">
              <div className="px-1 py-1 text-[10px] text-white/40 text-right font-mono border-r border-white/5">
                {String(h).padStart(2, '0')}h
              </div>
              {dias.map((d) => {
                const evs = eventosDo(d, h)
                return (
                  <div
                    key={d.toISOString() + h}
                    className="relative border-r border-white/5 last:border-r-0 p-0.5 hover:bg-white/[0.02] cursor-pointer group"
                    onClick={(e) => {
                      // só cria em célula vazia
                      if ((e.target as HTMLElement).closest('[data-evento]')) return
                      const dia = new Date(d); dia.setHours(h, 0, 0, 0)
                      setCriandoEm({ dia, hora: h })
                    }}
                  >
                    {evs.map((ev) => (
                      <button
                        key={ev.id}
                        data-evento
                        onClick={(e) => { e.stopPropagation(); setAberto(ev) }}
                        className="w-full text-left px-1.5 py-1 mb-0.5 rounded text-[11px] leading-tight border truncate"
                        style={{
                          background: (ev.cor || '#587FFF') + '25',
                          borderColor: (ev.cor || '#587FFF') + '55',
                          color: ev.cor || '#587FFF',
                        }}
                        title={ev.titulo}
                      >
                        <span className="font-bold">{ev.titulo}</span>
                        {ev.dono_nome && ev.usuario_id !== usuarioLogadoId && (
                          <span className="ml-1 opacity-70">· {ev.dono_nome.split(' ')[0]}</span>
                        )}
                      </button>
                    ))}
                    {evs.length === 0 && (
                      <span className="hidden group-hover:inline absolute inset-0 flex items-center justify-center text-[10px] text-white/25">+</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Popover aberto (usa portal simulado via fixed positioning) */}
      {aberto && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={() => setAberto(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <EventoPopover
              evento={aberto}
              souDono={aberto.usuario_id === usuarioLogadoId}
              onFechar={() => setAberto(null)}
              onMudou={() => startTransition(() => router.refresh())}
            />
          </div>
        </div>
      )}

      {criandoEm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={() => setCriandoEm(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-noite border border-sol/30 rounded-xl shadow-2xl p-4 w-96" onClick={(e) => e.stopPropagation()}>
            <CriarEventoInline
              dataHoraInicio={criandoEm.dia}
              donoId={donoAtualId}
              donoNome={donoAtualNome}
              paraOutro={donoAtualId !== usuarioLogadoId}
              onFechar={() => setCriandoEm(null)}
              onCriado={() => { setCriandoEm(null); startTransition(() => router.refresh()) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function inicioDaSemana(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const diaSem = x.getDay() // 0=dom
  x.setDate(x.getDate() - diaSem) // sempre começa no domingo
  return x
}

function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
