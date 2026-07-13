'use client'

import { useState, useMemo, useTransition } from 'react'
import { salvarListaCaAction } from '@/app/projetos/[id]/lista-ca/actions'
import { calcularSubtotais } from '@/lib/kit-auto/precificar-lista'
import { formatarMoedaBRL } from '@/lib/formatters'
import type { ItemKit } from '@/lib/kit-auto/montar-kit'

type Props = {
  projetoId: string
  itensIniciais: ItemKit[]
  regeneradoAutomatico: boolean
}

const CATEGORIAS_LABEL: Record<string, { icone: string; label: string }> = {
  // Complementares Spin
  cabo_terra: { icone: '🟢', label: 'Cabo terra' },
  eletroduto: { icone: '⚡', label: 'Eletroduto' },
  fixacao: { icone: '🔩', label: 'Fixação' },
  protecao: { icone: '🛡️', label: 'Proteção UV' },
  quadro: { icone: '📦', label: 'Quadro elétrico' },
  barramento: { icone: '📊', label: 'Barramento DIN' },
  terminal: { icone: '🔗', label: 'Terminal' },
  aterramento: { icone: '⚓', label: 'Aterramento' },
  sinalizacao: { icone: '🚧', label: 'Placa advertência' },
  // Legado (kits antigos ainda salvos)
  cabo_cc: { icone: '🔴', label: 'Cabo CC solar' },
  cabo_ca: { icone: '⚡', label: 'Cabo CA' },
  conector: { icone: '🔌', label: 'Conector' },
  disjuntor: { icone: '🛡️', label: 'Disjuntor' },
  dps: { icone: '⚠️', label: 'DPS' },
  estrutura: { icone: '🏗️', label: 'Estrutura' },
  identificacao: { icone: '🏷️', label: 'Identificação' },
  string_box: { icone: '📥', label: 'String box' },
  outro: { icone: '📋', label: 'Outro' },
}

const BADGE_ORIGEM: Record<string, { emoji: string; label: string; classe: string }> = {
  catalogo: { emoji: '📗', label: 'Catálogo', classe: 'bg-verde/10 text-verde border-verde/30' },
  manual: { emoji: '✏️', label: 'Manual', classe: 'bg-sol/10 text-sol border-sol/30' },
  sem_preco: { emoji: '⚠️', label: 'Sem preço', classe: 'bg-coral/10 text-coral border-coral/30' },
}

