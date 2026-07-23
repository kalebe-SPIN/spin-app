'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  descartarSugestaoAction,
  marcarSugestaoEnviadaAction,
} from '@/app/bianca/sugestoes/actions'

type Props = {
  sugestao: any
  gatilhoInfo: { emoji: string; label: string; cor: string }
}

export function SugestoesBiancaClient({ sugestao, gatilhoInfo }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'enviando' | 'enviado' | 'erro'>('idle')
  const [erro, setErro] = useState<string | null>(null)

  const projeto = Array.isArray(sugestao.projeto) ? sugestao.projeto[0] : sugestao.projeto

  const corClasses: Record<string, string> = {
    verde: 'border-verde/30 bg-verde/5',
    sol: 'border-sol/30 bg-sol/5',
    coral: 'border-coral/30 bg-coral/5',
    'weg-azul': 'border-weg-azul/30 bg-weg-azul/5',
  }
  const corBadge: Record<string, string> = {
    verde: 'text-verde bg-verde/10 border-verde/30',
    sol: 'text-sol bg-sol/10 border-sol/30',
    coral: 'text-coral bg-coral/10 border-coral/30',
    'weg-azul': 'text-weg-azul bg-weg-azul/10 border-weg-azul/30',
  }

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
          setErro('Meta API não configurada. Use "Abrir WhatsApp Web" abaixo.')
        } else if (json.error_code === 'fora_janela_24h') {
          setErro('Cliente não interagiu em 24h — precisa template Meta pré-aprovado.')
        } else {
          setErro(json.error || 'Erro ao enviar')
        }
        setStatus('erro')
        return
      }
      setStatus('enviado')
      setTimeout(() => router.refresh(), 800)
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede')
      setStatus('erro')
    }
  }

  function marcarEnviadoManual() {
    startTransition(async () => {
      const res = await marcarSugestaoEnviadaAction(sugestao.id)
      if ('erro' in res && res.erro) setErro(res.erro)
      else router.refresh()
    })
  }

  function descartar() {
    if (!confirm('Descartar essa sugestão?')) return
    startTransition(async () => {
      const res = await descartarSugestaoAction(sugestao.id)
      if ('erro' in res && res.erro) setErro(res.erro)
      else router.refresh()
    })
  }

  const criadaHa = tempoRelativo(sugestao.criado_em)

  return (
    <div className={`p-4 rounded-xl border ${corClasses[gatilhoInfo.cor] || corClasses.sol}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">{gatilhoInfo.emoji}</span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${corBadge[gatilhoInfo.cor] || corBadge.sol}`}>
            {gatilhoInfo.label}
          </span>
          <span className="text-[10px] text-white/40">{criadaHa}</span>
        </div>
        {projeto && (
          <Link
            href={`/projetos/${sugestao.projeto_id}`}
            className="text-[10px] font-mono text-white/50 hover:text-white/80 truncate max-w-[200px]"
          >
            {projeto.codigo} · {projeto.cliente_razao_social}
          </Link>
        )}
      </div>

      {/* Destinatário */}
      <div className="text-xs text-white/60 mb-2">
        Para: <strong className="text-white">{sugestao.destinatario_nome}</strong>
        {sugestao.destinatario_telefone && (
          <> · <span className="font-mono">{sugestao.destinatario_telefone}</span></>
        )}
      </div>

      {/* Mensagem */}
      <div className="bg-noite/40 border border-white/10 rounded-lg p-3 mb-3 text-sm text-white whitespace-pre-wrap break-words">
        {sugestao.mensagem}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 flex-wrap">
        {status === 'enviado' ? (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-verde/20 border border-verde/40 text-verde text-xs font-bold rounded">
            ✓ Enviado via Bianca
          </span>
        ) : (
          <>
            {sugestao.canal === 'whatsapp' && (
              <>
                <button
                  onClick={enviarDireto}
                  disabled={status === 'enviando' || pending}
                  className="px-3 py-1.5 bg-verde text-noite text-xs font-bold rounded hover:bg-verde/90 disabled:opacity-40"
                >
                  {status === 'enviando' ? '⏳ Enviando...' : '🚀 Enviar direto'}
                </button>
                {sugestao.link_wa && (
                  <a
                    href={sugestao.link_wa}
                    target="_blank"
                    rel="noreferrer"
                    onClick={marcarEnviadoManual}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 text-white text-xs font-bold rounded hover:bg-white/15"
                  >
                    📱 Abrir WhatsApp Web
                  </a>
                )}
              </>
            )}
            <button
              onClick={descartar}
              disabled={pending}
              className="px-3 py-1.5 bg-coral/10 border border-coral/30 text-coral text-xs rounded hover:bg-coral/20"
            >
              ✕ Descartar
            </button>
          </>
        )}
      </div>

      {erro && (
        <p className="text-[10px] text-coral mt-2">⚠️ {erro}</p>
      )}
    </div>
  )
}

function tempoRelativo(iso: string): string {
  const agora = Date.now()
  const t = new Date(iso).getTime()
  const min = Math.floor((agora - t) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}
