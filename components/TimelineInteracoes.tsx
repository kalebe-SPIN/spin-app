'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarInteracaoAction } from '@/app/crm/clientes/actions'

const TIPOS_INTERACAO: { chave: string; emoji: string; label: string }[] = [
  { chave: 'ligacao', emoji: '📞', label: 'Ligação' },
  { chave: 'whatsapp', emoji: '💬', label: 'WhatsApp' },
  { chave: 'email', emoji: '📧', label: 'Email' },
  { chave: 'reuniao', emoji: '🤝', label: 'Reunião' },
  { chave: 'visita', emoji: '🚗', label: 'Visita' },
  { chave: 'proposta_enviada', emoji: '📄', label: 'Proposta' },
  { chave: 'nota', emoji: '📝', label: 'Nota' },
]

type Interacao = {
  id: string
  tipo: string
  descricao: string
  data_hora: string
  duracao_min: number | null
  usuario?: { nome_completo?: string } | null
}

export function TimelineInteracoes({
  clienteId,
  interacoes,
}: {
  clienteId: string
  interacoes: Interacao[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [tipo, setTipo] = useState('nota')
  const [descricao, setDescricao] = useState('')
  const [duracao, setDuracao] = useState<number | ''>('')

  function salvar() {
    if (!descricao.trim()) return
    startTransition(async () => {
      const resultado = await registrarInteracaoAction(clienteId, {
        tipo,
        descricao: descricao.trim(),
        duracao_min: typeof duracao === 'number' ? duracao : undefined,
      })
      if ('sucesso' in resultado) {
        setDescricao('')
        setDuracao('')
        setMostrarForm(false)
        router.refresh()
      }
    })
  }

  return (
    <section className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wider font-bold text-sol">
          💬 Interações ({interacoes.length})
        </h3>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="text-[10px] text-sol hover:underline"
        >
          {mostrarForm ? '✕ Cancelar' : '+ Registrar'}
        </button>
      </div>

      {mostrarForm && (
        <div className="mb-4 p-3 bg-noite/40 border border-sol/20 rounded-lg space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="px-2 py-1.5 bg-noite/40 border border-white/10 rounded text-xs text-white"
            >
              {TIPOS_INTERACAO.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
            {['ligacao', 'reuniao', 'visita', 'whatsapp'].includes(tipo) && (
              <input
                type="number"
                min={1}
                placeholder="minutos"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value ? parseInt(e.target.value) : '')}
                className="px-2 py-1.5 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30"
              />
            )}
          </div>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que aconteceu?"
            rows={3}
            className="w-full px-2 py-1.5 bg-noite/40 border border-white/10 rounded text-xs text-white placeholder:text-white/30 focus:border-sol/40 focus:outline-none"
          />
          <button
            onClick={salvar}
            disabled={!descricao.trim() || isPending}
            className="w-full px-3 py-1.5 bg-sol text-noite font-bold text-xs rounded hover:bg-sol/90 disabled:opacity-40"
          >
            {isPending ? '...' : '💾 Registrar'}
          </button>
        </div>
      )}

      {interacoes.length === 0 ? (
        <p className="text-xs text-white/40">Nenhuma interação registrada ainda.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {interacoes.map((i) => {
            const config = TIPOS_INTERACAO.find((t) => t.chave === i.tipo) || TIPOS_INTERACAO[6]
            return (
              <div key={i.id} className="flex gap-2 p-2 bg-noite/40 border border-white/5 rounded">
                <div className="text-lg flex-shrink-0">{config.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[10px] text-white/50 mb-0.5">
                    <span className="uppercase font-bold text-sol">{config.label}</span>
                    <span>·</span>
                    <span>
                      {new Date(i.data_hora).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {i.duracao_min && <>· <span>{i.duracao_min}min</span></>}
                    {i.usuario?.nome_completo && (
                      <>· <span>{i.usuario.nome_completo.split(' ')[0]}</span></>
                    )}
                  </div>
                  <p className="text-xs text-white/80 whitespace-pre-wrap">{i.descricao}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
