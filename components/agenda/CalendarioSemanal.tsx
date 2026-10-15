'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { EventoPopover, type EventoResumo } from './EventoPopover'
import { CriarEventoInline } from './CriarEventoInline'
import { mudarStatusTarefaAction } from '@/app/agenda/actions'

/**
 * Kalebe 2026-10-14: a agenda mostra tudo que o sistema marca pra pessoa —
 * eventos, tarefas (no dia do prazo; atrasadas aparecem hoje), follow-ups da
 * Bianca e serviços de campo. Volta pra aba = recarrega (sincronia).
 */
export type TarefaAgenda = {
  id: string; titulo: string; data_prazo: string; status: string; prioridade: string
  projeto_id: string | null; conversa_id: string | null; usuario_id: string
}
export type FollowupAgenda = { id: string; executar_em: string; status: string; mensagem: string; conversa_id: string; cliente: string | null }
export type ServicoAgenda = {
  id: string; titulo: string; os_numero: string | null; data: string; hora: string | null
  status: string; cliente: string | null; cidade: string | null; projeto_id: string | null
}
type ItemAberto =
  | { tipo: 'tarefa'; item: TarefaAgenda }
  | { tipo: 'followup'; item: FollowupAgenda }
  | { tipo: 'servico'; item: ServicoAgenda }

/**
 * Popup da agenda (Kalebe 2026-10-15: no celular saía da tela): vai direto no
 * <body> — fora de cartão com desfoque, que prenderia o "fixed" — e o cartão
 * cabe na largura da tela e rola na altura.
 */
function PopupAgenda({ onFechar, children, borda = 'border-white/15', cartao = true }: {
  onFechar: () => void; children: ReactNode; borda?: string
  /** false: o conteúdo já traz o próprio cartão (EventoPopover) */
  cartao?: boolean
}) {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  if (!montado) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/40" />
      {cartao ? (
        <div className={`relative w-[min(24rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto bg-noite border ${borda} rounded-xl shadow-2xl p-4 space-y-2`}
          onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      ) : <div className="relative" onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>,
    document.body,
  )
}

const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TAREFA_FEITA = ['concluida']

/**
 * Calendário semanal simples — grade 7 dias × horas. Cada evento é um bloco
 * clicável que abre o EventoPopover pra confirmar/editar/excluir/mudar tipo.
 *
 * NÃO faz drag-and-drop (fora do escopo). Criação de novos eventos: clicar em
 * célula vazia abre um mini form inline (CriarEventoInline).
 */
