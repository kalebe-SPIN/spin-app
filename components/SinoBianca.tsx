'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  descartarSugestaoAction,
  marcarSugestaoEnviadaAction,
} from '@/app/bianca/sugestoes/actions'
import { HORAS_STANDBY, type Atendimento } from '@/lib/bianca/atendimentos'

const GATILHO_LABEL: Record<string, { emoji: string; label: string; cor: string }> = {
  proposta_aceita:              { emoji: '🎉', label: 'Proposta aceita',            cor: 'verde' },
  proposta_followup_3d:         { emoji: '⏰', label: 'Follow-up 3 dias',           cor: 'sol' },
  homologacao_aprovada:         { emoji: '✅', label: 'Homologação aprovada',       cor: 'verde' },
  cliente_respondeu_whatsapp:   { emoji: '💬', label: 'Cliente respondeu',          cor: 'weg-azul' },
  modulo_pendente_7d:           { emoji: '📦', label: 'Módulo há 7 dias sem preço', cor: 'sol' },
  instalacao_amanha:            { emoji: '🔧', label: 'Instalação amanhã',          cor: 'coral' },
}

const corBadge: Record<string, string> = {
  verde: 'text-verde bg-verde/10 border-verde/30',
  sol: 'text-sol bg-sol/10 border-sol/30',
  coral: 'text-coral bg-coral/10 border-coral/30',
  'weg-azul': 'text-weg-azul bg-weg-azul/10 border-weg-azul/30',
}

/**
 * Sino da Bianca no header — abre popover em vez de trocar de pagina.
 * Kalebe 2026-10-06: o sino é SÓ de atendimento — cliente esperando
 * resposta ou conversa em standby (sem resposta do cliente há +48h). Os
 * demais recados aparecem no card do cliente e na Central da Bianca.
 */
