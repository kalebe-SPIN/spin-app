'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  adicionarExtraAction,
  buscarProdutosCatalogoAction,
  type SecaoExtra,
} from '@/app/projetos/[id]/orcamento/actions'
function fmtBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v || 0)
}

/**
 * Kalebe 2026-09-14: botão contextual pra adicionar item extra em cada
 * seção do orçamento (Kit WEG, Lista CA, Serviços).
 *
 * - Kit WEG e Lista CA: abre busca no catálogo `produtos`. Preço vem
 *   automático da tabela WEG vigente. Escolhe qtd + confirma.
 * - Serviços: form livre com descrição + valor.
 */
export function BotaoAdicionarItemExtra({
  projetoId,
  secao,
}: {
  projetoId: string
  secao: SecaoExtra
}) {
  const [aberto, setAberto] = useState(false)
  const label = secao === 'kit_weg' ? '+ Adicionar equipamento Kit WEG'
    : secao === 'lista_ca' ? '+ Adicionar item Lista CA'
    : '+ Adicionar serviço avulso'

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-[11px] px-2.5 py-1 rounded bg-sol/10 border border-sol/30 text-sol hover:bg-sol/20 uppercase tracking-wider font-bold transition"
      >
        {label}
      </button>
      {aberto && (
        <ModalItemExtra
          projetoId={projetoId}
          secao={secao}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  )
}

function ModalItemExtra({
  projetoId,
  secao,
  onFechar,
}: {
  projetoId: string
  secao: SecaoExtra
  onFechar: () => void
}) {
  const isCatalogo = secao === 'kit_weg' || secao === 'lista_ca'
  const [aba, setAba] = useState<'catalogo' | 'livre'>(isCatalogo ? 'catalogo' : 'livre')

  return (
    <div className="fixed inset-0 bg-noite/80 flex items-center justify-center p-4 z-50" onClick={onFechar}>
      <div
        className="bg-noite border border-white/10 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {secao === 'kit_weg' ? 'Adicionar equipamento no Kit WEG'
                : secao === 'lista_ca' ? 'Adicionar item na Lista CA'
                : 'Adicionar serviço avulso'}
            </h3>
            <p className="text-[11px] text-white/50 mt-0.5">
              {secao === 'kit_weg' ? 'Preço vem da tabela WEG vigente automaticamente. Kalebe pode digitar livre também.'
                : secao === 'lista_ca' ? 'Materiais complementares tributáveis. Preço da tabela ou digitado.'
                : 'Descrição livre + valor. Não passa pelo catálogo.'}
            </p>
          </div>
          <button onClick={onFechar} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </header>

        {isCatalogo && (
          <div className="px-4 pt-3 flex items-center gap-2">
            <button
              onClick={() => setAba('catalogo')}
              className={`text-[11px] px-3 py-1.5 rounded font-bold uppercase tracking-wider ${
                aba === 'catalogo' ? 'bg-sol/20 border border-sol/40 text-sol' : 'bg-white/[0.03] border border-white/10 text-white/60'
              }`}
            >
              🔍 Buscar no catálogo WEG
            </button>
            <button
              onClick={() => setAba('livre')}
              className={`text-[11px] px-3 py-1.5 rounded font-bold uppercase tracking-wider ${
                aba === 'livre' ? 'bg-sol/20 border border-sol/40 text-sol' : 'bg-white/[0.03] border border-white/10 text-white/60'
              }`}
            >
              ✏ Digitar livre
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {aba === 'catalogo' ? (
            <PainelCatalogo projetoId={projetoId} secao={secao} onFeito={onFechar} />
          ) : (
            <PainelLivre projetoId={projetoId} secao={secao} onFeito={onFechar} />
          )}
        </div>
      </div>
    </div>
  )
}

// ==========================================================
// Painel 1 — busca no catálogo com filtro por categoria
// ==========================================================
const CATEGORIAS_KIT_WEG = [
  { chave: 'placa', rotulo: 'Placas fotovoltaicas' },
  { chave: 'inversor', rotulo: 'Inversores' },
  { chave: 'bateria', rotulo: 'Baterias / BESS' },
  { chave: 'estrutura', rotulo: 'Estruturas' },
  { chave: 'cabo', rotulo: 'Cabos e conectores' },
  { chave: 'mc4', rotulo: 'MC4 / conectores CC' },
]
const CATEGORIAS_LISTA_CA = [
  { chave: 'cabo', rotulo: 'Cabos CA' },
  { chave: 'disjuntor', rotulo: 'Disjuntores' },
  { chave: 'dps', rotulo: 'DPS' },
  { chave: 'quadro', rotulo: 'Quadros' },
  { chave: 'string_box', rotulo: 'String Box' },
  { chave: 'outros', rotulo: 'Outros materiais' },
]

function PainelCatalogo({
  projetoId, secao, onFeito,
}: { projetoId: string; secao: SecaoExtra; onFeito: () => void }) {
  const categorias = secao === 'kit_weg' ? CATEGORIAS_KIT_WEG : CATEGORIAS_LISTA_CA
  const [categoria, setCategoria] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [produtos, setProdutos] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [selecionado, setSelecionado] = useState<any | null>(null)
  const [qtd, setQtd] = useState(1)
  const [salvando, startSalvar] = useTransition()

  useEffect(() => {
    setCarregando(true); setErro(null)
    const timer = setTimeout(async () => {
      const r = await buscarProdutosCatalogoAction({ categoria: categoria || undefined, q: busca || undefined, limit: 50 })
      if ('erro' in r) setErro(r.erro)
      else setProdutos(r.produtos)
      setCarregando(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [categoria, busca])

  function adicionar() {
    if (!selecionado || qtd <= 0) return
    setErro(null)
    startSalvar(async () => {
      const descricao = `${selecionado.fabricante ? selecionado.fabricante + ' ' : ''}${selecionado.modelo}`
      const r = await adicionarExtraAction(projetoId, {
        secao,
        descricao,
        valor: Number(selecionado.preco_venda) * qtd,
        qtd,
        unidade: 'un',
        produto_id: selecionado.id,
        modelo: selecionado.modelo,
        fabricante: selecionado.fabricante,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onFeito()
    })
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select
          value={categoria}
          onChange={(e) => { setCategoria(e.target.value); setSelecionado(null) }}
          className="px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
        >
          <option value="">Todas categorias</option>
          {categorias.map((c) => (
            <option key={c.chave} value={c.chave}>{c.rotulo}</option>
          ))}
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por modelo, fabricante ou código..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
        />
      </div>

      {/* Resultados */}
      <div className="max-h-72 overflow-y-auto border border-white/5 rounded">
        {carregando ? (
          <p className="p-4 text-xs text-white/40 italic text-center">Buscando...</p>
        ) : produtos.length === 0 ? (
          <p className="p-4 text-xs text-white/40 italic text-center">Nenhum produto pra esses filtros.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {produtos.map((p) => {
              const sel = selecionado?.id === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setSelecionado(p)}
                  className={`w-full text-left px-3 py-2 hover:bg-white/[0.03] transition ${sel ? 'bg-sol/[0.08] border-l-2 border-l-sol' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">
                        {p.fabricante && <span className="text-white/50 text-xs font-normal">{p.fabricante} · </span>}
                        {p.modelo}
                      </p>
                      <p className="text-[10px] text-white/40 truncate">
                        {p.categoria} {p.subcategoria && `· ${p.subcategoria}`}
                        {p.specs?.potencia_wp && ` · ${p.specs.potencia_wp}Wp`}
                        {p.specs?.potencia_kw && ` · ${p.specs.potencia_kw}kW`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-sol">{fmtBRL(p.preco_venda)}</p>
                      {p.disponivel_estoque > 0 && (
                        <p className="text-[9px] text-verde">{p.disponivel_estoque} em estoque</p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Barra confirmação — só aparece com produto selecionado */}
      {selecionado && (
        <div className="p-3 bg-sol/[0.06] border border-sol/30 rounded space-y-2">
          <p className="text-xs text-white/80">
            <strong className="text-sol">{selecionado.fabricante ? selecionado.fabricante + ' ' : ''}{selecionado.modelo}</strong>
            <span className="text-white/50"> · unit. {fmtBRL(selecionado.preco_venda)}</span>
          </p>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-white/60 uppercase tracking-wider font-bold">Qtd</label>
            <input
              type="number"
              min={1}
              value={qtd}
              onChange={(e) => setQtd(parseInt(e.target.value) || 1)}
              className="w-20 px-2 py-1 bg-noite/40 border border-white/10 rounded text-sm text-white"
            />
            <p className="flex-1 text-sm text-white/80">
              Total: <strong className="text-sol font-mono">{fmtBRL(Number(selecionado.preco_venda) * qtd)}</strong>
            </p>
            <button
              onClick={adicionar}
              disabled={salvando || qtd <= 0}
              className="px-4 py-2 bg-sol text-noite text-xs font-bold rounded disabled:opacity-40"
            >
              {salvando ? '...' : 'Adicionar item'}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-coral bg-coral/10 border border-coral/30 rounded p-2">{erro}</p>}
    </div>
  )
}

// ==========================================================
// Painel 2 — form livre (descrição + valor)
// ==========================================================
function PainelLivre({
  projetoId, secao, onFeito,
}: { projetoId: string; secao: SecaoExtra; onFeito: () => void }) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [qtd, setQtd] = useState('1')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()

  const val = parseFloat(valor.replace(',', '.')) || 0
  const q = parseInt(qtd) || 1

  function salvar() {
    setErro(null)
    startSalvar(async () => {
      const r = await adicionarExtraAction(projetoId, {
        secao,
        descricao: descricao.trim(),
        valor: val * q,
        qtd: q,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onFeito()
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold mb-1 text-white/50">Descrição</label>
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={secao === 'servicos' ? 'Ex: Consultoria adicional, brinde inaugural...' : 'Ex: Cabo especial 6mm² 50m'}
          className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-bold mb-1 text-white/50">Qtd</label>
          <input
            type="number"
            min={1}
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-bold mb-1 text-sol">Valor unitário (R$)</label>
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="500,00"
            className="w-full px-3 py-2 bg-sol/10 border border-sol/30 rounded text-sm text-white font-bold"
          />
        </div>
      </div>
      {val > 0 && q > 0 && (
        <p className="text-sm text-white/70">
          Total: <strong className="text-sol font-mono">{fmtBRL(val * q)}</strong>
        </p>
      )}
      {erro && <p className="text-xs text-coral bg-coral/10 border border-coral/30 rounded p-2">{erro}</p>}
      <div className="flex justify-end">
        <button
          onClick={salvar}
          disabled={salvando || !descricao.trim() || val <= 0}
          className="px-6 py-2.5 bg-sol text-noite text-sm font-bold rounded disabled:opacity-40"
        >
          {salvando ? 'Salvando...' : 'Adicionar item'}
        </button>
      </div>
    </div>
  )
}
