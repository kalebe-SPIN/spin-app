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

type MatrizMargem = {
  faixas: { min: number; max: number; rotulo: string }[]
  por_tipo: Record<string, Array<number | null>>
}

const LABEL_TIPO: Record<string, { emoji: string; label: string }> = {
  fv_ongrid:    { emoji: '☀️', label: 'Solar on-grid' },
  fv_hibrido:   { emoji: '🌗', label: 'Solar híbrido (BESS)' },
  fv_zero_grid: { emoji: '🚫🔌', label: 'Solar zero-grid' },
  fv_offgrid:   { emoji: '🏝️', label: 'Solar off-grid' },
}

export function PainelPrecificacaoFotovoltaicoClient({ parametros }: { parametros: Parametro[] }) {
  const numericos = parametros.filter(p => p.valor_numero !== null || (p.valor_numero === null && p.valor_json === null))
  const matrizParam = parametros.find(p => p.chave === 'fv_matriz_margem_kwp')
  // Kalebe 2026-09-18: fv_faixas_preco_kwp foi aposentado. O orçamento
  // rápido agora usa calcularProposta com matriz de margem — mesma lógica
  // do orçamento formal. A chave fica dormente no banco (retrocompat) mas
  // não aparece mais na UI.

  return (
    <div className="space-y-8">
      {matrizParam && <BlocoMatrizMargem parametro={matrizParam} />}

      <section>
        <h2 className="text-lg font-bold text-white mb-3">🔧 Parâmetros técnicos</h2>
        <div className="space-y-3">
          {numericos
            .filter(p => p.chave !== 'fv_faixas_preco_kwp' && p.chave !== 'fv_matriz_margem_kwp')
            .map(p => <LinhaParametroNumerico key={p.id} parametro={p} />)}
        </div>
      </section>
    </div>
  )
}

/**
 * Bloco: matriz de margem % por tipo_projeto × faixa kWp.
 * Cada célula pode ficar vazia — nesse caso o motor cai em margem_contribuicao_perc.
 */
function BlocoMatrizMargem({ parametro }: { parametro: Parametro }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const inicial = (parametro.valor_json as MatrizMargem) || { faixas: [], por_tipo: {} }
  const [matriz, setMatriz] = useState<MatrizMargem>(inicial)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const alterou = JSON.stringify(matriz) !== JSON.stringify(inicial)
  const tipos = Object.keys(matriz.por_tipo || {})

  function atualizarCelula(tipo: string, idx: number, valor: string) {
    setSucesso(false)
    const num = valor.trim() === '' ? null : parseFloat(valor.replace(',', '.'))
    setMatriz(prev => ({
      ...prev,
      por_tipo: {
        ...prev.por_tipo,
        [tipo]: prev.por_tipo[tipo].map((v, i) => i === idx ? num : v),
      },
    }))
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
        chave: 'fv_matriz_margem_kwp',
        valor_json: matriz,
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
    <section className="bg-gradient-to-br from-verde/10 to-weg-azul/5 border border-verde/30 rounded-xl p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-bold text-white">🎯 Matriz de margem por tipo × porte</h2>
        <span className="text-[10px] uppercase font-bold text-weg-azul bg-white/10 px-2 py-0.5 rounded">
          Aprovação Kalebe
        </span>
      </div>
      <p className="text-xs text-white/60 mb-4">
        Margem % aplicada no cálculo do PV. Linha vazia (todas células null) = usa a margem global
        (<strong className="text-sol">margem_contribuicao_perc</strong>). Preencher uma célula sobrepõe
        a margem global só naquele cruzamento.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-white/10">
              <th className="pb-2 pr-3 text-white/60 font-semibold text-xs uppercase">Tipo</th>
              {matriz.faixas.map((f, i) => (
                <th key={i} className="pb-2 px-2 text-white/60 font-semibold text-xs uppercase text-center">
                  <div>{f.min}–{f.max === 9999 ? '∞' : f.max} kWp</div>
                  <div className="text-[9px] text-white/40 font-normal normal-case">{f.rotulo}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tipos.map(tipo => {
              const info = LABEL_TIPO[tipo] || { emoji: '📦', label: tipo }
              const valores = matriz.por_tipo[tipo] || []
              return (
                <tr key={tipo} className="border-b border-white/5">
                  <td className="py-3 pr-3 text-white text-sm whitespace-nowrap">
                    <span className="mr-2">{info.emoji}</span>{info.label}
                  </td>
                  {valores.map((v, i) => (
                    <td key={i} className="py-3 px-1 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          max="50"
                          value={v ?? ''}
                          onChange={e => atualizarCelula(tipo, i, e.target.value)}
                          placeholder="—"
                          className="w-16 px-2 py-1 bg-noite border border-white/20 rounded text-white text-sm font-mono focus:border-verde focus:outline-none text-center"
                        />
                        <span className="text-white/40 text-xs">%</span>
                      </div>
                    </td>
                  ))}
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
            placeholder="Ex: Ajuste após reunião comercial — margem maior em híbrido pequeno"
            className="w-full px-3 py-2 bg-noite border border-white/20 rounded text-white text-sm focus:border-verde focus:outline-none"
          />
          <button
            onClick={salvar}
            disabled={pending || motivo.trim().length < 10}
            className="w-full py-2.5 bg-verde text-noite font-bold rounded-lg hover:bg-verde/90 disabled:opacity-40 transition text-sm"
          >
            {pending ? 'Salvando...' : '💾 Salvar matriz de margem'}
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
          ✓ Matriz salva — vigência anterior encerrada, nova ativa a partir de hoje.
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

          <div>
            <label className="text-xs text-white/60 font-semibold">
              Motivo <span className="text-coral">*</span>
              {!alterou && (
                <span className="text-white/40 font-normal ml-2">
                  (digite um valor diferente pra habilitar)
                </span>
              )}
            </label>
            <input
              type="text"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex: Bandeira vermelha CELESC — reajuste kWh"
              disabled={!alterou}
              className="w-full mt-1 px-3 py-2 bg-noite border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <button
            onClick={salvar}
            disabled={pending || !alterou || motivo.trim().length < 10 || !!foraLimite}
            className="w-full py-2 bg-sol text-noite font-bold rounded text-sm hover:bg-sol/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title={
              !alterou ? 'Digite um valor diferente do atual pra habilitar' :
              motivo.trim().length < 10 ? 'Motivo precisa ter ≥ 10 caracteres' :
              foraLimite ? 'Valor fora do limite permitido' : ''
            }
          >
            {pending ? 'Salvando...' : '💾 Salvar alteração'}
          </button>

          {erro && <div className="p-2 bg-coral/10 border border-coral/30 rounded text-xs text-coral">⚠️ {erro}</div>}
          {sucesso && <div className="p-2 bg-verde/10 border border-verde/30 rounded text-xs text-verde">✓ Salvo</div>}
        </div>
      )}
    </div>
  )
}