export function SinoBianca({ contadorInicial = 0, recados = 0 }: { contadorInicial?: number; recados?: number }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<Atendimento[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [contador, setContador] = useState(contadorInicial)
  const [ocupado, setOcupado] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)

  // AutoRefresh (60s) re-renderiza o header com contagem nova
  useEffect(() => {
    if (!aberto) setContador(contadorInicial)
  }, [contadorInicial, aberto])

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return
    function onClickFora(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        botaoRef.current && !botaoRef.current.contains(e.target as Node)
      ) setAberto(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', onClickFora)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickFora)
      document.removeEventListener('keydown', onEsc)
    }
  }, [aberto])

  async function carregar() {
    setCarregando(true)
    try {
      const res = await fetch('/api/atendimentos', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      const itens: Atendimento[] = res.ok ? (json.atendimentos || []) : []
      setLista(itens)
      setAviso(json.aviso || null)
      setContador(itens.length)
      if (itens.length !== contadorInicial) router.refresh()
    } catch {}
    finally { setCarregando(false) }
  }

  async function dispensar(ids: string[]) {
    if (!ids.length) return
    setOcupado(true)
    try {
      await fetch('/api/atendimentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      await carregar()
    } finally { setOcupado(false) }
  }

  function toggle() {
    if (!aberto) carregar()
    setAberto(!aberto)
  }

  const esperando = lista.filter((a) => a.situacao !== 'standby')
  const standby = lista.filter((a) => a.situacao === 'standby')

  return (
    <div className="relative">
      <button
        ref={botaoRef}
        onClick={toggle}
        className={`relative flex items-center gap-1.5 px-2 xl:px-3 py-1.5 border rounded-lg text-xs font-bold transition shrink-0 ${
          aberto
            ? 'bg-sol/25 border-sol/50 text-sol'
            : contador > 0 ? 'bg-sol/10 border-sol/30 text-sol hover:bg-sol/20' : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white'
        }`}
        title={contador > 0 ? `${contador} atendimento(s) pedindo atenção` : 'Nenhum cliente esperando'}
      >
        <span className="text-base">🔔</span>
        {/* Kalebe 2026-09-30: nome só em tela larga — header não pode estourar */}
        <span className="hidden 2xl:inline">Bianca</span>
        {contador > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-sol text-noite text-[10px] flex items-center justify-center font-black">
            {contador}
          </span>
        )}
      </button>

      {aberto && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-[420px] max-w-[95vw] bg-noite border border-white/15 rounded-xl shadow-2xl z-50 max-h-[75vh] overflow-hidden flex flex-col"
        >
          <div className="p-3 border-b border-white/10 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-white">🔔 Atendimentos</p>
              <p className="text-[10px] text-white/50">{contador} conversa(s) pedindo atenção</p>
            </div>
            <div className="flex items-center gap-1">
              {lista.length > 0 && (
                <button
                  onClick={() => dispensar(lista.map((a) => a.conversa_id))}
                  disabled={ocupado}
                  className="px-2 py-1 text-[10px] font-bold rounded border border-white/15 text-white/70 hover:text-white disabled:opacity-40"
                  title="Tira todas do sino até o cliente escrever de novo"
                >
                  ✓ Marcar todas como vistas
                </button>
              )}
              <button onClick={() => setAberto(false)} className="text-white/40 hover:text-white text-lg leading-none px-2" title="Fechar">✕</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {carregando && !lista.length ? (
              <p className="text-xs text-white/50 text-center py-4">⏳ Carregando...</p>
            ) : aviso ? (
              <p className="text-xs text-sol text-center py-4">{aviso}</p>
            ) : lista.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-xs text-white/70 font-bold mb-1">Nenhum cliente esperando</p>
                <p className="text-[10px] text-white/40">Conversas respondidas e sem pendência de retorno.</p>
              </div>
            ) : (
              <>
                {esperando.length > 0 && (
                  <GrupoAtendimentos titulo="💬 Esperando resposta" lista={esperando} ocupado={ocupado} onDispensar={dispensar} onAbrir={() => setAberto(false)} />
                )}
                {standby.length > 0 && (
                  <GrupoAtendimentos titulo={`⏸ Em standby — cliente sem responder há +${HORAS_STANDBY}h`} lista={standby} ocupado={ocupado} onDispensar={dispensar} onAbrir={() => setAberto(false)} />
                )}
              </>
            )}
          </div>

          <div className="p-2 border-t border-white/10 bg-white/[0.02]">
            <Link
              href="/bianca/sugestoes"
              onClick={() => setAberto(false)}
              className="block text-center text-[11px] text-sol hover:text-sol/80 font-bold py-1"
            >
              Central da Bianca — recados e sugestões{recados > 0 ? ` (${recados})` : ''} →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function GrupoAtendimentos({ titulo, lista, ocupado, onDispensar, onAbrir }: {
  titulo: string; lista: Atendimento[]; ocupado: boolean
  onDispensar: (ids: string[]) => void; onAbrir: () => void
}) {
  return (
    <section className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider font-bold text-white/45 px-1">{titulo} ({lista.length})</p>
      {lista.map((a) => (
        <div key={a.conversa_id} className={`border rounded-lg p-2.5 ${a.situacao === 'standby' ? 'bg-white/[0.03] border-white/10' : 'bg-weg-azul/10 border-weg-azul/30'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs font-bold text-white truncate">{a.contato_nome || a.telefone || 'Contato'}</p>
            {a.situacao === 'sem_responsavel' && (
              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border text-coral bg-coral/10 border-coral/30">sem responsável</span>
            )}
            <span className="text-[9px] text-white/40 ml-auto shrink-0">{a.situacao === 'standby' ? 'parada há ' : 'há '}{tempoRel(a.desde)}</span>
          </div>
          {a.previa && (
            <p className="text-[11px] text-white/65 line-clamp-2 mb-2">
              {a.situacao === 'standby' ? 'Última nossa: ' : ''}{a.previa}
            </p>
          )}
          <div className="flex items-center gap-1">
            <Link
              href={`/spinzap?c=${a.conversa_id}`}
              onClick={onAbrir}
              className="flex-1 text-center px-2 py-1 bg-verde text-noite text-[10px] font-bold rounded hover:bg-verde/90"
            >
              💬 {a.situacao === 'standby' ? 'Retomar conversa' : 'Responder'}
            </Link>
            {a.projeto_id && (
              <Link href={`/projetos/${a.projeto_id}`} onClick={onAbrir}
                className="px-2 py-1 bg-white/10 border border-white/20 text-white text-[10px] font-bold rounded hover:bg-white/15">
                📁 Projeto
              </Link>
            )}
            <button
              onClick={() => onDispensar([a.conversa_id])}
              disabled={ocupado}
              className="px-2 py-1 bg-white/5 border border-white/15 text-white/60 text-[10px] rounded hover:text-white disabled:opacity-40"
              title="Tira do sino até o cliente escrever de novo"
            >
              Dispensar
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

/** Sugestão de mensagem preparada pela Bianca (bianca_comunicacoes). */
export function MiniCard({ sugestao, onAcao }: { sugestao: any; onAcao: () => Promise<void> }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'enviando' | 'enviado' | 'erro'>('idle')
  const [erro, setErro] = useState<string | null>(null)
  const [expandido, setExpandido] = useState(false)

  const info = GATILHO_LABEL[sugestao.gatilho_chave] || {
    emoji: '💬',
    label: sugestao.gatilho_chave || 'Bianca',
    cor: 'sol',
  }
  const projeto = Array.isArray(sugestao.projeto) ? sugestao.projeto[0] : sugestao.projeto

  async function enviarDireto() {
    setStatus('enviando')
    setErro(null)
    try {
      const res = await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comunicacao_id: sugestao.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.error_code === 'integration_missing') {
          setErro('Meta API não configurada. Use "Abrir WhatsApp Web".')
        } else if (json.error_code === 'fora_janela_24h') {
          setErro('Fora da janela 24h — precisa template.')
        } else setErro(json.error || 'Erro ao enviar')
        setStatus('erro')
        return
      }
      setStatus('enviado')
      setTimeout(() => onAcao(), 800)
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede')
      setStatus('erro')
    }
  }

  function marcarEnviadoManual() {
    startTransition(async () => {
      await marcarSugestaoEnviadaAction(sugestao.id)
      await onAcao()
    })
  }

  function descartar() {
    startTransition(async () => {
      await descartarSugestaoAction(sugestao.id)
      await onAcao()
    })
  }

  const criadaHa = tempoRel(sugestao.criado_em)

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="text-sm">{info.emoji}</span>
        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${corBadge[info.cor] || corBadge.sol}`}>
          {info.label}
        </span>
        <span className="text-[9px] text-white/40 ml-auto">{criadaHa}</span>
      </div>

      {projeto && (
        <p className="text-[10px] text-white/50 mb-1 truncate">
          {projeto.codigo} · {projeto.cliente_razao_social}
        </p>
      )}
      <p className="text-[10px] text-white/60 mb-1.5">
        Para: <strong className="text-white/80">{sugestao.destinatario_nome}</strong>
      </p>

      <div className={`text-xs text-white bg-noite/60 border border-white/10 rounded p-2 mb-2 ${
        expandido ? '' : 'line-clamp-3'
      }`}>
        {sugestao.mensagem}
      </div>
      {sugestao.mensagem.length > 140 && (
        <button
          onClick={() => setExpandido(!expandido)}
          className="text-[10px] text-white/50 hover:text-white/80 mb-2"
        >
          {expandido ? '▲ recolher' : '▼ ver mensagem completa'}
        </button>
      )}

      {status === 'enviado' ? (
        <p className="text-[10px] text-verde text-center py-1">✓ Enviado via Bianca</p>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          {sugestao.canal === 'whatsapp' && (
            <>
              <button
                onClick={enviarDireto}
                disabled={status === 'enviando' || pending}
                className="flex-1 px-2 py-1 bg-verde text-noite text-[10px] font-bold rounded hover:bg-verde/90 disabled:opacity-40"
              >
                {status === 'enviando' ? '⏳' : '🚀 Enviar'}
              </button>
              {sugestao.link_wa && (
                <a
                  href={sugestao.link_wa}
                  target="_blank"
                  rel="noreferrer"
                  onClick={marcarEnviadoManual}
                  className="px-2 py-1 bg-white/10 border border-white/20 text-white text-[10px] font-bold rounded hover:bg-white/15"
                  title="Abrir WhatsApp Web"
                >
                  📱
                </a>
              )}
            </>
          )}
          <button
            onClick={descartar}
            disabled={pending}
            className="px-2 py-1 bg-coral/10 border border-coral/30 text-coral text-[10px] rounded hover:bg-coral/20"
            title="Descartar"
          >
            ✕
          </button>
        </div>
      )}
      {erro && <p className="text-[9px] text-coral mt-1">⚠️ {erro}</p>}
    </div>
  )
}

const NOME_AGENTE_AVISO: Record<string, string> = {
  bianca: 'Bianca',
  davi: 'Davi',
  qualificacao: 'Laís',
}

/** Aviso interno enviado por um agente (avisos_internos). */
export function AvisoCard({ aviso, onAcao, mostrarProjeto = true, mostrarConversa = true }: {
  aviso: any; onAcao: () => Promise<void>; mostrarProjeto?: boolean; mostrarConversa?: boolean
}) {
  const [pending, setPending] = useState(false)
  const projeto = Array.isArray(aviso.projeto) ? aviso.projeto[0] : aviso.projeto

  async function acao(metodo: 'POST' | 'DELETE') {
    setPending(true)
    try {
      await fetch('/api/avisos', {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aviso.id }),
      })
    } finally {
      await onAcao()
      setPending(false)
    }
  }

  return (
    <div className={`border rounded-lg p-2.5 ${
      aviso.urgente ? 'bg-coral/10 border-coral/40' : 'bg-weg-azul/10 border-weg-azul/30'
    }`}>
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="text-sm">📣</span>
        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border text-weg-azul bg-weg-azul/10 border-weg-azul/30">
          Aviso · {NOME_AGENTE_AVISO[aviso.remetente_agente] || aviso.remetente_agente}
        </span>
        {aviso.urgente && (
          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border text-coral bg-coral/10 border-coral/30">
            Urgente
          </span>
        )}
        <span className="text-[9px] text-white/40 ml-auto">{tempoRel(aviso.criado_em)}</span>
      </div>
      {aviso.titulo && <p className="text-xs font-bold text-white mb-1">{aviso.titulo}</p>}
      {mostrarProjeto && projeto && (
        <Link
          href={`/projetos/${aviso.projeto_id}`}
          className="text-[10px] text-sol hover:underline block mb-1 truncate"
        >
          {projeto.codigo} · {projeto.cliente_razao_social}
        </Link>
      )}
      <p className="text-xs text-white/85 whitespace-pre-wrap mb-2">{aviso.mensagem}</p>
      <div className="flex items-center gap-1">
        {mostrarConversa && aviso.conversa_id && (
          <Link
            href={`/spinzap?c=${aviso.conversa_id}`}
            className="px-2 py-1 bg-white/10 border border-white/20 text-white text-[10px] font-bold rounded hover:bg-white/15"
          >
            💬 Abrir conversa
          </Link>
        )}
        <button
          onClick={() => acao('POST')}
          disabled={pending}
          className="flex-1 px-2 py-1 bg-verde text-noite text-[10px] font-bold rounded hover:bg-verde/90 disabled:opacity-40"
        >
          {pending ? '⏳' : '✓ Ciente'}
        </button>
        <button
          onClick={() => acao('DELETE')}
          disabled={pending}
          className="px-2 py-1 bg-coral/10 border border-coral/30 text-coral text-[10px] rounded hover:bg-coral/20 disabled:opacity-40"
          title="Excluir"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

export function tempoRel(iso: string): string {
  const agora = Date.now()
  const t = new Date(iso).getTime()
  const min = Math.floor((agora - t) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}
