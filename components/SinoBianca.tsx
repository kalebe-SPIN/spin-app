'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  descartarSugestaoAction,
  marcarSugestaoEnviadaAction,
} from '@/app/bianca/sugestoes/actions'

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
 * Kalebe: 'nao tem necessidade de mudar de pagina para ver e responder'.
 */
export function SinoBianca({ contadorInicial = 0 }: { contadorInicial?: number }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [sugestoes, setSugestoes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [contador, setContador] = useState(contadorInicial)
  const popoverRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)

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

  async function carregarSugestoes() {
    setCarregando(true)
    try {
      // no-store: evita cache do browser/proxy, sempre pega estado atual
      const res = await fetch('/api/bianca/sugestoes', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) {
        const lista = json.sugestoes || []
        setSugestoes(lista)
        setContador(lista.length)
        // Se contador do SSR estava desatualizado (ex: cache do Next), atualiza router
        if (lista.length !== contadorInicial) {
          router.refresh()
        }
      }
    } catch {}
    finally { setCarregando(false) }
  }

  function toggle() {
    if (!aberto) carregarSugestoes()
    setAberto(!aberto)
  }

  // Se o popover fica sem sugestoes, fecha automaticamente ao reabrir vazio
  useEffect(() => {
    if (aberto && !carregando && sugestoes.length === 0 && contadorInicial > 0) {
      // Contador SSR estava mentindo — nao ha nada. Fecha o popover apos breve delay pra usuario ver
      const t = setTimeout(() => setAberto(false), 1500)
      return () => clearTimeout(t)
    }
  }, [aberto, carregando, sugestoes.length, contadorInicial])

  // Nao renderiza nada se nao tem sugestoes (evita sino vazio)
  if (contador === 0 && !aberto) return null

  return (
    <div className="relative">
      <button
        ref={botaoRef}
        onClick={toggle}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition ${
          aberto
            ? 'bg-sol/25 border-sol/50 text-sol'
            : 'bg-sol/10 border-sol/30 text-sol hover:bg-sol/20'
        }`}
        title={`${contador} sugestão(ões) da Bianca aguardando`}
      >
        <span className="text-base">🔔</span>
        <span className="hidden sm:inline">Bianca</span>
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
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">💡 Sugestões da Bianca</p>
              <p className="text-[10px] text-white/50">{contador} pendente(s)</p>
            </div>
            <button
              onClick={() => setAberto(false)}
              className="text-white/40 hover:text-white text-lg leading-none px-2"
              title="Fechar"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {carregando ? (
              <p className="text-xs text-white/50 text-center py-4">⏳ Carregando...</p>
            ) : sugestoes.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-xs text-white/70 font-bold mb-1">Tudo em ordem!</p>
                <p className="text-[10px] text-white/40">
                  Sem sugestões pendentes. Fechando...
                </p>
              </div>
            ) : (
              sugestoes.map((s) => (
                <MiniCard
                  key={s.id}
                  sugestao={s}
                  onAcao={async () => {
                    await carregarSugestoes()
                    router.refresh()
                  }}
                />
              ))
            )}
          </div>

          <div className="p-2 border-t border-white/10 bg-white/[0.02]">
            <Link
              href="/bianca/sugestoes"
              onClick={() => setAberto(false)}
              className="block text-center text-[11px] text-sol hover:text-sol/80 font-bold py-1"
            >
              Ver página completa →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniCard({ sugestao, onAcao }: { sugestao: any; onAcao: () => Promise<void> }) {
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

function tempoRel(iso: string): string {
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
