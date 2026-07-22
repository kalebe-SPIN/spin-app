'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarGatilhoAction } from '@/app/admin/bianca/gatilhos/actions'

type Gatilho = {
  id: string
  chave: string
  nome: string
  descricao: string | null
  publico_alvo: string
  modo: string
  canal: string
  template_base: string
  refinar_com_ia: boolean
  contexto_ia: string | null
  ativo: boolean
}

type Stats = {
  total: number
  sugeridas: number
  enviadas: number
  falhas: number
}

type Props = {
  gatilho: Gatilho
  publicoLabel: string
  canalLabel: string
  stats?: Stats
}

const OPT: React.CSSProperties = { backgroundColor: '#050B16', color: '#ffffff' }

export function GatilhosBiancaClient({ gatilho, publicoLabel, canalLabel, stats }: Props) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [modo, setModo] = useState(gatilho.modo)
  const [template, setTemplate] = useState(gatilho.template_base)
  const [contextoIA, setContextoIA] = useState(gatilho.contexto_ia || '')
  const [refinar, setRefinar] = useState(gatilho.refinar_com_ia)
  const [ativo, setAtivo] = useState(gatilho.ativo)

  function salvar() {
    setMsg(null)
    setErro(null)
    startTransition(async () => {
      const res = await atualizarGatilhoAction(gatilho.id, {
        modo: modo as any,
        template_base: template,
        contexto_ia: contextoIA || undefined,
        refinar_com_ia: refinar,
        ativo,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setMsg('✓ Salvo')
        router.refresh()
        setTimeout(() => setMsg(null), 2000)
      }
    })
  }

  const modoCor = modo === 'automatico' ? 'text-verde' : modo === 'sugerido' ? 'text-sol' : 'text-white/40'
  const modoBg = modo === 'automatico' ? 'bg-verde/10 border-verde/30' :
                 modo === 'sugerido' ? 'bg-sol/10 border-sol/30' : 'bg-white/5 border-white/10'

  return (
    <div className={`border rounded-xl overflow-hidden ${modoBg}`}>
      {/* Cabecalho compacto */}
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full text-left p-4 flex items-center gap-4 hover:bg-white/[0.02] transition"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-bold text-white truncate">{gatilho.nome}</span>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${modoCor} border-current/40`}>
              {modo}
            </span>
            {!ativo && (
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-coral/40 text-coral">
                Inativo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-white/50">
            <span>{publicoLabel}</span>
            <span>·</span>
            <span>{canalLabel}</span>
            <span>·</span>
            <span className="font-mono text-white/40">{gatilho.chave}</span>
            {gatilho.refinar_com_ia && (
              <>
                <span>·</span>
                <span className="text-sol">🤖 Refinado por IA</span>
              </>
            )}
          </div>
        </div>

        {stats && stats.total > 0 && (
          <div className="text-right text-[10px] shrink-0">
            <p className="text-white/40 uppercase">Últimos 7 dias</p>
            <p className="text-white font-bold">{stats.total} disparo{stats.total > 1 ? 's' : ''}</p>
            <div className="flex items-center gap-2 mt-0.5 justify-end">
              {stats.sugeridas > 0 && <span className="text-sol">💡 {stats.sugeridas}</span>}
              {stats.enviadas > 0 && <span className="text-verde">✓ {stats.enviadas}</span>}
              {stats.falhas > 0 && <span className="text-coral">✗ {stats.falhas}</span>}
            </div>
          </div>
        )}

        <span className="text-white/40 text-sm">{aberto ? '▲' : '▼'}</span>
      </button>

      {/* Editor expandido */}
      {aberto && (
        <div className="p-4 border-t border-white/10 space-y-4 bg-noite/40">
          {gatilho.descricao && (
            <p className="text-xs text-white/60">{gatilho.descricao}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Modo</label>
              <select
                value={modo}
                onChange={e => setModo(e.target.value)}
                className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
              >
                <option style={OPT} value="sugerido">💡 Sugerido (você confirma)</option>
                <option style={OPT} value="automatico">🚀 Automático (executa direto)</option>
                <option style={OPT} value="desligado">⏸️ Desligado</option>
              </select>
            </div>

            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={e => setAtivo(e.target.checked)}
                  className="w-4 h-4 accent-verde"
                />
                <span className="text-sm text-white">Ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refinar}
                  onChange={e => setRefinar(e.target.checked)}
                  className="w-4 h-4 accent-sol"
                />
                <span className="text-sm text-white">🤖 Refinar com IA</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-white/50 block mb-1">
              Template da mensagem
              <span className="text-white/40 normal-case ml-2">
                Use {'{variavel}'} pra placeholders. Ex: {'{cliente_nome}, {codigo_projeto}, {rt_nome}'}
              </span>
            </label>
            <textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm font-mono"
            />
          </div>

          {refinar && (
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">
                Instrução pro refinamento IA (opcional)
              </label>
              <textarea
                value={contextoIA}
                onChange={e => setContextoIA(e.target.value)}
                rows={2}
                placeholder="Ex: 'Tom animado, use primeiro nome, seja breve'"
                className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={salvar}
              disabled={pending}
              className="px-5 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
            >
              {pending ? '⏳ Salvando...' : '💾 Salvar gatilho'}
            </button>
            {msg && <span className="text-sm text-verde">{msg}</span>}
            {erro && <span className="text-sm text-coral">⚠️ {erro}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
