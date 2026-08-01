'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarParametroFotovoltaicoAction } from '@/app/admin/precificacao/fotovoltaico/actions'

type Parametro = {
  id: string
  chave: string
  descricao: string
  valor_numero: number | null
  valor_json: unknown
  unidade: string | null
  valor_minimo: number | null
  valor_maximo: number | null
  requer_aprovacao_kalebe: boolean
  alterado_por: string | null
  created_at: string
}

type FaixaKwp = {
  min_kwp: number
  max_kwp: number
  preco_kwp: number | null
  descricao: string
}

export function PainelPrecificacaoFotovoltaicoClient({ parametros }: { parametros: Parametro[] }) {
  const numericos = parametros.filter(p => p.valor_numero !== null || (p.valor_numero === null && p.valor_json === null))
  const faixasParam = parametros.find(p => p.chave === 'fv_faixas_preco_kwp')

  return (
    <div className="space-y-8">
      {faixasParam && <BlocoFaixasKwp parametro={faixasParam} />}

      <section>
        <h2 className="text-lg font-bold text-white mb-3">🔧 Parâmetros técnicos</h2>
        <div className="space-y-3">
          {numericos
            .filter(p => p.chave !== 'fv_faixas_preco_kwp')
            .map(p => <LinhaParametroNumerico key={p.id} parametro={p} />)}
        </div>
      </section>
    </div>
  )
}

/**
 * Bloco especial: edita as 5 faixas de R$/kWp em uma tabela.
 * Preço null = usa fallback do código (fica avisado).
 */
