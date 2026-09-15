'use client'

import { useState } from 'react'
import { salvarWaConfigAction, testarWaConfigAction } from '@/app/admin/whatsapp/config/actions'

type Props = {
  mascarasIniciais: Record<string, string>
}

const CAMPOS = [
  { chave: 'whatsapp_access_token', rotulo: 'WHATSAPP_ACCESS_TOKEN', placeholder: 'EAAG...', mask: true },
  { chave: 'whatsapp_phone_number_id', rotulo: 'WHATSAPP_PHONE_NUMBER_ID', placeholder: 'ex 738...', mask: false },
  { chave: 'whatsapp_verify_token', rotulo: 'WHATSAPP_VERIFY_TOKEN', placeholder: 'string aleatória', mask: true },
  { chave: 'cron_secret', rotulo: 'CRON_SECRET', placeholder: 'string aleatória', mask: true },
  { chave: 'anthropic_api_key', rotulo: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...', mask: true },
] as const

export default function ConfigCanalClient({ mascarasIniciais }: Props) {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [mostrar, setMostrar] = useState<Record<string, boolean>>({})
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [mascaras, setMascaras] = useState<Record<string, string>>(mascarasIniciais)

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    try {
      const r = await salvarWaConfigAction(valores)
      if ('erro' in r) {
        setMsg({ tipo: 'erro', texto: r.erro })
      } else {
        setMsg({ tipo: 'ok', texto: '✅ Salvo. Cache invalidado — o portal já usa os valores novos.' })
        // Reset dos inputs pra mostrar mascaras atualizadas na próxima renderização
        setValores({})
        // Atualiza máscaras localmente (mostra que foi persistido)
        const novasMascaras = { ...mascaras }
        for (const [k, v] of Object.entries(valores)) {
          if (typeof v === 'string' && v.trim()) {
            const s = v.trim()
            novasMascaras[k] = s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)} (${s.length} chars)` : s
          }
        }
        setMascaras(novasMascaras)
      }
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Erro desconhecido' })
    } finally {
      setSalvando(false)
    }
  }

  async function testar() {
    setTestando(true)
    setMsg(null)
    try {
      const r = await testarWaConfigAction()
      if ('erro' in r) {
        setMsg({ tipo: 'erro', texto: `❌ ${r.erro}` })
      } else {
        setMsg({ tipo: 'ok', texto: `✅ Meta respondeu: ${r.numero}${r.nome ? ` · ${r.nome}` : ''}` })
      }
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Erro desconhecido' })
    } finally {
      setTestando(false)
    }
  }

  const algumPreenchido = Object.values(valores).some((v) => typeof v === 'string' && v.trim().length > 0)

  return (
    <div className="space-y-4">
      {CAMPOS.map((c) => {
        const mask = c.mask && !mostrar[c.chave]
        return (
          <div key={c.chave} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-baseline justify-between mb-2">
              <label htmlFor={c.chave} className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                {c.rotulo}
              </label>
              <span className="text-xs text-neutral-500 font-mono">
                atual: {mascaras[c.chave] || 'não cadastrado'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                id={c.chave}
                type={mask ? 'password' : 'text'}
                value={valores[c.chave] || ''}
                onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })}
                placeholder={c.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              {c.mask && (
                <button
                  type="button"
                  onClick={() => setMostrar({ ...mostrar, [c.chave]: !mostrar[c.chave] })}
                  className="px-3 py-2 text-xs text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md"
                >
                  {mostrar[c.chave] ? 'ocultar' : 'mostrar'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {msg && (
        <div
          className={`rounded-md p-3 text-sm ${
            msg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          {msg.texto}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={salvar}
          disabled={!algumPreenchido || salvando}
          className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button
          type="button"
          onClick={testar}
          disabled={testando}
          className="px-4 py-2 bg-white border border-neutral-300 text-neutral-800 rounded-md text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testando ? 'Testando…' : 'Testar conexão Meta'}
        </button>
      </div>

      <p className="pt-2 text-xs text-neutral-500">
        Deixe qualquer campo em branco pra manter o valor atual. Só preenche o que quer trocar.
      </p>
    </div>
  )
}