export function CalendarioSemanal({
  eventos,
  tarefas = [],
  followups = [],
  servicos = [],
  usuarioLogadoId,
  donoAtualId,
  donoAtualNome,
}: {
  eventos: EventoResumo[]
  tarefas?: TarefaAgenda[]
  followups?: FollowupAgenda[]
  servicos?: ServicoAgenda[]
  usuarioLogadoId: string
  donoAtualId: string
  donoAtualNome: string
}) {
  const router = useRouter()
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()))
  const [aberto, setAberto] = useState<EventoResumo | null>(null)
  const [itemAberto, setItemAberto] = useState<ItemAberto | null>(null)
  const [criandoEm, setCriandoEm] = useState<{ dia: Date; hora: number } | null>(null)
  const [, startTransition] = useTransition()
  const [concluindo, setConcluindo] = useState(false)

  // Item criado em outra tela (Spinzap, projeto, Bianca) aparece ao voltar pra aba
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') router.refresh() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [router])

  const hojeChave = chaveDia(new Date())
  function tarefasDo(dia: Date) {
    const k = chaveDia(dia)
    // Atrasada e ainda aberta: sai do dia do prazo e aparece hoje
    const atrasada = (t: TarefaAgenda) => t.data_prazo < hojeChave && !TAREFA_FEITA.includes(t.status)
    return tarefas.filter((t) => (atrasada(t) ? k === hojeChave : t.data_prazo === k))
  }
  const servicosSemHora = (dia: Date) => servicos.filter((s) => s.data === chaveDia(dia) && !s.hora)
  function extrasDo(dia: Date, hora: number) {
    const k = chaveDia(dia)
    return {
      fups: followups.filter((f) => { const dt = new Date(f.executar_em); return chaveDia(dt) === k && dt.getHours() === hora }),
      servs: servicos.filter((s) => s.data === k && s.hora && Number(s.hora.slice(0, 2)) === hora),
    }
  }
  async function concluirTarefa(t: TarefaAgenda) {
    setConcluindo(true)
    try {
      const r = await mudarStatusTarefaAction(t.id, 'concluida')
      if (r && 'erro' in r && r.erro) { alert(r.erro); return }
      setItemAberto(null)
      startTransition(() => router.refresh())
    } finally { setConcluindo(false) }
  }

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

          {/* Faixa do dia: tarefas (prazo) e serviços de campo sem hora */}
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-white/10">
            <div className="px-1 py-1 text-[9px] text-white/40 text-right uppercase tracking-wider border-r border-white/5 leading-tight">Tare&shy;fas</div>
            {dias.map((d) => {
              const ts = tarefasDo(d)
              const ss = servicosSemHora(d)
              return (
                <div key={'faixa' + d.toISOString()} className="border-r border-white/5 last:border-r-0 p-0.5 min-h-[30px] space-y-0.5">
                  {ts.map((t) => {
                    const feita = TAREFA_FEITA.includes(t.status)
                    const atrasada = !feita && t.data_prazo < hojeChave
                    return (
                      <button key={t.id} type="button" onClick={() => setItemAberto({ tipo: 'tarefa', item: t })} title={t.titulo}
                        className={`w-full text-start px-1.5 py-0.5 rounded text-[11px] leading-tight border truncate ${
                          feita ? 'border-white/10 text-white/35 line-through' : atrasada ? 'border-coral/60 text-white/85' : 'border-verde/50 text-white/85'}`}>
                        {feita ? '✓' : atrasada ? '⚠' : '☐'} {t.titulo}
                      </button>
                    )
                  })}
                  {ss.map((s) => (
                    <button key={s.id} type="button" onClick={() => setItemAberto({ tipo: 'servico', item: s })} title={s.titulo}
                      className="w-full text-start px-1.5 py-0.5 rounded text-[11px] leading-tight border border-sol/50 text-white/85 truncate">
                      🔧 {s.titulo}
                    </button>
                  ))}
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
                const { fups, servs } = extrasDo(d, h)
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
                    {fups.map((f) => (
                      <button key={f.id} type="button" data-evento onClick={(e) => { e.stopPropagation(); setItemAberto({ tipo: 'followup', item: f }) }}
                        title={f.mensagem}
                        className={`w-full text-start px-1.5 py-1 mb-0.5 rounded text-[11px] leading-tight border truncate ${f.status === 'agendado' ? 'border-weg-azul/60 text-white/85' : 'border-white/10 text-white/40'}`}>
                        💬 {f.cliente || 'Follow-up'}
                      </button>
                    ))}
                    {servs.map((s) => (
                      <button key={s.id} type="button" data-evento onClick={(e) => { e.stopPropagation(); setItemAberto({ tipo: 'servico', item: s }) }}
                        title={s.titulo}
                        className="w-full text-start px-1.5 py-1 mb-0.5 rounded text-[11px] leading-tight border border-sol/50 text-white/85 truncate">
                        🔧 {s.titulo}
                      </button>
                    ))}
                    {evs.length + fups.length + servs.length === 0 && (
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
        <PopupAgenda onFechar={() => setAberto(null)} cartao={false}>
          <EventoPopover
            evento={aberto}
            souDono={aberto.usuario_id === usuarioLogadoId}
            onFechar={() => setAberto(null)}
            onMudou={() => startTransition(() => router.refresh())}
          />
        </PopupAgenda>
      )}

      {itemAberto && (
        <PopupAgenda onFechar={() => setItemAberto(null)}>
            {itemAberto.tipo === 'tarefa' && (() => {
              const t = itemAberto.item
              const feita = TAREFA_FEITA.includes(t.status)
              return (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold">Tarefa · prioridade {t.prioridade}</p>
                  <p className="text-white font-bold leading-tight">{t.titulo}</p>
                  <p className="text-xs text-white/55">
                    Prazo {new Date(`${t.data_prazo}T12:00:00`).toLocaleDateString('pt-BR')} · {t.status.replace('_', ' ')}
                    {!feita && t.data_prazo < hojeChave ? ' · atrasada' : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!feita && t.usuario_id === usuarioLogadoId && (
                      <button type="button" disabled={concluindo} onClick={() => concluirTarefa(t)}
                        className="px-3 py-1.5 rounded-lg bg-verde text-white text-xs font-bold disabled:opacity-40">
                        {concluindo ? 'Concluindo…' : '✓ Concluir'}
                      </button>
                    )}
                    {t.conversa_id && <a href={`/spinzap?c=${t.conversa_id}`} className="px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs font-bold">💬 Conversa</a>}
                    {t.projeto_id && <a href={`/projetos/${t.projeto_id}`} className="px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs font-bold">📁 Projeto</a>}
                    <a href={`/agenda/tarefa/${t.id}`} className="px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs font-bold">Detalhes</a>
                  </div>
                </>
              )
            })()}
            {itemAberto.tipo === 'followup' && (() => {
              const f = itemAberto.item
              return (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold">Follow-up · {f.status}</p>
                  <p className="text-white font-bold leading-tight">{f.cliente || 'Cliente'}</p>
                  <p className="text-xs text-white/55">{new Date(f.executar_em).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-xs text-white/75 whitespace-pre-wrap">{f.mensagem}</p>
                  <a href={`/spinzap?c=${f.conversa_id}`} className="inline-block px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs font-bold">💬 Abrir conversa</a>
                </>
              )
            })()}
            {itemAberto.tipo === 'servico' && (() => {
              const s = itemAberto.item
              return (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold">Serviço de campo{s.os_numero ? ` · OS ${s.os_numero}` : ''} · {s.status.replace('_', ' ')}</p>
                  <p className="text-white font-bold leading-tight">{s.titulo}</p>
                  <p className="text-xs text-white/55">
                    {new Date(`${s.data}T12:00:00`).toLocaleDateString('pt-BR')}{s.hora ? ` às ${s.hora}` : ''}
                    {s.cliente ? ` · ${s.cliente}` : ''}{s.cidade ? ` · ${s.cidade}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a href={`/campo/os/${s.id}`} className="px-3 py-1.5 rounded-lg bg-weg-azul text-white text-xs font-bold">Abrir OS</a>
                    {s.projeto_id && <a href={`/projetos/${s.projeto_id}`} className="px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs font-bold">📁 Projeto</a>}
                  </div>
                </>
              )
            })()}
        </PopupAgenda>
      )}

      {criandoEm && (
        <PopupAgenda onFechar={() => setCriandoEm(null)} borda="border-sol/30">
          <CriarEventoInline
            dataHoraInicio={criandoEm.dia}
            donoId={donoAtualId}
            donoNome={donoAtualNome}
            paraOutro={donoAtualId !== usuarioLogadoId}
            onFechar={() => setCriandoEm(null)}
            onCriado={() => { setCriandoEm(null); startTransition(() => router.refresh()) }}
          />
        </PopupAgenda>
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
