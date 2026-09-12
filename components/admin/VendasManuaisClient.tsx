'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  cadastrarVendaManualAction,
  descadastrarVendaManualAction,
  restaurarVendaManualAction,
  type EntradaVendaManual,
} from '@/app/admin/vendas/actions'

type VendaLista = {
  id: string
  cliente_nome: string
  cliente_documento: string | null
  categoria: 'fv' | 'servico'
  tipo_detalhado: string | null
  valor_venda: number
  custo_estimado: number
  data_venda: string
  observacao: string | null
  vendedor_id: string | null
  vendedor?: { nome_completo: string | null } | null
  criador?: { nome_completo: string | null } | null
  criada_em: string
  deletada_em: string | null
}

type Vendedor = { id: string; nome_completo: string; role: string }

// Rótulos alinhados com as chaves do painel (RÓTULOS_SERVICO + tipos FV)
const TIPOS_FV = [
  { chave: 'on_grid', rotulo: 'On-grid (padrão)' },
  { chave: 'hibrido', rotulo: 'Híbrido' },
  { chave: 'bess_puro', rotulo: 'BESS puro' },
  { chave: 've_recarga', rotulo: 'VE / Recarga' },
]
const TIPOS_SERVICO = [
  { chave: 'srv_limpeza', rotulo: 'Limpeza de placas' },
  { chave: 'srv_instalacao_placas', rotulo: 'Instalação FV avulsa' },
  { chave: 'srv_revisao', rotulo: 'Revisão FV' },
  { chave: 'srv_retirada_recolocacao', rotulo: 'Retirada/Recolocação' },
  { chave: 'srv_om', rotulo: 'O&M' },
  { chave: 'srv_alvenaria', rotulo: 'Alvenaria' },
  { chave: 'srv_serralheria', rotulo: 'Serralheria' },
  { chave: 'srv_carpintaria', rotulo: 'Carpintaria' },
  { chave: 'aluguel_maquinas', rotulo: 'Aluguel de máquinas' },
]

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const fmtData = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function VendasManuaisClient({
  vendasIniciais,
  vendedores,
}: {
  vendasIniciais: VendaLista[]
  vendedores: Vendedor[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarDeletadas, setMostrarDeletadas] = useState(false)

  // Formulário
  const [categoria, setCategoria] = useState<'fv' | 'servico'>('fv')
  const [tipoDetalhado, setTipoDetalhado] = useState('on_grid')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteDocumento, setClienteDocumento] = useState('')
  const [valorVenda, setValorVenda] = useState('')
  const [custoEstimado, setCustoEstimado] = useState('')
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().slice(0, 10))
  const [vendedorId, setVendedorId] = useState('')
  const [observacao, setObservacao] = useState('')

  const tiposDaCategoria = categoria === 'fv' ? TIPOS_FV : TIPOS_SERVICO

  // Ajusta tipo_detalhado quando muda categoria
  function trocarCategoria(nova: 'fv' | 'servico') {
    setCategoria(nova)
    setTipoDetalhado(nova === 'fv' ? 'on_grid' : 'srv_limpeza')
  }

  const parseNum = (s: string) => parseFloat(s.replace(/[R$\s.]/g, '').replace(',', '.')) || 0
  const valorNum = parseNum(valorVenda)
  const custoNum = parseNum(custoEstimado)
  const margemPct = valorNum > 0 ? ((valorNum - custoNum) / valorNum) * 100 : 0
  const podeSalvar = clienteNome.trim().length > 0 && valorNum > 0 && custoNum <= valorNum

  function salvar() {
    if (!podeSalvar) return
    setErro(null)
    const entrada: EntradaVendaManual = {
      cliente_nome: clienteNome,
      cliente_documento: clienteDocumento || undefined,
      categoria,
      tipo_detalhado: tipoDetalhado || undefined,
      valor_venda: valorNum,
      custo_estimado: custoNum,
      data_venda: dataVenda,
      vendedor_id: vendedorId || undefined,
      observacao: observacao || undefined,
    }
    startTransition(async () => {
      const r = await cadastrarVendaManualAction(entrada)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      // Limpa form
      setClienteNome('')
      setClienteDocumento('')
      setValorVenda('')
      setCustoEstimado('')
      setObservacao('')
      router.refresh()
    })
  }

  function descadastrar(id: string) {
    if (!confirm('Descadastrar essa venda? Ela sai do painel imediatamente. Dá pra restaurar depois.')) return
    setErro(null)
    startTransition(async () => {
      const r = await descadastrarVendaManualAction(id)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      router.refresh()
    })
  }

  function restaurar(id: string) {
    setErro(null)
    startTransition(async () => {
      const r = await restaurarVendaManualAction(id)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      router.refresh()
    })
  }

  // Resumos
  const { ativas, deletadas, totalMes, totalFvMes, totalServMes } = useMemo(() => {
    const ativas = vendasIniciais.filter((v) => !v.deletada_em)
    const deletadas = vendasIniciais.filter((v) => v.deletada_em)
    const inicioMes = new Date()
    inicioMes.setDate(1)
    const inicioIso = inicioMes.toISOString().slice(0, 10)
    const doMes = ativas.filter((v) => v.data_venda >= inicioIso)
    const totalMes = doMes.reduce((s, v) => s + Number(v.valor_venda || 0), 0)
    const totalFvMes = doMes.filter((v) => v.categoria === 'fv').reduce((s, v) => s + Number(v.valor_venda || 0), 0)
    const totalServMes = doMes.filter((v) => v.categoria === 'servico').reduce((s, v) => s + Number(v.valor_venda || 0), 0)
    return { ativas, deletadas, totalMes, totalFvMes, totalServMes }
  }, [vendasIniciais])

  const visiveis = mostrarDeletadas ? vendasIniciais : ativas

  return (
    <div className="space-y-6">
      {/* Resumos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ResumoCard label="Total do mês" valor={totalMes} cor="text-sol" />
        <ResumoCard label="FV do mês" valor={totalFvMes} cor="text-sol" />
        <ResumoCard label="Serviços do mês" valor={totalServMes} cor="text-verde" />
      </div>

      {/* Formulário de cadastro */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5 md:p-6">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
          ➕ Cadastrar nova venda
        </h2>

        {/* Categoria — dois botões grandes */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => trocarCategoria('fv')}
            className={`px-4 py-3 rounded-lg text-sm font-bold transition ${
              categoria === 'fv'
                ? 'bg-sol/20 border border-sol/40 text-sol'
                : 'bg-white/[0.02] border border-white/10 text-white/50 hover:bg-white/5'
            }`}
          >
            ☀ FV — soma em Composição FV
          </button>
          <button
            type="button"
            onClick={() => trocarCategoria('servico')}
            className={`px-4 py-3 rounded-lg text-sm font-bold transition ${
              categoria === 'servico'
                ? 'bg-verde/20 border border-verde/40 text-verde'
                : 'bg-white/[0.02] border border-white/10 text-white/50 hover:bg-white/5'
            }`}
          >
            🛠 Serviço — soma em Demais Serviços
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Cliente *">
            <input
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
              placeholder="Nome ou razão social"
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
            />
          </Field>
          <Field label="CPF / CNPJ (opcional)">
            <input
              value={clienteDocumento}
              onChange={(e) => setClienteDocumento(e.target.value)}
              placeholder="Só números"
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white font-mono"
            />
          </Field>
          <Field label="Tipo detalhado">
            <select
              value={tipoDetalhado}
              onChange={(e) => setTipoDetalhado(e.target.value)}
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
            >
              {tiposDaCategoria.map((t) => (
                <option key={t.chave} value={t.chave}>{t.rotulo}</option>
              ))}
            </select>
          </Field>
          <Field label="Data da venda *">
            <input
              type="date"
              value={dataVenda}
              onChange={(e) => setDataVenda(e.target.value)}
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
            />
          </Field>
          <Field label="Valor da venda (R$) *" destaque>
            <input
              inputMode="decimal"
              value={valorVenda}
              onChange={(e) => setValorVenda(e.target.value)}
              placeholder="Ex. 45000"
              className="w-full px-3 py-2 bg-sol/10 border border-sol/30 rounded text-sm text-white font-bold"
            />
          </Field>
          <Field label="Custo estimado (R$)">
            <input
              inputMode="decimal"
              value={custoEstimado}
              onChange={(e) => setCustoEstimado(e.target.value)}
              placeholder="Kit + serviços que vc pagou"
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
            />
          </Field>
          <Field label="Vendedor (opcional)">
            <select
              value={vendedorId}
              onChange={(e) => setVendedorId(e.target.value)}
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
            >
              <option value="">— nenhum específico —</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome_completo} ({v.role})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Contexto — venda por WhatsApp, indicação, etc."
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
            />
          </Field>
        </div>

        {/* Margem calculada em tempo real */}
        {valorNum > 0 && (
          <div className="mt-4 p-3 bg-white/[0.02] border border-white/10 rounded flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Margem estimada</p>
              <p className={`text-lg font-mono font-black ${margemPct >= 15 ? 'text-verde' : margemPct >= 5 ? 'text-sol' : 'text-coral'}`}>
                {fmtBRL(valorNum - custoNum)} <span className="text-sm text-white/50 font-normal">({margemPct.toFixed(1)}%)</span>
              </p>
            </div>
            <div className="text-right text-xs text-white/50">
              <p>Venda: {fmtBRL(valorNum)}</p>
              <p>Custo: {fmtBRL(custoNum)}</p>
            </div>
          </div>
        )}

        {erro && (
          <p className="mt-4 text-sm text-coral bg-coral/10 border border-coral/30 rounded p-3">
            ❌ {erro}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-white/10">
          <button
            type="button"
            onClick={salvar}
            disabled={!podeSalvar || isPending}
            className="px-6 py-2.5 bg-sol text-noite font-bold text-sm rounded disabled:opacity-40"
          >
            {isPending ? 'Salvando...' : 'Cadastrar venda'}
          </button>
        </div>
      </section>

      {/* Lista */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            📋 Últimas vendas manuais
          </h2>
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={mostrarDeletadas}
              onChange={(e) => setMostrarDeletadas(e.target.checked)}
              className="w-3.5 h-3.5 accent-sol"
            />
            Mostrar descadastradas ({deletadas.length})
          </label>
        </div>

        {visiveis.length === 0 ? (
          <p className="text-sm text-white/40 italic py-6 text-center">
            Nenhuma venda manual nos últimos 60 dias.
          </p>
        ) : (
          <div className="space-y-2">
            {visiveis.map((v) => {
              const inativa = !!v.deletada_em
              const margem = Number(v.valor_venda) - Number(v.custo_estimado || 0)
              const margemPct = Number(v.valor_venda) > 0 ? (margem / Number(v.valor_venda)) * 100 : 0
              const rotuloTipo = [...TIPOS_FV, ...TIPOS_SERVICO].find((t) => t.chave === v.tipo_detalhado)?.rotulo || v.tipo_detalhado || '—'
              return (
                <div
                  key={v.id}
                  className={`p-3 rounded-lg border ${
                    inativa
                      ? 'bg-white/[0.01] border-white/5 opacity-60'
                      : v.categoria === 'fv'
                      ? 'bg-sol/[0.04] border-sol/20'
                      : 'bg-verde/[0.04] border-verde/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                          v.categoria === 'fv' ? 'bg-sol/20 text-sol' : 'bg-verde/20 text-verde'
                        }`}>
                          {v.categoria === 'fv' ? '☀ FV' : '🛠 Serviço'}
                        </span>
                        <span className="text-[10px] text-white/40">{rotuloTipo}</span>
                        <span className="text-[10px] text-white/40">· {fmtData(v.data_venda)}</span>
                        {inativa && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-coral">
                            DESCADASTRADA
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-white truncate">
                        {v.cliente_nome}
                        {v.cliente_documento && <span className="text-white/40 text-xs ml-2 font-mono font-normal">{v.cliente_documento}</span>}
                      </p>
                      {v.observacao && (
                        <p className="text-xs text-white/50 mt-0.5 truncate">{v.observacao}</p>
                      )}
                      <p className="text-[10px] text-white/30 mt-1">
                        Cadastrada por {v.criador?.nome_completo || '?'}
                        {v.vendedor?.nome_completo && ` · vendedor: ${v.vendedor.nome_completo}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-mono font-black text-white">{fmtBRL(Number(v.valor_venda))}</p>
                      <p className={`text-[10px] font-mono ${margemPct >= 15 ? 'text-verde' : margemPct >= 5 ? 'text-sol' : 'text-coral'}`}>
                        margem {margemPct.toFixed(0)}% · {fmtBRL(margem)}
                      </p>
                      {inativa ? (
                        <button
                          type="button"
                          onClick={() => restaurar(v.id)}
                          disabled={isPending}
                          className="mt-2 text-[10px] text-verde hover:text-verde/80 font-semibold uppercase tracking-wider"
                        >
                          Restaurar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => descadastrar(v.id)}
                          disabled={isPending}
                          className="mt-2 text-[10px] text-coral hover:text-coral/80 font-semibold uppercase tracking-wider"
                        >
                          Descadastrar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, children, destaque }: { label: string; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-wider font-bold mb-1 ${destaque ? 'text-sol' : 'text-white/50'}`}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ResumoCard({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{label}</p>
      <p className={`text-2xl font-black font-mono mt-1 ${cor}`}>{fmtBRL(valor)}</p>
    </div>
  )
}
