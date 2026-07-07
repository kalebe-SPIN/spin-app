'use client'

import { useState, useTransition } from 'react'
import { salvarListaCaAction } from '@/app/projetos/[id]/lista-ca/actions'
import type { ItemKit } from '@/lib/kit-auto/montar-kit'

type Props = {
  projetoId: string
  itensIniciais: ItemKit[]
  regeneradoAutomatico: boolean
}

const CATEGORIAS_LABEL: Record<string, { icone: string; label: string }> = {
  cabo_cc: { icone: '🔴', label: 'Cabo CC solar' },
  cabo_ca: { icone: '⚡', label: 'Cabo CA' },
  conector: { icone: '🔌', label: 'Conector' },
  disjuntor: { icone: '🛡️', label: 'Disjuntor' },
  dps: { icone: '⚠️', label: 'DPS' },
  estrutura: { icone: '🏗️', label: 'Estrutura' },
  aterramento: { icone: '⚓', label: 'Aterramento' },
  quadro: { icone: '📦', label: 'Quadro' },
  identificacao: { icone: '🏷️', label: 'Identificação' },
  string_box: { icone: '📥', label: 'String box' },
  outro: { icone: '📋', label: 'Outro' },
}

export function ListaCaForm({ projetoId, itensIniciais, regeneradoAutomatico }: Props) {
  const [itens, setItens] = useState<ItemKit[]>(itensIniciais)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function alterarQtd(idx: number, novoValor: string) {
    const n = parseFloat(novoValor) || 0
    setItens(prev => prev.map((item, i) => (i === idx ? { ...item, qtd: n } : item)))
  }

  function alterarDescricao(idx: number, novoValor: string) {
    setItens(prev => prev.map((item, i) => (i === idx ? { ...item, descricao: novoValor } : item)))
  }

  function removerItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx))
  }

  function adicionarItem() {
    setItens(prev => [
      ...prev,
      {
        categoria: 'outro',
        subcategoria: 'personalizado',
        descricao: 'Novo item',
        qtd: 1,
        unidade: 'un',
        automatico: false,
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
          distância string-QGBT, tipo de telhado e isopleta da cidade. Revise as quantidades antes de confirmar.
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto -mx-6 md:-mx-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
              <th className="text-left py-2 px-3 md:px-6">Categoria</th>
              <th className="text-left py-2 px-3">Descrição</th>
              <th className="text-right py-2 px-3 w-24">Qtd</th>
              <th className="text-left py-2 px-3 w-16">Un</th>
              <th className="text-center py-2 px-3 w-16">Auto</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item, idx) => {
              const cat = CATEGORIAS_LABEL[item.categoria] || CATEGORIAS_LABEL.outro
              return (
                <tr key={idx} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2 px-3 md:px-6">
                    <span className="text-xs text-white/60">{cat.icone} {cat.label}</span>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={item.descricao}
                      onChange={e => alterarDescricao(idx, e.target.value)}
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
                      onChange={e => alterarQtd(idx, e.target.value)}
                      className="w-20 bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-right text-white text-sm"
                    />
                  </td>
                  <td className="py-2 px-3 text-white/50 text-xs">{item.unidade}</td>
                  <td className="py-2 px-3 text-center">
                    {item.automatico ? (
                      <span className="text-[10px] text-sol font-bold">AUTO</span>
                    ) : (
                      <span className="text-[10px] text-verde font-bold">MAN</span>
                    )}
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
        </table>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={adicionarItem}
          className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/70 hover:text-white hover:border-white/20"
        >
          + Adicionar item manual
        </button>
        <span className="text-xs text-white/40">{itens.length} itens</span>
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
