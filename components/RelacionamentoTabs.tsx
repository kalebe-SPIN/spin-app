'use client'

import { useState } from 'react'
import Link from 'next/link'

export type DadosRelacionamento = {
  eventos: any[]
  tarefas: any[]
  comunicacoes: any[]
  mensagensWa: any[]
  criativos: any[]
  temTelefone: boolean
}

type Aba = 'conversa' | 'agenda' | 'comunicacoes' | 'criativos'

export function RelacionamentoTabs({ projetoId, dados }: { projetoId: string; dados: DadosRelacionamento }) {
  const [aba, setAba] = useState<Aba>('conversa')

  const abas: Array<{ id: Aba; emoji: string; label: string; count: number }> = [
    { id: 'conversa', emoji: '💬', label: 'Conversa', count: dados.mensagensWa.length },
    { id: 'agenda', emoji: '📅', label: 'Agenda', count: dados.eventos.length + dados.tarefas.length },
    { id: 'comunicacoes', emoji: '📨', label: 'Comunicações', count: dados.comunicacoes.length },
    { id: 'criativos', emoji: '📚', label: 'Criativos', count: dados.criativos.length },
  ]

  return (
    <section className="mb-6 bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-wider font-bold text-white/70">
          🤝 Relacionamento com o cliente
        </h2>
        <div className="flex gap-1 flex-wrap">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                aba === a.id
                  ? 'bg-sol text-noite'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {a.emoji} {a.label}
              {a.count > 0 && (
                <span className={`ml-1 ${aba === a.id ? 'text-noite/70' : 'text-white/40'}`}>
                  · {a.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4">
        {aba === 'conversa' && <AbaConversa dados={dados} />}
        {aba === 'agenda' && <AbaAgenda dados={dados} />}
        {aba === 'comunicacoes' && <AbaComunicacoes dados={dados} />}
        {aba === 'criativos' && <AbaCriativos dados={dados} />}
      </div>
    </section>
  )
}

function AbaConversa({ dados }: { dados: DadosRelacionamento }) {
  if (!dados.temTelefone) {
    return (
      <div className="text-xs text-white/50 text-center py-6">
        <p>Cliente ainda não tem telefone cadastrado.</p>
        <p className="text-[10px] mt-1 text-white/40">Adicione um WhatsApp na seção Cliente pra iniciar conversa.</p>
      </div>
    )
  }
  if (dados.mensagensWa.length === 0) {
    return (
      <div className="text-xs text-white/50 text-center py-6">
        <p>Nenhuma mensagem trocada ainda.</p>
        <Link href="/inbox" className="text-[11px] text-sol hover:underline mt-2 inline-block">
          Abrir inbox →
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {dados.mensagensWa.slice(0, 8).map((m: any) => (
        <div
          key={m.id}
          className={`flex gap-2 items-start rounded-lg p-2 border ${
            m.direcao === 'inbound'
              ? 'bg-noite/50 border-white/5'
              : 'bg-verde/10 border-verde/20 flex-row-reverse'
          }`}
        >
          <span className="text-[9px] uppercase font-bold text-white/40 whitespace-nowrap pt-0.5">
            {m.direcao === 'inbound' ? '⬅️ Cliente' : '➡️ Spin'}
          </span>
          <p className="flex-1 text-xs text-white/90 break-words">
            {m.texto || `[${m.tipo}]`}
          </p>
          <span className="text-[9px] text-white/40 whitespace-nowrap pt-0.5">
            {new Date(m.criada_em).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
      ))}
      <div className="pt-2 text-right">
        <Link href="/inbox" className="text-[11px] text-sol hover:underline">
          Abrir conversa completa no /inbox →
        </Link>
      </div>
    </div>
  )
}

function AbaAgenda({ dados }: { dados: DadosRelacionamento }) {
  const nada = dados.eventos.length + dados.tarefas.length === 0
  if (nada) {
    return (
      <div className="text-xs text-white/50 text-center py-6">
        <p>Nenhum evento ou tarefa vinculado.</p>
        <Link href="/agenda" className="text-[11px] text-sol hover:underline mt-2 inline-block">
          Falar com Bianca / abrir agenda →
        </Link>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <h4 className="text-[10px] uppercase font-bold text-white/50 mb-2">
          Eventos ({dados.eventos.length})
        </h4>
        {dados.eventos.length === 0 ? (
          <p className="text-xs text-white/30">Nenhum evento.</p>
        ) : (
          <div className="space-y-1.5">
            {dados.eventos.map((e: any) => (
              <div key={e.id} className="bg-noite/40 border border-white/5 rounded p-2">
                <p className="text-xs font-bold text-white flex items-center gap-1">
                  {e.titulo}
                  {e.criado_por_bianca && <span className="text-[8px] text-sol">🤖</span>}
                </p>
                <p className="text-[10px] text-white/50">
                  {new Date(e.data_hora_inicio).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                  {e.local && ` · ${e.local}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-[10px] uppercase font-bold text-white/50 mb-2">
          Tarefas ({dados.tarefas.length})
        </h4>
        {dados.tarefas.length === 0 ? (
          <p className="text-xs text-white/30">Nenhuma tarefa.</p>
        ) : (
          <div className="space-y-1.5">
            {dados.tarefas.map((t: any) => (
              <div key={t.id} className="bg-noite/40 border border-white/5 rounded p-2">
                <p className={`text-xs flex items-center gap-1 ${
                  t.status === 'concluida' ? 'line-through text-white/40' : 'text-white font-bold'
                }`}>
                  {t.status === 'concluida' && '✓ '}{t.titulo}
                  {t.criada_por_bianca && <span className="text-[8px] text-verde">🤖</span>}
                </p>
                <p className="text-[10px] text-white/50 flex gap-2">
                  {t.prioridade && (
                    <span className={`uppercase font-bold ${
                      t.prioridade === 'urgente' ? 'text-coral' : t.prioridade === 'alta' ? 'text-sol' : 'text-white/50'
                    }`}>
                      {t.prioridade}
                    </span>
                  )}
                  {t.data_prazo && (
                    <span>até {new Date(t.data_prazo + 'T12:00:00-03:00').toLocaleDateString('pt-BR')}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="md:col-span-2 pt-2 text-right">
        <Link href="/agenda" className="text-[11px] text-sol hover:underline">
          Abrir agenda completa →
        </Link>
      </div>
    </div>
  )
}

function AbaComunicacoes({ dados }: { dados: DadosRelacionamento }) {
  if (dados.comunicacoes.length === 0) {
    return (
      <div className="text-xs text-white/50 text-center py-6">
        Nenhuma comunicação registrada pela Bianca ainda.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {dados.comunicacoes.slice(0, 8).map((c: any) => (
        <div key={c.id} className="bg-noite/40 border border-white/5 rounded p-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold text-white">
              {c.tipo || 'Comunicação'}
              {c.canal && <span className="ml-2 text-[9px] uppercase text-white/40">{c.canal}</span>}
            </p>
            <span className="text-[10px] text-white/40 whitespace-nowrap">
              {new Date(c.criado_em).toLocaleDateString('pt-BR')}
            </span>
          </div>
          {c.destinatario_nome && (
            <p className="text-[10px] text-white/50 mt-0.5">Para: {c.destinatario_nome}</p>
          )}
          {c.resposta_texto && (
            <p className="text-[11px] text-white/70 mt-1 italic">"{c.resposta_texto.slice(0, 200)}"</p>
          )}
          <p className="text-[9px] uppercase text-white/40 mt-1">
            status: <span className={c.status === 'respondida' ? 'text-verde' : 'text-sol'}>{c.status}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

function AbaCriativos({ dados }: { dados: DadosRelacionamento }) {
  if (dados.criativos.length === 0) {
    return (
      <div className="text-xs text-white/50 text-center py-6">
        <p>Nenhum criativo enviado a esse cliente ainda.</p>
        <Link href="/biblioteca" className="text-[11px] text-sol hover:underline mt-2 inline-block">
          Abrir biblioteca de criativos →
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {dados.criativos.slice(0, 8).map((c: any) => (
        <div key={c.id} className="bg-noite/40 border border-white/5 rounded p-2 flex items-baseline justify-between">
          <p className="text-xs text-white">
            📚 {c.resposta_texto ? c.resposta_texto.slice(0, 60) : 'Criativo enviado'}
          </p>
          <span className="text-[10px] text-white/40 whitespace-nowrap">
            {new Date(c.criado_em).toLocaleDateString('pt-BR')}
          </span>
        </div>
      ))}
      <div className="pt-2 text-right">
        <Link href="/biblioteca" className="text-[11px] text-sol hover:underline">
          Abrir biblioteca →
        </Link>
      </div>
    </div>
  )
}
