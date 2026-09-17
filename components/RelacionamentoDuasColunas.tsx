'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { enviarTextoAction, iniciarChamadaAction } from '@/app/inbox/actions'
import {
  criarEventoAction,
  criarTarefaAction,
  excluirEventoAction,
  excluirTarefaAction,
  mudarStatusEventoAction,
  mudarStatusTarefaAction,
} from '@/app/agenda/actions'

export type Responsavel = { id: string; nome: string; role: string }

export type DadosRelacionamento = {
  eventos: any[]
  tarefas: any[]
  mensagens: any[]
  conversaId: string | null
  temTelefone: boolean
  telefoneCliente: string
  projetoId: string
  clienteId: string | null
  usuarioId: string
  responsaveis: Responsavel[]
}

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

const fmtDataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function RelacionamentoDuasColunas({ dados }: { dados: DadosRelacionamento }) {
  return (
    <section className="mb-6 bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider font-bold text-white/70">
          🤝 Relacionamento com o cliente
        </h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
        <ColunaWhatsApp dados={dados} />
        <ColunaAgenda dados={dados} />
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// COLUNA ESQUERDA — WhatsApp Spin
// ═══════════════════════════════════════════════════════════════
function ColunaWhatsApp({ dados }: { dados: DadosRelacionamento }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [enviando, startEnviando] = useTransition()
  const [chamando, startChamando] = useTransition()
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  function enviar() {
    setMsg(null)
    if (!dados.conversaId) {
      setMsg({ tipo: 'erro', texto: 'Cliente sem telefone. Cadastre um WhatsApp na seção Cliente.' })
      return
    }
    const t = texto.trim()
    if (!t) return
    startEnviando(async () => {
      const r = await enviarTextoAction({ conversa_id: dados.conversaId!, texto: t })
      if ('erro' in r) {
        setMsg({ tipo: 'erro', texto: r.erro })
        return
      }
      setTexto('')
      setMsg({ tipo: 'ok', texto: '✓ Enviada' })
      router.refresh()
    })
  }

  function iniciarChamada(midia: 'voz' | 'video') {
    if (!dados.conversaId) {
      setMsg({ tipo: 'erro', texto: 'Cliente sem telefone.' })
      return
    }
    setMsg(null)
    startChamando(async () => {
      const r = await iniciarChamadaAction({ conversa_id: dados.conversaId!, tipo: midia })
      if ('erro' in r) {
        setMsg({ tipo: 'erro', texto: r.erro })
        return
      }
      if (r.url_sala) {
        window.open(r.url_sala, '_blank', 'noopener,noreferrer')
      }
      setMsg({ tipo: 'ok', texto: `📞 ${midia === 'video' ? 'Videochamada' : 'Chamada'} iniciada` })
      router.refresh()
    })
  }

  return (
    <div className="p-4 flex flex-col h-[520px]">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-verde flex items-center gap-1.5">
          💬 WhatsApp Spin
          <span className="text-white/40">·</span>
          <span className="text-white/60 font-mono normal-case tracking-normal">
            {dados.telefoneCliente || 'sem telefone'}
          </span>
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => iniciarChamada('voz')}
            disabled={chamando || !dados.conversaId}
            title="Chamada de voz via Jitsi"
            className="w-8 h-8 flex items-center justify-center rounded bg-verde/10 border border-verde/30 hover:bg-verde/20 disabled:opacity-30 transition"
          >
            📞
          </button>
          <button
            type="button"
            onClick={() => iniciarChamada('video')}
            disabled={chamando || !dados.conversaId}
            title="Videochamada via Jitsi"
            className="w-8 h-8 flex items-center justify-center rounded bg-verde/10 border border-verde/30 hover:bg-verde/20 disabled:opacity-30 transition"
          >
            🎥
          </button>
          {dados.conversaId && (
            <Link
              href={`/inbox?c=${dados.conversaId}`}
              title="Abrir conversa completa no inbox"
              className="w-8 h-8 flex items-center justify-center rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 transition"
            >
              ↗
            </Link>
          )}
        </div>
      </div>

      {/* Feed de mensagens — cresce mas rola dentro, não muda altura do card */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 mb-3 pr-1">
        {!dados.temTelefone ? (
          <p className="text-xs text-white/40 text-center py-8">
            Cliente sem telefone.<br />
            <span className="text-[10px] text-white/30">Edita o cadastro do cliente e adiciona um WhatsApp.</span>
          </p>
        ) : dados.mensagens.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-8">
            Nenhuma mensagem trocada ainda.<br />
            <span className="text-[10px] text-white/30">Digita abaixo pra iniciar.</span>
          </p>
        ) : (
          dados.mensagens.map((m: any) => (
            <MensagemBubble key={m.id} msg={m} />
          ))
        )}
      </div>

      {/* Input + enviar */}
      <div className="space-y-2 flex-shrink-0">
        {msg && (
          <p className={`text-[10px] text-center ${msg.tipo === 'ok' ? 'text-verde' : 'text-coral'}`}>
            {msg.texto}
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            placeholder={dados.conversaId ? 'Escrever mensagem...' : 'Cliente sem telefone'}
            disabled={enviando || !dados.conversaId}
            className="flex-1 px-3 py-2 bg-white/5 border border-white/15 rounded text-sm text-white placeholder-white/30 focus:outline-none focus:border-verde disabled:opacity-40"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !texto.trim() || !dados.conversaId}
            className="px-4 py-2 bg-verde text-white text-xs font-bold rounded hover:bg-verde/90 disabled:opacity-30 transition"
          >
            {enviando ? '...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MensagemBubble({ msg }: { msg: any }) {
  const inbound = msg.direcao === 'inbound'
  const remetente =
    inbound
      ? 'Cliente'
      : msg.origem_agente_nome || msg.remetente?.nome_completo || 'Spin'
  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 border ${
          inbound ? 'bg-noite/50 border-white/5' : 'bg-verde/15 border-verde/25'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="text-[9px] uppercase font-bold text-white/40">{remetente}</span>
          <span className="text-[9px] text-white/30 whitespace-nowrap">{fmtHora(msg.criada_em)}</span>
        </div>
        <p className="text-xs text-white/90 break-words">
          {msg.texto || `[${msg.tipo}]`}
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// COLUNA DIREITA — Agenda (eventos + tarefas + criar inline)
// ═══════════════════════════════════════════════════════════════
function ColunaAgenda({ dados }: { dados: DadosRelacionamento }) {
  const router = useRouter()
  const [modo, setModo] = useState<'lista' | 'nova_tarefa' | 'novo_evento'>('lista')
  const [salvando, startSalvando] = useTransition()
  const [erroAg, setErroAg] = useState<string | null>(null)

  return (
    <div className="p-4 flex flex-col h-[520px]">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2 flex-shrink-0">
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-sol flex items-center gap-1.5">
          📅 Agenda vinculada
          <span className="text-white/40">·</span>
          <span className="text-white/60">
            {dados.eventos.length + dados.tarefas.length} itens
          </span>
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setModo('nova_tarefa')}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
              modo === 'nova_tarefa' ? 'bg-sol text-noite' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
            }`}
          >
            + Tarefa
          </button>
          <button
            type="button"
            onClick={() => setModo('novo_evento')}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
              modo === 'novo_evento' ? 'bg-sol text-noite' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
            }`}
          >
            + Compromisso
          </button>
        </div>
      </div>

      {modo === 'nova_tarefa' && (
        <FormNovaTarefa
          dados={dados}
          salvando={salvando}
          startSalvando={startSalvando}
          onErro={setErroAg}
          onFeito={() => { setModo('lista'); setErroAg(null); router.refresh() }}
        />
      )}
      {modo === 'novo_evento' && (
        <FormNovoEvento
          dados={dados}
          salvando={salvando}
          startSalvando={startSalvando}
          onErro={setErroAg}
          onFeito={() => { setModo('lista'); setErroAg(null); router.refresh() }}
        />
      )}
      {erroAg && (
        <p className="text-[10px] text-coral text-center mb-2">⚠️ {erroAg}</p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {dados.eventos.length === 0 && dados.tarefas.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-8">
            Nenhum compromisso ou tarefa vinculado.<br />
            <span className="text-[10px] text-white/30">Cria um acima ou pede pra Bianca.</span>
          </p>
        ) : (
          <>
            {dados.eventos.map((e: any) => (
              <ItemAgenda
                key={e.id}
                tipo="evento"
                item={e}
                startSalvando={startSalvando}
                onErro={setErroAg}
                onFeito={() => router.refresh()}
              />
            ))}
            {dados.tarefas.map((t: any) => (
              <ItemAgenda
                key={t.id}
                tipo="tarefa"
                item={t}
                startSalvando={startSalvando}
                onErro={setErroAg}
                onFeito={() => router.refresh()}
              />
            ))}
          </>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-white/5 text-right flex-shrink-0">
        <Link href="/agenda" className="text-[10px] text-sol hover:underline">
          Abrir agenda completa →
        </Link>
      </div>
    </div>
  )
}

/**
 * Item da agenda (evento ou tarefa) com botões ✓ concluir e 🗑 excluir.
 * Kalebe 2026-09-17: Bianca gere esse espaço — ao criar com responsável
 * diferente, criarEventoAction/criarTarefaAction já disparam
 * notificarPar → dispararGatilho, que a Bianca conecta em WhatsApp.
 */
function ItemAgenda({ tipo, item, startSalvando, onErro, onFeito }: {
  tipo: 'evento' | 'tarefa'
  item: any
  startSalvando: React.TransitionStartFunction
  onErro: (e: string | null) => void
  onFeito: () => void
}) {
  const concluida = tipo === 'tarefa'
    ? item.status === 'concluida'
    : item.status === 'concluido' || item.status === 'realizado'

  function marcarConcluida() {
    onErro(null)
    startSalvando(async () => {
      const r = tipo === 'tarefa'
        ? await mudarStatusTarefaAction(item.id, 'concluida')
        : await mudarStatusEventoAction(item.id, 'realizado')
      if ('erro' in r) { onErro(r.erro || 'Erro ao concluir'); return }
      onFeito()
    })
  }

  function excluir() {
    if (!confirm(`Excluir ${tipo === 'tarefa' ? 'a tarefa' : 'o compromisso'} "${item.titulo}"? Não dá pra desfazer.`)) return
    onErro(null)
    startSalvando(async () => {
      const r = tipo === 'tarefa'
        ? await excluirTarefaAction(item.id)
        : await excluirEventoAction(item.id)
      if ('erro' in r) { onErro(r.erro || 'Erro ao excluir'); return }
      onFeito()
    })
  }

  const emoji = tipo === 'evento' ? '📌' : '✓'
  const iaFlag = tipo === 'evento' ? item.criado_por_bianca : item.criada_por_bianca

  return (
    <div className={`group bg-noite/40 border border-white/5 rounded p-2 ${concluida ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs flex items-center gap-1 flex-1 ${
          concluida ? 'line-through text-white/40' : 'text-white font-bold'
        }`}>
          <span className="text-[10px]">{emoji}</span>
          {item.titulo}
          {iaFlag && <span className="text-[8px] text-sol">🤖</span>}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-white/40 whitespace-nowrap">
            {tipo === 'evento'
              ? fmtHora(item.data_hora_inicio)
              : item.data_prazo ? `até ${fmtDataCurta(item.data_prazo + 'T12:00:00-03:00')}` : ''}
          </span>
          {!concluida && (
            <button
              type="button"
              onClick={marcarConcluida}
              title="Marcar concluída"
              className="opacity-0 group-hover:opacity-100 transition w-5 h-5 flex items-center justify-center text-verde hover:bg-verde/20 rounded text-[10px]"
            >
              ✓
            </button>
          )}
          <button
            type="button"
            onClick={excluir}
            title="Excluir"
            className="opacity-0 group-hover:opacity-100 transition w-5 h-5 flex items-center justify-center text-coral hover:bg-coral/20 rounded text-[10px]"
          >
            🗑
          </button>
        </div>
      </div>
      {tipo === 'evento' && item.local && (
        <p className="text-[10px] text-white/50 mt-0.5">📍 {item.local}</p>
      )}
      {tipo === 'tarefa' && item.prioridade && item.prioridade !== 'media' && !concluida && (
        <p className="text-[9px] uppercase font-bold mt-0.5">
          <span className={
            item.prioridade === 'urgente' ? 'text-coral' :
            item.prioridade === 'alta' ? 'text-sol' : 'text-white/40'
          }>
            {item.prioridade}
          </span>
        </p>
      )}
    </div>
  )
}

function FormNovaTarefa({
  dados, salvando, startSalvando, onErro, onFeito,
}: {
  dados: DadosRelacionamento
  salvando: boolean
  startSalvando: React.TransitionStartFunction
  onErro: (e: string | null) => void
  onFeito: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta' | 'urgente'>('media')
  const [responsavelId, setResponsavelId] = useState(dados.usuarioId)

  function salvar() {
    const t = titulo.trim()
    if (!t) return
    onErro(null)
    startSalvando(async () => {
      const r = await criarTarefaAction({
        titulo: t,
        data_prazo: prazo || null,
        prioridade,
        dono_usuario_id: responsavelId || dados.usuarioId,
        projeto_id: dados.projetoId,
      })
      if ('erro' in r) { onErro(r.erro || 'Erro ao criar tarefa'); return }
      onFeito()
    })
  }

  return (
    <div className="mb-3 p-3 bg-sol/5 border border-sol/30 rounded-lg space-y-2">
      <input
        type="text"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título da tarefa (ex: Follow-up com o cliente)"
        autoFocus
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white placeholder-white/40 focus:outline-none focus:border-sol"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white focus:outline-none focus:border-sol"
        />
        <select
          value={prioridade}
          onChange={(e) => setPrioridade(e.target.value as any)}
          className="px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white focus:outline-none focus:border-sol"
        >
          <option value="baixa" className="bg-noite">Baixa</option>
          <option value="media" className="bg-noite">Média</option>
          <option value="alta" className="bg-noite">Alta</option>
          <option value="urgente" className="bg-noite">Urgente</option>
        </select>
      </div>
      <SelectResponsavel
        responsaveis={dados.responsaveis}
        valor={responsavelId}
        onChange={setResponsavelId}
        usuarioAtual={dados.usuarioId}
      />
      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !titulo.trim()}
        className="w-full px-3 py-1.5 bg-sol text-noite font-bold text-xs rounded hover:bg-sol/90 disabled:opacity-40 transition"
      >
        {salvando ? 'Criando...' : '✓ Criar tarefa'}
      </button>
    </div>
  )
}

function SelectResponsavel({ responsaveis, valor, onChange, usuarioAtual }: {
  responsaveis: Responsavel[]
  valor: string
  onChange: (id: string) => void
  usuarioAtual: string
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] uppercase font-bold text-white/50">
        Responsável:
      </label>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white focus:outline-none focus:border-sol"
      >
        <option value={usuarioAtual} className="bg-noite">Eu mesmo</option>
        {responsaveis
          .filter((r) => r.id !== usuarioAtual)
          .map((r) => (
            <option key={r.id} value={r.id} className="bg-noite">
              {r.nome} · {r.role}
            </option>
          ))}
      </select>
    </div>
  )
}

function FormNovoEvento({
  dados, salvando, startSalvando, onErro, onFeito,
}: {
  dados: DadosRelacionamento
  salvando: boolean
  startSalvando: React.TransitionStartFunction
  onErro: (e: string | null) => void
  onFeito: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [quando, setQuando] = useState('')
  const [local, setLocal] = useState('')
  const [tipo, setTipo] = useState<'reuniao' | 'visita_tecnica' | 'ligacao' | 'outro'>('reuniao')
  const [responsavelId, setResponsavelId] = useState(dados.usuarioId)

  function salvar() {
    const t = titulo.trim()
    if (!t || !quando) { onErro('Título e data/hora são obrigatórios'); return }
    onErro(null)
    startSalvando(async () => {
      const r = await criarEventoAction({
        titulo: t,
        tipo,
        data_hora_inicio: new Date(quando).toISOString(),
        local: local.trim() || null,
        dono_usuario_id: responsavelId || dados.usuarioId,
        projeto_id: dados.projetoId,
      })
      if ('erro' in r) { onErro(r.erro || 'Erro ao criar compromisso'); return }
      onFeito()
    })
  }

  return (
    <div className="mb-3 p-3 bg-sol/5 border border-sol/30 rounded-lg space-y-2">
      <input
        type="text"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título do compromisso (ex: Reunião de proposta)"
        autoFocus
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white placeholder-white/40 focus:outline-none focus:border-sol"
      />
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white focus:outline-none focus:border-sol"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as any)}
          className="px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white focus:outline-none focus:border-sol"
        >
          <option value="reuniao" className="bg-noite">Reunião</option>
          <option value="visita_tecnica" className="bg-noite">Visita técnica</option>
          <option value="ligacao" className="bg-noite">Ligação</option>
          <option value="outro" className="bg-noite">Outro</option>
        </select>
      </div>
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Local (opcional)"
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-xs text-white placeholder-white/40 focus:outline-none focus:border-sol"
      />
      <SelectResponsavel
        responsaveis={dados.responsaveis}
        valor={responsavelId}
        onChange={setResponsavelId}
        usuarioAtual={dados.usuarioId}
      />
      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !titulo.trim() || !quando}
        className="w-full px-3 py-1.5 bg-sol text-noite font-bold text-xs rounded hover:bg-sol/90 disabled:opacity-40 transition"
      >
        {salvando ? 'Criando...' : '✓ Criar compromisso'}
      </button>
    </div>
  )
}
