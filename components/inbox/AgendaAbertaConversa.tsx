'use client'

import { useCallback, useEffect, useState } from 'react'
import { agendaAbertaConversaAction, concluirItemAgendaConversaAction, type AbertoAgendaConversa } from '@/app/inbox/agenda-actions'
import { ROTULO_ACAO_AGENDA, ROTULO_TIPO_AGENDA, type RegistroAgenda } from '@/lib/spinzap/agenda-rotulos'

/**
 * Cartão MÓVEL da agenda (Kalebe 2026-10-19): tarefa, follow-up, lembrete e
 * evento em aberto acompanham a conversa — ficam acima da caixa de mensagem,
 * visíveis assim que a conversa abre. "Concluído" fecha o item e o cartão se
 * fixa na linha do tempo (CartaoAgendaFixo).
 */

/** Avisa a conversa que a agenda mudou (o modal de agenda dispara ao fechar). */
export const EVENTO_AGENDA_MUDOU = 'spinzap:agenda-mudou'

const tipoVisual = (i: AbertoAgendaConversa) => ROTULO_TIPO_AGENDA[i.tipo === 'followup' && i.lembrete ? 'lembrete' : i.tipo]

export function AgendaAbertaConversa({ conversaId, gatilho, onConcluido }: { conversaId: string; gatilho?: number; onConcluido?: () => void }) {
  const [itens, setItens] = useState<AbertoAgendaConversa[]>([])
  const [aberto, setAberto] = useState(true)
  const [concluindo, setConcluindo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const r = await agendaAbertaConversaAction(conversaId)
    if (!('erro' in r)) setItens(r.itens)
  }, [conversaId])

  // Abriu a conversa / chegou mensagem nova (a Bianca pode ter enviado)
  useEffect(() => {
    const t = setTimeout(carregar, gatilho ? 800 : 0)
    return () => clearTimeout(t)
  }, [carregar, gatilho])
  // Mudou a agenda (modal) e o relógio (atrasos)
  useEffect(() => {
    const aoMudar = () => { carregar() }
    window.addEventListener(EVENTO_AGENDA_MUDOU, aoMudar)
    const t = setInterval(carregar, 60_000)
    return () => { window.removeEventListener(EVENTO_AGENDA_MUDOU, aoMudar); clearInterval(t) }
  }, [carregar])

  async function concluir(i: AbertoAgendaConversa) {
    if (i.tipo === 'followup' && !i.executado && !confirm('A Bianca ainda não enviou. Concluir agora cancela o envio dela. Continuar?')) return
    setErro(null); setConcluindo(i.id)
    try {
      const r = await concluirItemAgendaConversaAction(conversaId, i.tipo, i.id)
      if ('erro' in r) { setErro(r.erro); return }
      setItens((xs) => xs.filter((x) => x.id !== i.id))
      onConcluido?.()
    } finally { setConcluindo(null) }
  }

  if (!itens.length) return null
  const atencao = itens.filter((i) => i.atencao).length
  return (
    <div className={`shrink-0 mx-2 lg:mx-4 mb-2 rounded-xl border bg-noite ${atencao ? 'border-coral/55' : 'border-sol/45'}`}>
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-start">
        <span className="text-[11px] font-bold text-white/85">
          📌 Em aberto na agenda · {itens.length}{atencao ? ` · ${atencao} precisa${atencao === 1 ? '' : 'm'} de atenção` : ''}
        </span>
        <span className="text-[11px] text-white/50 shrink-0">{aberto ? 'recolher ▾' : 'ver ▸'}</span>
      </button>
      {aberto && (
        <div className="max-h-44 overflow-y-auto px-2 pb-2 space-y-1.5">
          {itens.map((i) => {
            const t = tipoVisual(i)
            return (
              <div key={i.id} className={`rounded-lg border px-2.5 py-2 flex items-start gap-2 ${i.atencao ? 'border-coral/60' : i.executado ? 'border-verde/50' : 'border-white/15'}`}>
                <span className="text-base leading-none mt-0.5" aria-hidden>{t.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50 truncate">
                    {t.nome}{i.quando ? ` · ${i.quando}` : ''}{i.responsavel ? ` · 👤 ${i.responsavel}` : ''}
                  </p>
                  <p className="text-[12px] text-white/90 line-clamp-2 break-words">{i.titulo}</p>
                  <p className="text-[11px] text-white/55">{i.situacao}</p>
                </div>
                <button type="button" onClick={() => concluir(i)} disabled={!!concluindo}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-verde text-white text-[11px] font-bold text-start disabled:opacity-40">
                  {concluindo === i.id ? '…' : '✓ Concluído'}
                </button>
              </div>
            )
          })}
          {erro && <p className="text-[11px] text-white/80 border border-coral/45 rounded-lg px-2 py-1">⚠ {erro}</p>}
        </div>
      )}
    </div>
  )
}

/** Registro da agenda gravado na conversa (pela listagem: agenda; pelo realtime: dados.agenda). */
export function agendaDaMensagem(m: { tipo: string } & Record<string, any>): RegistroAgenda | null {
  if (m.tipo !== 'system') return null
  const r = m.agenda || m.dados?.agenda
  return r && typeof r === 'object' && r.acao && r.tipo ? (r as RegistroAgenda) : null
}

/** Cartão FIXO na linha do tempo: concluído, cancelado ou excluído. */
export function CartaoAgendaFixo({ r, criadaEm }: { r: RegistroAgenda; criadaEm: string }) {
  const t = ROTULO_TIPO_AGENDA[r.tipo] || ROTULO_TIPO_AGENDA.tarefa
  const hora = new Date(criadaEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex justify-center">
      <div className={`w-full max-w-md rounded-xl border px-3 py-2 bg-white/[0.03] ${r.acao === 'concluido' ? 'border-verde/50' : 'border-white/20'}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
          📌 {t.emoji} {t.nome} {ROTULO_ACAO_AGENDA[r.acao] || r.acao}{r.por ? ` por ${r.por}` : ''} · {hora}
        </p>
        <p className="text-[13px] text-white/90 mt-0.5 break-words">{r.titulo}</p>
        {r.quando && <p className="text-[11px] text-white/60">🕐 {r.quando}</p>}
        {r.responsavel && <p className="text-[11px] text-white/60">👤 Responsável: {r.responsavel}</p>}
        {r.detalhe && <p className="text-[11px] text-white/60 break-words">📝 {r.detalhe}</p>}
        <p className="text-[10px] text-white/35 mt-1">Registro interno — o cliente não vê</p>
      </div>
    </div>
  )
}
