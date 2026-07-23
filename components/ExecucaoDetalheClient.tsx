'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { mudarStatusExecucaoAction, atualizarExecucaoAction } from '@/app/execucoes/actions'
import { STATUS_INFO, PROXIMOS_STATUS, type StatusExecucao } from '@/lib/execucoes'

export function ExecucaoDetalheClient({
  execucao, projeto, historico,
}: {
  execucao: any
  projeto: any
  historico: any[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [obs, setObs] = useState('')

  const [dataAgendada, setDataAgendada] = useState(execucao.data_agendada || '')
  const [horaAgendada, setHoraAgendada] = useState(execucao.hora_agendada || '')
  const [duracao, setDuracao] = useState(execucao.duracao_estimada_dias || 1)
  const [endereco, setEndereco] = useState(execucao.endereco_execucao || '')
  const [observacoes, setObservacoes] = useState(execucao.observacoes || '')
  const [materiaisOk, setMateriaisOk] = useState(!!execucao.materiais_separados)

  const proximos = PROXIMOS_STATUS[execucao.status as StatusExecucao] || []

  function mudarStatus(novo: StatusExecucao) {
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await mudarStatusExecucaoAction(execucao.id, novo, obs || undefined)
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setObs('')
        router.refresh()
      }
    })
  }

  function salvarDados() {
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await atualizarExecucaoAction(execucao.id, {
        data_agendada: dataAgendada || null,
        hora_agendada: horaAgendada || null,
        duracao_estimada_dias: duracao || null,
        endereco_execucao: endereco || null,
        observacoes: observacoes || undefined,
        materiais_separados: materiaisOk,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setMsg('✓ Dados salvos.')
        setTimeout(() => setMsg(null), 2000)
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna esquerda: dados + agenda */}
      <div className="lg:col-span-2 space-y-4">
        <Bloco titulo="📅 Agenda">
          <Field label="Data agendada">
            <input
              type="date"
              value={dataAgendada || ''}
              onChange={e => setDataAgendada(e.target.value)}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
            />
          </Field>
          <Field label="Hora">
            <input
              type="time"
              value={horaAgendada || ''}
              onChange={e => setHoraAgendada(e.target.value)}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
            />
          </Field>
          <Field label="Duração estimada (dias)">
            <input
              type="number"
              step={0.5}
              value={duracao}
              onChange={e => setDuracao(parseFloat(e.target.value) || 1)}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
            />
          </Field>
        </Bloco>

        <Bloco titulo="📍 Endereço da execução" cols={1}>
          <Field label="Endereço (se diferente do cliente)">
            <input
              type="text"
              value={endereco}
              onChange={e => setEndereco(e.target.value)}
              placeholder={projeto?.cliente_endereco?.logradouro || 'Endereço do cliente será usado'}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
            />
          </Field>
        </Bloco>

        <Bloco titulo="📦 Preparação" cols={1}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={materiaisOk}
              onChange={e => setMateriaisOk(e.target.checked)}
              className="w-4 h-4 accent-verde"
            />
            <span className="text-sm text-white">Materiais separados e prontos pra execução</span>
          </label>
        </Bloco>

        <Bloco titulo="📝 Observações" cols={1}>
          <textarea
            value={observacoes}
            onChange={e => setObservacoes(e.target.value)}
            rows={3}
            placeholder="Detalhes específicos, restrições de acesso, requisitos técnicos..."
            className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
          />
        </Bloco>

        <button
          onClick={salvarDados}
          disabled={pending}
          className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {pending ? '⏳ Salvando...' : '💾 Salvar dados'}
        </button>
        {msg && <span className="text-xs text-verde ml-3">{msg}</span>}
      </div>

      {/* Coluna direita: transições de status + histórico */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            Avançar etapa
          </p>
          {proximos.length === 0 ? (
            <p className="text-xs text-white/50 italic">Sem próximas etapas (status terminal).</p>
          ) : (
            <div className="space-y-2">
              {proximos.map((s) => {
                const info = STATUS_INFO[s]
                return (
                  <button
                    key={s}
                    onClick={() => mudarStatus(s)}
                    disabled={pending}
                    className={`w-full text-left p-3 rounded-lg border transition ${info.bg} ${info.cor} hover:opacity-80 disabled:opacity-40`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{info.emoji}</span>
                      <span className="text-sm font-bold">{info.label}</span>
                    </div>
                    <p className="text-[10px] text-white/60 mt-0.5">{info.descricao}</p>
                  </button>
                )
              })}

              <div className="pt-3 border-t border-white/10">
                <label className="text-[10px] uppercase text-white/50 block mb-1">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Ex: cliente confirmou por WhatsApp"
                  className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs"
                />
              </div>
            </div>
          )}
          {erro && <p className="text-xs text-coral mt-2">⚠️ {erro}</p>}
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            🎯 Ações rápidas
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={`/projetos/${projeto?.id}`}
              className="text-xs text-white/70 hover:text-white"
            >
              📋 Ver projeto completo
            </Link>
            {projeto?.cliente_telefone && (
              <a
                href={`https://wa.me/${projeto.cliente_telefone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-verde hover:text-verde/80"
              >
                💬 WhatsApp cliente
              </a>
            )}
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            📜 Histórico ({historico.length})
          </p>
          {historico.length === 0 ? (
            <p className="text-xs text-white/40 italic">Sem mudanças ainda.</p>
          ) : (
            <div className="space-y-2">
              {historico.slice(0, 8).map((h) => {
                const info = STATUS_INFO[h.status_novo as StatusExecucao]
                const data = new Date(h.created_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })
                return (
                  <div key={h.id} className="text-[10px] border-l-2 border-white/10 pl-2">
                    <p className="font-bold text-white/80">
                      {info?.emoji} {info?.label || h.status_novo}
                    </p>
                    <p className="text-white/40">{data}</p>
                    {h.observacoes && <p className="text-white/60 italic mt-0.5">{h.observacoes}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Bloco({ titulo, children, cols = 2 }: { titulo: string; children: React.ReactNode; cols?: 1 | 2 }) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">{titulo}</p>
      <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 block mb-1">{label}</label>
      {children}
    </div>
  )
}
