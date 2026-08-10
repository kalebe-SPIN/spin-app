'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  mudarStatusEventoAction,
  editarEventoAction,
  excluirEventoAction,
  type TipoEvento,
} from '@/app/agenda/actions'

const TIPOS: { chave: TipoEvento; label: string; emoji: string }[] = [
  { chave: 'reuniao', label: 'Reunião', emoji: '💼' },
  { chave: 'visita_tecnica', label: 'Visita técnica', emoji: '🔧' },
  { chave: 'instalacao', label: 'Instalação', emoji: '⚡' },
  { chave: 'cliente', label: 'Cliente', emoji: '👤' },
  { chave: 'ligacao', label: 'Ligação', emoji: '📞' },
  { chave: 'outro', label: 'Outro', emoji: '📌' },
]

export type EventoResumo = {
  id: string
  titulo: string
  data_hora_inicio: string
  data_hora_fim: string | null
  tipo: string
  status: string
  local: string | null
  cor: string | null
  usuario_id: string
  dono_nome: string | null
}

export function EventoPopover({
  evento,
  souDono,
  onFechar,
  onMudou,
}: {
  evento: EventoResumo
  souDono: boolean
  onFechar: () => void
  onMudou: () => void
}) {
  const [modo, setModo] = useState<'ver' | 'editar'>('ver')
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar()
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [onFechar])

  function comAcao(fn: () => Promise<any>) {
    setErro(null)
    startTransition(async () => {
      const r = await fn()
      if (r?.erro) { setErro(r.erro); return }
      onMudou()
      onFechar()
    })
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 w-80 bg-noite border border-sol/30 rounded-xl shadow-2xl shadow-black/50 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      {modo === 'ver' && <VistaVer evento={evento} souDono={souDono} setModo={setModo} comAcao={comAcao} isPending={isPending} />}
      {modo === 'editar' && <VistaEditar evento={evento} setModo={setModo} comAcao={comAcao} isPending={isPending} />}
      {erro && <p className="mt-2 text-xs text-coral">{erro}</p>}
    </div>
  )
}

function VistaVer({ evento, souDono, setModo, comAcao, isPending }: {
  evento: EventoResumo
  souDono: boolean
  setModo: (m: 'ver' | 'editar') => void
  comAcao: (fn: () => Promise<any>) => void
  isPending: boolean
}) {
  const hora = new Date(evento.data_hora_inicio).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-white font-bold leading-tight">{evento.titulo}</p>
          <p className="text-xs text-white/50 mt-0.5">{hora}</p>
          {evento.local && <p className="text-xs text-white/40 mt-0.5">📍 {evento.local}</p>}
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-white/70">
          {evento.status}
        </span>
      </div>

      {!souDono && evento.dono_nome && (
        <p className="text-[11px] text-weg-azul mb-3">👥 Agenda de <strong>{evento.dono_nome}</strong></p>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          disabled={isPending || evento.status === 'confirmado'}
          onClick={() => comAcao(() => mudarStatusEventoAction(evento.id, 'confirmado'))}
          className="px-3 py-2 bg-verde/15 border border-verde/30 text-verde text-xs font-bold rounded-lg hover:bg-verde/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✓ Confirmar
        </button>
        <button
          disabled={isPending || evento.status === 'realizado'}
          onClick={() => comAcao(() => mudarStatusEventoAction(evento.id, 'realizado'))}
          className="px-3 py-2 bg-sol/15 border border-sol/30 text-sol text-xs font-bold rounded-lg hover:bg-sol/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✅ Realizado
        </button>
        <button
          disabled={isPending}
          onClick={() => setModo('editar')}
          className="px-3 py-2 bg-white/5 border border-white/15 text-white text-xs font-bold rounded-lg hover:bg-white/10 disabled:opacity-40"
        >
          ✏ Editar
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            if (confirm(`Excluir "${evento.titulo}"?`)) comAcao(() => excluirEventoAction(evento.id))
          }}
          className="px-3 py-2 bg-coral/10 border border-coral/25 text-coral text-xs font-bold rounded-lg hover:bg-coral/20 disabled:opacity-40"
        >
          🗑 Excluir
        </button>
      </div>
    </>
  )
}

function VistaEditar({ evento, setModo, comAcao, isPending }: {
  evento: EventoResumo
  setModo: (m: 'ver' | 'editar') => void
  comAcao: (fn: () => Promise<any>) => void
  isPending: boolean
}) {
  const [titulo, setTitulo] = useState(evento.titulo)
  const [tipo, setTipo] = useState(evento.tipo as TipoEvento)
  const [local, setLocal] = useState(evento.local || '')
  const [inicio, setInicio] = useState(toLocalInput(evento.data_hora_inicio))

  return (
    <div className="space-y-2">
      <button onClick={() => setModo('ver')} className="text-[11px] text-white/40 hover:text-white/70">← Voltar</button>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título"
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
      />
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value as TipoEvento)}
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
      >
        {TIPOS.map((t) => (
          <option key={t.chave} value={t.chave} className="bg-noite">{t.emoji} {t.label}</option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={inicio}
        onChange={(e) => setInicio(e.target.value)}
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
      />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Local (opcional)"
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
      />
      <button
        disabled={isPending || !titulo.trim() || !inicio}
        onClick={() => comAcao(() => editarEventoAction(evento.id, {
          titulo: titulo.trim(),
          tipo,
          local: local.trim() || null,
          data_hora_inicio: new Date(inicio).toISOString(),
        }))}
        className="w-full mt-1 px-3 py-2 bg-sol/20 border border-sol/40 text-sol text-xs font-bold rounded-lg hover:bg-sol/30 disabled:opacity-40"
      >
        Salvar alterações
      </button>
    </div>
  )
}

function toLocalInput(iso: string) {
  const d = new Date(iso)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}
