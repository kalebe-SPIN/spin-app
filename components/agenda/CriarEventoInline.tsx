'use client'

import { useState, useTransition } from 'react'
import { criarEventoAction, type TipoEvento } from '@/app/agenda/actions'

const TIPOS: { chave: TipoEvento; label: string; emoji: string }[] = [
  { chave: 'reuniao', label: 'Reunião', emoji: '💼' },
  { chave: 'visita_tecnica', label: 'Visita técnica', emoji: '🔧' },
  { chave: 'instalacao', label: 'Instalação', emoji: '⚡' },
  { chave: 'cliente', label: 'Cliente', emoji: '👤' },
  { chave: 'ligacao', label: 'Ligação', emoji: '📞' },
  { chave: 'outro', label: 'Outro', emoji: '📌' },
]

export function CriarEventoInline({
  dataHoraInicio,
  donoId,
  donoNome,
  paraOutro,
  onFechar,
  onCriado,
}: {
  dataHoraInicio: Date
  donoId: string
  donoNome: string
  paraOutro: boolean
  onFechar: () => void
  onCriado: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoEvento>('reuniao')
  const [local, setLocal] = useState('')
  const [duracao, setDuracao] = useState(60)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    if (!titulo.trim()) return
    setErro(null)
    startTransition(async () => {
      const fim = new Date(dataHoraInicio)
      fim.setMinutes(fim.getMinutes() + duracao)
      const r = await criarEventoAction({
        titulo: titulo.trim(),
        tipo,
        local: local.trim() || null,
        data_hora_inicio: dataHoraInicio.toISOString(),
        data_hora_fim: fim.toISOString(),
        dono_usuario_id: donoId,
      })
      if (r?.erro) { setErro(r.erro); return }
      onCriado()
    })
  }

  const quando = dataHoraInicio.toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-white font-bold text-sm">Novo evento</p>
        <button onClick={onFechar} className="text-white/40 hover:text-white text-lg leading-none">×</button>
      </div>
      <p className="text-xs text-white/50">📅 {quando}</p>
      {paraOutro && (
        <p className="text-[11px] text-weg-azul bg-weg-azul/10 border border-weg-azul/25 rounded px-2 py-1">
          👥 Você está agendando na agenda de <strong>{donoNome}</strong>. A Bianca vai avisar quando salvar.
        </p>
      )}
      <input
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="O que é? (obrigatório)"
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoEvento)}
          className="px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
        >
          {TIPOS.map((t) => (
            <option key={t.chave} value={t.chave} className="bg-noite">{t.emoji} {t.label}</option>
          ))}
        </select>
        <select
          value={duracao}
          onChange={(e) => setDuracao(Number(e.target.value))}
          className="px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
        >
          <option value={30} className="bg-noite">30 min</option>
          <option value={60} className="bg-noite">1 hora</option>
          <option value={90} className="bg-noite">1h30</option>
          <option value={120} className="bg-noite">2 horas</option>
          <option value={240} className="bg-noite">4 horas</option>
          <option value={480} className="bg-noite">Dia inteiro</option>
        </select>
      </div>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Local (opcional)"
        className="w-full px-2 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
      />
      {erro && <p className="text-xs text-coral">{erro}</p>}
      <button
        disabled={isPending || !titulo.trim()}
        onClick={salvar}
        className="w-full px-3 py-2 bg-sol/20 border border-sol/40 text-sol text-xs font-bold rounded-lg hover:bg-sol/30 disabled:opacity-40"
      >
        {isPending ? 'Salvando...' : 'Criar evento'}
      </button>
    </div>
  )
}
