'use client'

import { useEffect, useState } from 'react'
import {
  listarAgendaConversaAction,
  agendarNaConversaAction,
  cancelarFollowupAction,
  type ItemAgendaConversa,
} from '@/app/inbox/agenda-actions'

/**
 * Agenda com a Bianca a partir da conversa (Kalebe 2026-09-29):
 *  - Follow-up: na hora marcada a Bianca manda a mensagem ao cliente aqui
 *  - Tarefa: vai pra agenda de tarefas do usuário
 *  - Evento: compromisso na agenda (ligação, reunião, visita)
 */

type Aba = 'followup' | 'tarefa' | 'evento'
const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'

function amanhaAs9(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000)
  d.setHours(9, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`
}

const ROTULO_STATUS: Record<string, string> = {
  agendado: 'agendado', enviado: 'enviado', cancelado: 'cancelado', aguardando_humano: 'precisa de você',
  falhou: 'falhou', pendente: 'pendente', em_andamento: 'em andamento', concluida: 'concluída', realizado: 'realizado',
}

export function ModalAgendaBianca({ conversaId, onFechar }: { conversaId: string; onFechar: () => void }) {
  const [aba, setAba] = useState<Aba>('followup')
  const [quando, setQuando] = useState(amanhaAs9())
  const [modo, setModo] = useState<'bianca_escreve' | 'texto_exato'>('bianca_escreve')
  const [mensagem, setMensagem] = useState('')
  const [cancelarSeResponder, setCancelarSeResponder] = useState(true)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta' | 'urgente'>('media')
  const [duracao, setDuracao] = useState(30)
  const [tipoEvento, setTipoEvento] = useState<'ligacao' | 'reuniao' | 'visita_tecnica'>('ligacao')
  const [local, setLocal] = useState('')
  const [itens, setItens] = useState<ItemAgendaConversa[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function carregar() {
    const r = await listarAgendaConversaAction(conversaId)
    if (!('erro' in r)) setItens(r.itens)
  }
  useEffect(() => { carregar() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId])

  async function salvar() {
    setErro(null); setOk(null); setSalvando(true)
    try {
      const quandoIso = aba === 'tarefa' ? quando.slice(0, 10) : new Date(quando).toISOString()
      const r = await agendarNaConversaAction({
        conversa_id: conversaId, tipo: aba, quando: quandoIso,
        titulo, descricao, modo, mensagem, cancelar_se_responder: cancelarSeResponder,
        prioridade, duracao_min: duracao, tipo_evento: tipoEvento, local,
      })
      if ('erro' in r) { setErro(r.erro); return }
      setOk(aba === 'followup' ? '✓ Follow-up agendado — a Bianca executa na hora marcada.'
        : aba === 'tarefa' ? '✓ Tarefa criada na sua agenda.' : '✓ Evento criado na sua agenda.')
      setMensagem(''); setTitulo(''); setDescricao('')
      carregar()
    } finally { setSalvando(false) }
  }

  async function cancelar(id: string) {
    const r = await cancelarFollowupAction(id)
    if ('erro' in r) setErro(r.erro)
    carregar()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-noite border border-white/15 rounded-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Agendar com a Bianca</h2>
            <p className="text-[11px] text-white/50">Ela acompanha e executa nesta conversa.</p>
          </div>
          <button onClick={onFechar} className="text-white/40 hover:text-white/80 text-lg leading-none">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-1 text-xs font-bold">
          {([['followup', 'Follow-up'], ['tarefa', 'Tarefa'], ['evento', 'Evento']] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setAba(k); setErro(null); setOk(null) }}
              className={`py-2 rounded-lg ${aba === k ? 'bg-verde/20 text-verde' : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08]'}`}>
              {l}
            </button>
          ))}
        </div>

        {aba === 'followup' && (
          <div className="space-y-3">
            <Campo rotulo="Quando a Bianca envia">
              <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={inputCls} />
            </Campo>
            <div className="flex gap-4 text-xs text-white/80">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={modo === 'bianca_escreve'} onChange={() => setModo('bianca_escreve')} /> Bianca escreve pela conversa
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={modo === 'texto_exato'} onChange={() => setModo('texto_exato')} /> Texto exato
              </label>
            </div>
            <Campo rotulo={modo === 'bianca_escreve' ? 'Objetivo (o que ela deve dizer)' : 'Mensagem que vai ser enviada'}>
              <textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className={inputCls}
                placeholder={modo === 'bianca_escreve' ? 'Ex.: perguntar se ele conseguiu ver a proposta e se ficou alguma dúvida' : 'Ex.: Oi! Conseguiu dar uma olhada na proposta?'} />
            </Campo>
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
              <input type="checkbox" checked={cancelarSeResponder} onChange={(e) => setCancelarSeResponder(e.target.checked)} />
              Cancelar se o cliente responder antes
            </label>
            <p className="text-[10px] text-white/40">
              Se o cliente estiver há mais de 24h sem falar com o número da Spin, o WhatsApp não deixa a Bianca
              mandar — ela te avisa na hora pra você chamar pelo celular.
            </p>
          </div>
        )}

        {aba === 'tarefa' && (
          <div className="space-y-3">
            <Campo rotulo="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Ex.: Pedir foto do padrão de entrada" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Prazo"><input type="date" value={quando.slice(0, 10)} onChange={(e) => setQuando(`${e.target.value}T09:00`)} className={inputCls} /></Campo>
              <Campo rotulo="Prioridade">
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as any)} className={inputCls}>
                  <option value="baixa" className="bg-noite">Baixa</option>
                  <option value="media" className="bg-noite">Média</option>
                  <option value="alta" className="bg-noite">Alta</option>
                  <option value="urgente" className="bg-noite">Urgente</option>
                </select>
              </Campo>
            </div>
            <Campo rotulo="Detalhes (opcional)"><textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} /></Campo>
          </div>
        )}

        {aba === 'evento' && (
          <div className="space-y-3">
            <Campo rotulo="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Ex.: Ligar pra apresentar a proposta" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Início"><input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={inputCls} /></Campo>
              <Campo rotulo="Duração">
                <select value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} className={inputCls}>
                  {[15, 30, 60, 90, 120].map((m) => <option key={m} value={m} className="bg-noite">{m} min</option>)}
                </select>
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Tipo">
                <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value as any)} className={inputCls}>
                  <option value="ligacao" className="bg-noite">Ligação</option>
                  <option value="reuniao" className="bg-noite">Reunião</option>
                  <option value="visita_tecnica" className="bg-noite">Visita técnica</option>
                </select>
              </Campo>
              <Campo rotulo="Local (opcional)"><input value={local} onChange={(e) => setLocal(e.target.value)} className={inputCls} /></Campo>
            </div>
            <Campo rotulo="Detalhes (opcional)"><textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} /></Campo>
          </div>
        )}

        {erro && <p className="text-xs text-coral bg-coral/10 border border-coral/30 rounded-lg p-2">⚠ {erro}</p>}
        {ok && <p className="text-xs text-verde">{ok}</p>}

        <div className="flex justify-end">
          <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-verde text-noite font-bold text-sm rounded-lg disabled:opacity-50">
            {salvando ? 'Salvando…' : aba === 'followup' ? 'Agendar follow-up' : aba === 'tarefa' ? 'Criar tarefa' : 'Criar evento'}
          </button>
        </div>

        {itens.length > 0 && (
          <div className="pt-3 border-t border-white/10">
            <p className="text-[10px] uppercase tracking-wider font-bold text-white/40 mb-2">Nesta conversa</p>
            <ul className="space-y-1.5">
              {itens.map((i) => (
                <li key={`${i.tipo}-${i.id}`} className="text-xs bg-white/[0.03] border border-white/5 rounded-lg p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-white/85">{i.tipo === 'followup' ? '💬' : i.tipo === 'tarefa' ? '✅' : '📅'} {i.titulo}</span>
                    {i.tipo === 'followup' && i.status === 'agendado' && (
                      <button onClick={() => cancelar(i.id)} className="text-coral/80 hover:text-coral shrink-0">cancelar</button>
                    )}
                  </div>
                  <p className="text-[10px] text-white/45 mt-0.5">
                    {i.quando ? new Date(i.quando.length === 10 ? `${i.quando}T12:00` : i.quando).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', ...(i.quando.length === 10 ? {} : { hour: '2-digit', minute: '2-digit' }),
                    }) : 'sem data'} · {ROTULO_STATUS[i.status] || i.status}
                    {i.detalhe ? ` · ${i.detalhe}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-white/60 mb-1">{rotulo}</span>
      {children}
    </label>
  )
}