export function ListaCaForm({ projetoId, itensIniciais, regeneradoAutomatico }: Props) {
  const [itens, setItens] = useState<ItemKit[]>(itensIniciais)
  const [isPending, startTransition] = useTransition()
  const [cotandoDavi, setCotandoDavi] = useState(false)
  const [msgDavi, setMsgDavi] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const { totalGeral, semPreco } = useMemo(() => calcularSubtotais(itens), [itens])

  async function pedirCotacaoDavi() {
    if (cotandoDavi) return
    if (semPreco === 0) {
      setMsgDavi('Todos os itens já têm preço — nada pra cotar.')
      return
    }
    if (!window.confirm(`O Davi vai cotar online ${semPreco} ${semPreco === 1 ? 'item' : 'itens'} sem preço. Pode levar 1-3 minutos. Continuar?`)) return
    setCotandoDavi(true)
    setMsgDavi('👔 Davi está cotando online... isso pode levar alguns minutos.')
    setErro(null)
    try {
      const res = await fetch('/api/davi/cotar-lista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro no Davi')
      setItens(data.itens)
      const r = data.resumo
      let msg = `✓ Davi cotou ${r.cotacoes_encontradas} de ${r.sem_preco_antes} em ${(r.tempo_ms / 1000).toFixed(1)}s.`
      if (r.sem_preco_apos > 0) msg += ` Ainda faltam ${r.sem_preco_apos} sem preço.`
      if (r.erros_amostra?.length > 0) {
        msg += ` Erros: ${r.erros_amostra.map((e: any) => `"${e.descricao.slice(0, 30)}" → ${e.erro}`).join(' · ')}`
      }
      setMsgDavi(msg)
    } catch (e: any) {
      setErro(`Davi: ${e.message}`)
    } finally {
      setCotandoDavi(false)
    }
  }

  function alterarQtd(idx: number, novoValor: string) {
    const n = parseFloat(novoValor) || 0
    setItens((prev) => prev.map((item, i) => (i === idx ? { ...item, qtd: n } : item)))
  }

  function alterarDescricao(idx: number, novoValor: string) {
    setItens((prev) => prev.map((item, i) => (i === idx ? { ...item, descricao: novoValor } : item)))
  }

  function alterarPreco(idx: number, novoValor: string) {
    const n = parseFloat(novoValor.replace(',', '.')) || 0
    setItens((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, preco_unitario: n, origem_preco: 'manual' as const }
          : item,
      ),
    )
  }

  function removerItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  function adicionarItem() {
    setItens((prev) => [
      ...prev,
      {
        categoria: 'outro',
        subcategoria: 'personalizado',
        descricao: 'Novo item',
        qtd: 1,
        unidade: 'un',
        automatico: false,
        preco_unitario: 0,
        origem_preco: 'manual',
      },
    ])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (itens.length === 0) {
      setErro('Lista vazia. Adicione ao menos 1 item.')
      return
    }
    if (semPreco > 0) {
      const ok = window.confirm(
        `Você tem ${semPreco} ${semPreco === 1 ? 'item' : 'itens'} sem preço. O orçamento pode ficar subestimado. Continuar mesmo assim?`,
      )
      if (!ok) return
    }
    startTransition(async () => {
      const result = await salvarListaCaAction(projetoId, itens)
      if (result && !result.sucesso) setErro(result.erro || 'Erro ao salvar')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {regeneradoAutomatico && (
        <div className="bg-verde/10 border border-verde/30 rounded-lg p-4 text-sm text-white/80">
          ✨ <strong className="text-verde">Lista gerada automaticamente</strong> com base no kit escolhido,
          distância string-QGBT, tipo de telhado e isopleta da cidade. Preços buscados no catálogo — revise valores e quantidades.
        </div>
      )}

      {semPreco > 0 && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="text-xs text-coral flex items-center gap-2">
            ⚠️ <span><strong>{semPreco} {semPreco === 1 ? 'item' : 'itens'} sem preço</strong> — orçamento vai subestimar sem preencher.</span>
          </div>
          <button
            type="button"
            onClick={pedirCotacaoDavi}
            disabled={cotandoDavi}
            className="text-xs px-3 py-2 bg-weg-azul/20 border border-weg-azul/40 text-weg-azul font-bold rounded-lg hover:bg-weg-azul/30 disabled:opacity-40 whitespace-nowrap"
          >
            {cotandoDavi ? '👔 Cotando…' : '👔 Cotar via Davi (online)'}
          </button>
        </div>
      )}

      {msgDavi && (
        <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-lg p-3 text-xs text-weg-azul">
          {msgDavi}
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto -mx-6 md:-mx-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
              <th className="text-left py-2 px-3 md:px-6">Categoria</th>
              <th className="text-left py-2 px-3">Descrição</th>
              <th className="text-right py-2 px-3 w-20">Qtd</th>
              <th className="text-left py-2 px-3 w-14">Un</th>
              <th className="text-right py-2 px-3 w-28">Preço unit.</th>
              <th className="text-right py-2 px-3 w-28">Subtotal</th>
              <th className="text-center py-2 px-3 w-20">Origem</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item, idx) => {
              const cat = CATEGORIAS_LABEL[item.categoria] || CATEGORIAS_LABEL.outro
              const origemInfo = BADGE_ORIGEM[item.origem_preco || 'sem_preco'] || BADGE_ORIGEM.sem_preco
              const subtotal = (item.preco_unitario || 0) * (item.qtd || 0)
              return (
                <tr key={idx} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2 px-3 md:px-6">
                    <span className="text-xs text-white/60">{cat.icone} {cat.label}</span>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={item.descricao}
                      onChange={(e) => alterarDescricao(idx, e.target.value)}
                      className="w-full bg-transparent text-white text-sm focus:bg-white/[0.03] rounded px-2 py-1"
                    />
                    {item.observacao && (
                      <p className="text-[10px] text-white/40 mt-0.5 px-2">{item.observacao}</p>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.qtd}
                      onChange={(e) => alterarQtd(idx, e.target.value)}
                      className="w-16 bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-right text-white text-sm"
                    />
                  </td>
                  <td className="py-2 px-3 text-white/50 text-xs">{item.unidade}</td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.preco_unitario ?? 0}
                      onChange={(e) => alterarPreco(idx, e.target.value)}
                      placeholder="0,00"
                      className={`w-24 bg-white/[0.03] border rounded px-2 py-1 text-right text-sm ${
                        item.origem_preco === 'sem_preco' || !item.preco_unitario
                          ? 'border-coral/40 text-coral'
                          : 'border-white/10 text-white'
                      }`}
                    />
                  </td>
                  <td className="py-2 px-3 text-right text-sm font-bold text-white">
                    {formatarMoedaBRL(subtotal)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${origemInfo.classe}`}
                      title={item.origem_preco || 'sem_preco'}
                    >
                      {origemInfo.emoji} {origemInfo.label}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      onClick={() => removerItem(idx)}
                      className="text-coral hover:text-coral/80 text-lg"
                      title="Remover item"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-sol/40">
              <td colSpan={5} className="py-3 px-3 md:px-6 text-right text-xs uppercase tracking-wider font-bold text-white/70">
                Subtotal Lista CA
              </td>
              <td className="py-3 px-3 text-right">
                <span className="text-lg font-black text-sol">
                  {formatarMoedaBRL(totalGeral)}
                </span>
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
        <button
          type="button"
          onClick={adicionarItem}
          className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/70 hover:text-white hover:border-white/20"
        >
          + Adicionar item manual
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">
            {itens.length} itens · {semPreco > 0 ? <span className="text-coral">{semPreco} sem preço</span> : 'todos com preço ✓'}
          </span>
          {semPreco > 0 && (
            <button
              type="button"
              onClick={pedirCotacaoDavi}
              disabled={cotandoDavi}
              className="text-xs px-3 py-1.5 bg-weg-azul/20 border border-weg-azul/40 text-weg-azul font-bold rounded-lg hover:bg-weg-azul/30 disabled:opacity-40 whitespace-nowrap"
            >
              {cotandoDavi ? '👔 Cotando…' : '👔 Cotar via Davi'}
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-sm text-coral">
          ❌ {erro}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {isPending ? 'Salvando...' : 'Confirmar Lista CA → Passo 8 Orçamento'}
        </button>
      </div>
    </form>
  )
}
