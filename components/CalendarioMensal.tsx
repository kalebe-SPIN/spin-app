'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Evento = {
  id: string
  titulo: string
  data_hora_inicio: string
  data_hora_fim: string | null
  local: string | null
  tipo: string
  cor: string | null
  criado_por_bianca: boolean
  descricao?: string | null
  contexto_conversa?: string | null
}

const CORES_TIPO: Record<string, string> = {
  reuniao: 'bg-blue-500/70 hover:bg-blue-500 text-white',
  visita: 'bg-verde/70 hover:bg-verde text-noite',
  ligacao: 'bg-purple-500/70 hover:bg-purple-500 text-white',
  geral: 'bg-sol/70 hover:bg-sol text-noite',
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function CalendarioMensal({
  ano,
  mes,
  eventos,
}: {
  ano: number
  mes: number
  eventos: Evento[]
}) {
  const router = useRouter()
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const [contextoAberto, setContextoAberto] = useState<string | null>(null)

  const hoje = new Date()
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  // Agrupa eventos por dia (YYYY-MM-DD no fuso -03:00)
  const eventosPorDia = useMemo(() => {
    const mapa: Record<string, Evento[]> = {}
    for (const ev of eventos) {
      const chave = new Date(ev.data_hora_inicio).toLocaleDateString('sv-SE', {
        timeZone: 'America/Sao_Paulo',
      }) // YYYY-MM-DD
      if (!mapa[chave]) mapa[chave] = []
      mapa[chave].push(ev)
    }
    return mapa
  }, [eventos])

  // Gera as células do grid (7 x 5 ou 6)
  const celulas = useMemo(() => {
    const inicioMes = new Date(ano, mes - 1, 1)
    const fimMes = new Date(ano, mes, 0)
    const inicioGrid = new Date(inicioMes)
    inicioGrid.setDate(inicioGrid.getDate() - inicioGrid.getDay())

    const dias: { data: Date; noMes: boolean; chave: string }[] = []
    const totalCelulas = Math.ceil((fimMes.getDate() + inicioMes.getDay()) / 7) * 7

    for (let i = 0; i < totalCelulas; i++) {
      const data = new Date(inicioGrid)
      data.setDate(data.getDate() + i)
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
      dias.push({
        data,
        noMes: data.getMonth() === mes - 1,
        chave,
      })
    }
    return dias
  }, [ano, mes])

  function irPara(novoAno: number, novoMes: number) {
    setDiaSelecionado(null)
    router.push(`/agenda/calendario?ano=${novoAno}&mes=${novoMes}`)
  }

  function mesAnterior() {
    const d = new Date(ano, mes - 2, 1)
    irPara(d.getFullYear(), d.getMonth() + 1)
  }

  function mesProximo() {
    const d = new Date(ano, mes, 1)
    irPara(d.getFullYear(), d.getMonth() + 1)
  }

  function irParaHoje() {
    irPara(hoje.getFullYear(), hoje.getMonth() + 1)
    setDiaSelecionado(hojeStr)
  }

  const eventosSelecionados = diaSelecionado ? (eventosPorDia[diaSelecionado] || []) : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Calendário (3/4) */}
      <div className="lg:col-span-3 bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {NOMES_MES[mes - 1]} <span className="text-sol">{ano}</span>
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={mesAnterior}
              className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 text-white/70"
              title="Mês anterior"
            >
              ‹
            </button>
            <button
              onClick={irParaHoje}
              className="px-3 h-8 rounded bg-sol/10 border border-sol/30 hover:bg-sol/20 text-sol text-xs font-bold"
            >
              Hoje
            </button>
            <button
              onClick={mesProximo}
              className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 text-white/70"
              title="Próximo mês"
            >
              ›
            </button>
          </div>
        </div>

        {/* Header dias da semana */}
        <div className="grid grid-cols-7 border-b border-white/10">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-[10px] uppercase font-bold text-white/40 text-center"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid dias */}
        <div className="grid grid-cols-7">
          {celulas.map((celula) => {
            const evs = eventosPorDia[celula.chave] || []
            const eHoje = celula.chave === hojeStr
            const eSelecionado = celula.chave === diaSelecionado
            const dia = celula.data.getDate()

            return (
              <button
                key={celula.chave}
                onClick={() => setDiaSelecionado(celula.chave)}
                className={`min-h-[90px] p-1.5 border-r border-b border-white/5 text-left transition ${
                  !celula.noMes ? 'bg-noite/20' : ''
                } ${
                  eSelecionado ? 'bg-sol/10 ring-1 ring-sol/40' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div
                  className={`text-xs font-bold mb-1 ${
                    eHoje
                      ? 'w-6 h-6 flex items-center justify-center rounded-full bg-sol text-noite'
                      : celula.noMes
                      ? 'text-white/70'
                      : 'text-white/30'
                  }`}
                >
                  {dia}
                </div>
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className={`text-[9px] px-1 py-0.5 rounded truncate ${
                        CORES_TIPO[ev.tipo] || CORES_TIPO.geral
                      }`}
                      title={ev.titulo}
                    >
                      {new Date(ev.data_hora_inicio).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'America/Sao_Paulo',
                      })}{' '}
                      {ev.titulo}
                    </div>
                  ))}
                  {evs.length > 3 && (
                    <div className="text-[9px] text-white/40 pl-1">
                      +{evs.length - 3} mais
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel dia selecionado (1/4) */}
      <aside className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        {diaSelecionado ? (
          <>
            <h3 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
              📅 {new Date(diaSelecionado + 'T12:00:00-03:00').toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                timeZone: 'America/Sao_Paulo',
              })}
            </h3>
            {eventosSelecionados.length === 0 ? (
              <p className="text-xs text-white/40">Nenhum evento nesse dia.</p>
            ) : (
              <div className="space-y-2">
                {eventosSelecionados.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-noite/40 border border-white/10 rounded p-2"
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          CORES_TIPO[ev.tipo]?.split(' ')[0] || 'bg-sol'
                        }`}
                      />
                      <p className="text-sm font-bold text-white flex-1">
                        {ev.titulo}
                        {ev.criado_por_bianca && (
                          <span className="text-[9px] text-sol ml-1">🤖</span>
                        )}
                      </p>
                    </div>
                    <p className="text-[10px] text-white/50">
                      {new Date(ev.data_hora_inicio).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'America/Sao_Paulo',
                      })}
                      {ev.data_hora_fim && (
                        <>
                          {' – '}
                          {new Date(ev.data_hora_fim).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'America/Sao_Paulo',
                          })}
                        </>
                      )}
                    </p>
                    {ev.local && (
                      <p className="text-[10px] text-white/50 mt-0.5">📍 {ev.local}</p>
                    )}
                    {ev.descricao && (
                      <p className="text-[10px] text-white/60 mt-1 italic">{ev.descricao}</p>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[9px] uppercase text-white/40">{ev.tipo}</p>
                      {ev.contexto_conversa && (
                        <button
                          onClick={() => setContextoAberto(contextoAberto === ev.id ? null : ev.id)}
                          className="text-[9px] text-sol/70 hover:text-sol"
                        >
                          {contextoAberto === ev.id ? '▲ fechar' : '💬 ver conversa'}
                        </button>
                      )}
                    </div>
                    {contextoAberto === ev.id && ev.contexto_conversa && (
                      <div className="mt-2 p-2 bg-noite/60 border border-white/10 rounded text-[10px] text-white/70 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {ev.contexto_conversa}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-white/40 text-xs">
            <div className="text-3xl mb-2">👆</div>
            <p>Clica num dia pra ver os eventos</p>
          </div>
        )}

        {/* Legenda */}
        <div className="mt-6 pt-4 border-t border-white/10 space-y-1.5">
          <p className="text-[10px] uppercase font-bold text-white/40 mb-2">Legenda</p>
          <div className="flex items-center gap-2 text-[10px] text-white/60">
            <div className="w-3 h-3 rounded bg-blue-500/70" /> Reunião
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/60">
            <div className="w-3 h-3 rounded bg-verde/70" /> Visita
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/60">
            <div className="w-3 h-3 rounded bg-purple-500/70" /> Ligação
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/60">
            <div className="w-3 h-3 rounded bg-sol/70" /> Geral
          </div>
        </div>
      </aside>
    </div>
  )
}