function BlocoFaixasKwp({ parametro }: { parametro: Parametro }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const faixasIniciais = (parametro.valor_json as FaixaKwp[]) || []
  const [faixas, setFaixas] = useState<FaixaKwp[]>(faixasIniciais)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const alterou = JSON.stringify(faixas) !== JSON.stringify(faixasIniciais)
  const todosVazios = faixas.every(f => f.preco_kwp === null)

  function atualizarPreco(idx: number, valor: string) {
    setSucesso(false)
    const num = valor.trim() === '' ? null : parseFloat(valor.replace(',', '.'))
    setFaixas(prev => prev.map((f, i) => i === idx ? { ...f, preco_kwp: num } : f))
  }

  async function salvar() {
    setErro(null)
    setSucesso(false)
    if (motivo.trim().length < 10) {
      setErro('Motivo da alteração precisa ter no mínimo 10 caracteres.')
      return
    }
    startTransition(async () => {
      const res = await editarParametroFotovoltaicoAction({
        chave: 'fv_faixas_preco_kwp',
        valor_json: faixas,
        motivo,
      })
      if ('erro' in res) {
        setErro(res.erro)
      } else {
        setSucesso(true)
        setMotivo('')
        router.refresh()
      }
    })
  }

  return (
    <section className="bg-gradient-to-br from-sol/10 to-verde/5 border border-sol/30 rounded-xl p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-bold text-white">💰 Faixas de R$/kWp instalado</h2>
        <span className="text-[10px] uppercase font-bold text-weg-azul bg-white/10 px-2 py-0.5 rounded">
          Aprovação Kalebe
        </span>
      </div>
      <p className="text-xs text-white/60 mb-4">
        Preço chave-em-mão por porte do sistema. Usado pelo Orçamento Rápido pra estimar valor final.
        <strong className="text-sol"> Deixar vazio = usar fallback do código.</strong>
      </p>

      {todosVazios && (
        <div className="mb-4 p-3 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
          ⚠️ Nenhum preço cadastrado ainda — o Orçamento Rápido está usando fallback do código
          (R$ 4.200/kWp — que Kalebe apontou como incorreto). Preencha as faixas abaixo pra
          usar os valores reais Spin.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-white/10">
              <th className="pb-2 pr-3 text-white/60 font-semibold text-xs uppercase">Faixa</th>
              <th className="pb-2 pr-3 text-white/60 font-semibold text-xs uppercase">Porte</th>
              <th className="pb-2 pr-3 text-white/60 font-semibold text-xs uppercase">R$/kWp</th>
              <th className="pb-2 text-white/60 font-semibold text-xs uppercase">Exemplo 8 kWp</th>
            </tr>
          </thead>
          <tbody>
            {faixas.map((f, idx) => {
              const kwpExemplo = 8
              const noRange = kwpExemplo >= f.min_kwp && kwpExemplo < f.max_kwp
              return (
                <tr key={idx} className="border-b border-white/5">
                  <td className="py-3 pr-3 text-white/70 text-xs">
                    {f.min_kwp}–{f.max_kwp === 9999 ? '∞' : f.max_kwp} kWp
                  </td>
                  <td className="py-3 pr-3 text-white text-sm">{f.descricao}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-1">
                      <span className="text-white/50 text-xs">R$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={f.preco_kwp ?? ''}
                        onChange={e => atualizarPreco(idx, e.target.value)}
                        placeholder="—"
                        className="w-24 px-2 py-1 bg-noite border border-white/20 rounded text-white text-sm font-mono focus:border-sol focus:outline-none"
                      />
                    </div>
                  </td>
                  <td className="py-3 text-white/50 text-xs">
                    {f.preco_kwp && noRange ? `R$ ${(f.preco_kwp * kwpExemplo).toLocaleString('pt-BR')}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {alterou && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
          <label className="block text-xs font-semibold text-white/70">
            Motivo da alteração <span className="text-coral">*</span> (mín 10 chars — fica no log)
          </label>
          <input
            type="text"
            value={motivo}
            onChange={e => { setMotivo(e.target.value); setErro(null) }}
            placeholder="Ex: Ajuste após reunião comercial 2026-08-01"
            className="w-full px-3 py-2 bg-noite border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
          />
          <button
            onClick={salvar}
            disabled={pending || motivo.trim().length < 10}
            className="w-full py-2.5 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition text-sm"
          >
            {pending ? 'Salvando...' : '💾 Salvar faixas de preço'}
          </button>
        </div>
      )}

      {erro && (
        <div className="mt-3 p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
          ⚠️ {erro}
        </div>
      )}
      {sucesso && (
        <div className="mt-3 p-2.5 bg-verde/10 border border-verde/30 rounded text-xs text-verde">
          ✓ Faixas salvas — vigência anterior encerrada, nova vigência ativa a partir de hoje.
        </div>
      )}
    </section>
  )
}

/**
 * Edição inline de parâmetro numérico simples (kWh, fator perda, potência módulo).
 */
function LinhaParametroNumerico({ parametro }: { parametro: Parametro }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [valor, setValor] = useState<string>(parametro.valor_numero?.toString() ?? '')
  const [motivo, setMotivo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const valorNum = parseFloat(valor.replace(',', '.'))
  const alterou = !isNaN(valorNum) && valorNum !== parametro.valor_numero
  const foraLimite =
    alterou &&
    ((parametro.valor_minimo !== null && valorNum < parametro.valor_minimo) ||
     (parametro.valor_maximo !== null && valorNum > parametro.valor_maximo))

  async function salvar() {
    setErro(null)
    setSucesso(false)
    if (isNaN(valorNum)) { setErro('Valor inválido'); return }
    if (foraLimite) {
      setErro(`Valor fora do limite permitido (${parametro.valor_minimo}–${parametro.valor_maximo}${parametro.unidade || ''})`)
      return
    }
    if (motivo.trim().length < 10) {
      setErro('Motivo obrigatório (mín 10 chars)')
      return
    }
    startTransition(async () => {
      const res = await editarParametroFotovoltaicoAction({
        chave: parametro.chave,
        valor_numero: valorNum,
        motivo,
      })
      if ('erro' in res) {
        setErro(res.erro)
      } else {
        setSucesso(true)
        setMotivo('')
        setAberto(false)
        router.refresh()
      }
    })
  }

  const label = parametro.chave.replace(/^fv_/, '').replace(/_/g, ' ')

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white capitalize">{label}</span>
            {parametro.requer_aprovacao_kalebe && (
              <span className="text-[9px] uppercase font-bold text-weg-azul bg-white/10 px-1.5 py-0.5 rounded">
                Aprovação Kalebe
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{parametro.descricao}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-sol font-mono">
            {parametro.valor_numero?.toString().replace('.', ',')} <span className="text-xs text-white/50">{parametro.unidade}</span>
          </div>
          <div className="text-[10px] text-white/40">{aberto ? '▲' : '▼ editar'}</div>
        </div>
      </button>

      {aberto && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-white/60 font-semibold">
                Novo valor
                {parametro.valor_minimo !== null && parametro.valor_maximo !== null && (
                  <span className="text-white/40 ml-1">
                    ({parametro.valor_minimo}–{parametro.valor_maximo})
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={valor}
                  onChange={e => { setValor(e.target.value); setErro(null); setSucesso(false) }}
                  className={`flex-1 px-3 py-2 bg-noite border rounded text-white text-sm font-mono focus:outline-none ${
                    foraLimite ? 'border-coral' : 'border-white/20 focus:border-sol'
                  }`}
                />
                <span className="text-white/50 text-xs">{parametro.unidade}</span>
              </div>
            </div>
          </div>

          {alterou && (
            <div>
              <label className="text-xs text-white/60 font-semibold">
                Motivo <span className="text-coral">*</span>
              </label>
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ex: Bandeira vermelha CELESC — reajuste kWh"
                className="w-full mt-1 px-3 py-2 bg-noite border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
              />
            </div>
          )}

          {alterou && (
            <button
              onClick={salvar}
              disabled={pending || motivo.trim().length < 10 || !!foraLimite}
              className="w-full py-2 bg-sol text-noite font-bold rounded text-sm hover:bg-sol/90 disabled:opacity-40 transition"
            >
              {pending ? 'Salvando...' : '💾 Salvar alteração'}
            </button>
          )}

          {erro && <div className="p-2 bg-coral/10 border border-coral/30 rounded text-xs text-coral">⚠️ {erro}</div>}
          {sucesso && <div className="p-2 bg-verde/10 border border-verde/30 rounded text-xs text-verde">✓ Salvo</div>}
        </div>
      )}
    </div>
  )
}
