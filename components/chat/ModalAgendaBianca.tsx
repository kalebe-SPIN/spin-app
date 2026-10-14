'use client'

import { useEffect, useState } from 'react'
import {
  listarAgendaConversaAction,
  listarResponsaveisAction,
  agendarNaConversaAction,
  cancelarFollowupAction,
  type ItemAgendaConversa,
} from '@/app/inbox/agenda-actions'
import { TIPOS_EVENTO, type TipoEvento } from '@/lib/agenda/tipos-evento'

/**
 * Agenda a partir da conversa (Kalebe 2026-09-29):
 *  - Follow-up: na hora marcada a Bianca manda a mensagem ao cliente aqui
 *  - Tarefa: vai pra agenda de tarefas do responsável
 *  - Evento: compromisso na agenda (call, ligação, reunião, reunião externa, visita)
 * Kalebe 2026-10-13: escolhe quem executa — vai pra agenda da pessoa, ela
 * recebe o aviso; evento avisa antes e pergunta "como foi?" depois.
 */

type Aba = 'followup' | 'lembrete' | 'tarefa' | 'evento'

/** Lembrete ao cliente (Kalebe 2026-10-14): quando a Bianca manda, antes do compromisso */
const ANTECEDENCIAS: Array<{ min: number; rotulo: string }> = [
  { min: 1440, rotulo: '1 dia antes' },
  { min: 120, rotulo: '2 h antes' },
  { min: 60, rotulo: '1 h antes' },
  { min: 30, rotulo: '30 min antes' },
]
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
  const [tipoEvento, setTipoEvento] = useState<TipoEvento>('ligacao')
  const [local, setLocal] = useState('')
  const [lembrete, setLembrete] = useState(30)
  const [antecedencias, setAntecedencias] = useState<number[]>([1440, 60])
  const [marcarAgenda, setMarcarAgenda] = useState(true)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string }>>([])
  const [responsavel, setResponsavel] = useState('')
  const [eu, setEu] = useState('')
  const [itens, setItens] = useState<ItemAgendaConversa[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function carregar() {
    const r = await listarAgendaConversaAction(conversaId)
    if (!('erro' in r)) setItens(r.itens)
  }
  useEffect(() => {
    carregar()
    listarResponsaveisAction().then((r) => {
      if ('erro' in r) { setErro(`Não carregou a equipe: ${r.erro}`); return }
      setUsuarios(r.usuarios); setEu(r.eu); setResponsavel((v) => v || r.eu)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId])

  async function salvarLembrete() {
    const quandoIso = new Date(quando).toISOString()
    let link: string | null = null
    let naAgenda = ''
    // Compromisso na agenda do responsável primeiro (se for call, a sala vai no lembrete)
    if (marcarAgenda) {
      const ev = await agendarNaConversaAction({
        conversa_id: conversaId, tipo: 'evento', quando: quandoIso, responsavel_id: responsavel || null,
        titulo, descricao, duracao_min: duracao, tipo_evento: tipoEvento, local, lembrete_min: lembrete,
      })
      if ('erro' in ev) { setErro(ev.erro); return }
      link = ev.link_sala || null
      naAgenda = responsavel && responsavel !== eu ? ` Compromisso na agenda de ${ev.responsavel}.` : ' Compromisso na sua agenda.'
    }
    const r = await agendarNaConversaAction({
      conversa_id: conversaId, tipo: 'lembrete', quando: quandoIso, responsavel_id: responsavel || null,
      titulo, modo, mensagem, antecedencias_min: antecedencias, link_sala: link,
    })
    if ('erro' in r) { setErro(marcarAgenda ? `${r.erro} (o compromisso já entrou na agenda)` : r.erro); return }
    const quandos = ANTECEDENCIAS.filter((a) => antecedencias.includes(a.min)).map((a) => a.rotulo).join(', ')
    setOk(`✓ Lembrete agendado — a Bianca lembra o cliente ${quandos}.${naAgenda}${link ? ` Sala: ${link}` : ''}`)
    setMensagem(''); setTitulo(''); setDescricao('')
    carregar()
  }

  async function salvar() {
    setErro(null); setOk(null); setSalvando(true)
    try {
      if (aba === 'lembrete') { await salvarLembrete(); return }
      const quandoIso = aba === 'tarefa' ? quando.slice(0, 10) : new Date(quando).toISOString()
      const r = await agendarNaConversaAction({
        conversa_id: conversaId, tipo: aba, quando: quandoIso, responsavel_id: responsavel || null,
        titulo, descricao, modo, mensagem, cancelar_se_responder: cancelarSeResponder,
        prioridade, duracao_min: duracao, tipo_evento: tipoEvento, local, lembrete_min: lembrete,
      })
      if ('erro' in r) { setErro(r.erro); return }
      const paraOutro = responsavel && responsavel !== eu
      const quem = paraOutro ? `na agenda de ${r.responsavel}, que já recebeu o aviso` : 'na sua agenda'
      setOk(aba === 'followup'
        ? `✓ Follow-up agendado${paraOutro ? ` no nome de ${r.responsavel} (avisado)` : ''} — a Bianca executa na hora marcada.`
        : aba === 'tarefa' ? `✓ Tarefa criada ${quem}.`
        : `✓ Evento criado ${quem}. Aviso ${lembrete} min antes e acompanhamento depois.${r.link_sala ? ` Sala: ${r.link_sala}` : ''}`)
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
            <h2 className="text-base font-bold text-white">Agendar</h2>
            <p className="text-[11px] text-white/50">Vai pra agenda de quem executa; a Bianca avisa e acompanha.</p>
          </div>
          <button onClick={onFechar} className="text-white/40 hover:text-white/80 text-lg leading-none">✕</button>
        </div>

        <div className="grid grid-cols-4 gap-1 text-xs font-bold">
          {([['followup', 'Follow-up'], ['lembrete', 'Lembrete'], ['tarefa', 'Tarefa'], ['evento', 'Evento']] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setAba(k); setErro(null); setOk(null) }}
              className={`py-2 rounded-lg ${aba === k ? 'bg-verde/20 text-verde' : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08]'}`}>
              {l}
            </button>
          ))}
        </div>

        <Campo rotulo={aba === 'followup' ? 'Responsável (recebe os avisos do follow-up)' : aba === 'lembrete' ? 'Responsável (recebe os avisos e o compromisso)' : 'Responsável pela execução'}>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={inputCls} disabled={!usuarios.length}>
            {!usuarios.length && <option value="" className="bg-noite">Carregando…</option>}
            {usuarios.map((u) => (
              <option key={u.id} value={u.id} className="bg-noite">{u.nome}{u.id === eu ? ' (você)' : ''}</option>
            ))}
          </select>
        </Campo>

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
              mandar — ela avisa o responsável na hora pra chamar pelo celular.
            </p>
          </div>
        )}

        {aba === 'lembrete' && (
          <div className="space-y-3">
            <Campo rotulo="Do que a Bianca lembra o cliente">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Ex.: nossa reunião pra apresentar a proposta" />
            </Campo>
            <Campo rotulo="Data e hora do compromisso">
              <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={inputCls} />
            </Campo>
            <div>
              <span className="block text-[11px] font-bold text-white/60 mb-1">Quando lembrar (pode marcar mais de um)</span>
              {/* Do mais cedo pro mais perto do compromisso (a ordem carrega sentido) */}
              <div className="flex flex-wrap gap-1.5">
                {ANTECEDENCIAS.map((a) => {
                  const ativo = antecedencias.includes(a.min)
                  return (
                    <button key={a.min} type="button" aria-pressed={ativo}
                      onClick={() => setAntecedencias((xs) => (ativo ? xs.filter((x) => x !== a.min) : [...xs, a.min]))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${ativo ? 'bg-weg-azul border-weg-azul text-white' : 'border-white/15 text-white/70 hover:text-white'}`}>
                      {ativo ? '✓ ' : ''}{a.rotulo}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-white/80">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={modo === 'bianca_escreve'} onChange={() => setModo('bianca_escreve')} /> Bianca escreve o lembrete
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={modo === 'texto_exato'} onChange={() => setModo('texto_exato')} /> Texto exato
              </label>
            </div>
            {modo === 'texto_exato' && (
              <Campo rotulo="Mensagem do lembrete (vai igual em cada envio)">
                <textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className={inputCls}
                  placeholder="Escreva o lembrete do jeito que deve chegar pro cliente" />
              </Campo>
            )}
            <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
              <input type="checkbox" checked={marcarAgenda} onChange={(e) => setMarcarAgenda(e.target.checked)} />
              Marcar também o compromisso na agenda do responsável
            </label>
            {marcarAgenda && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Tipo">
                  <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value as TipoEvento)} className={inputCls}>
                    {TIPOS_EVENTO.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Duração">
                  <select value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} className={inputCls}>
                    {[15, 30, 60, 90, 120].map((m) => <option key={m} value={m} className="bg-noite">{m} min</option>)}
                  </select>
                </Campo>
                {tipoEvento === 'reuniao_externa' && (
                  <div className="col-span-2">
                    <Campo rotulo="Endereço da reunião (obrigatório)">
                      <input value={local} onChange={(e) => setLocal(e.target.value)} className={inputCls} placeholder="Rua, número, bairro, cidade" />
                    </Campo>
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-white/40">
              {tipoEvento === 'call' && marcarAgenda ? 'A sala da call é criada agora e o link vai no lembrete. ' : ''}
              O lembrete sai mesmo que o cliente responda antes. Se a janela de 24h estiver fechada, a Bianca usa o modelo de retomada ou avisa o responsável.
            </p>
          </div>
        )}

        {aba === 'tarefa' && (
          <div className="space-y-3">
            <Campo rotulo="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Ex.: Pedir foto do padrão de entrada" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Prazo"><input type="date" value={quando.slice(0, 10)} onChange={(e) => setQuando(`${e.target.value}T09:00`)} className={inputCls} /></Campo>
              {/* Prioridade em ordem crescente (a ordem carrega sentido) */}
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
            <p className="text-[10px] text-white/40">O responsável recebe o aviso agora e um lembrete no dia do prazo, às 9h.</p>
          </div>
        )}

        {aba === 'evento' && (
          <div className="space-y-3">
            <Campo rotulo="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Ex.: Apresentar a proposta" /></Campo>
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
                <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value as TipoEvento)} className={inputCls}>
                  {TIPOS_EVENTO.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Avisar antes">
                <select value={lembrete} onChange={(e) => setLembrete(Number(e.target.value))} className={inputCls}>
                  {[5, 15, 30, 60, 120].map((m) => <option key={m} value={m} className="bg-noite">{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                </select>
              </Campo>
            </div>
            {tipoEvento === 'call' ? (
              <p className="text-[11px] text-white/60 border border-white/10 rounded-lg p-2">🎥 A sala de vídeo é criada automaticamente e vai no aviso do responsável.</p>
            ) : (
              <Campo rotulo={tipoEvento === 'reuniao_externa' ? 'Endereço da reunião (obrigatório)' : 'Local (opcional)'}>
                <input value={local} onChange={(e) => setLocal(e.target.value)} className={inputCls}
                  placeholder={tipoEvento === 'reuniao_externa' ? 'Rua, número, bairro, cidade' : ''} />
              </Campo>
            )}
            <Campo rotulo="Detalhes (opcional)"><textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} /></Campo>
            <p className="text-[10px] text-white/40">Depois do horário, a Bianca pergunta ao responsável como foi, pra registrar a execução.</p>
          </div>
        )}

        {erro && <p className="text-xs text-coral bg-coral/10 border border-coral/30 rounded-lg p-2">⚠ {erro}</p>}
        {ok && <p className="text-xs text-white/85 border border-verde/40 rounded-lg p-2">{ok}</p>}

        <div className="flex justify-end">
          <button onClick={salvar} disabled={salvando || !responsavel} className="px-5 py-2 bg-verde text-white font-bold text-sm rounded-lg disabled:opacity-50">
            {salvando ? 'Salvando…' : aba === 'followup' ? 'Agendar follow-up' : aba === 'lembrete' ? 'Agendar lembrete' : aba === 'tarefa' ? 'Criar tarefa' : 'Criar evento'}
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
                    {i.responsavel ? ` · 👤 ${i.responsavel}` : ''}
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
