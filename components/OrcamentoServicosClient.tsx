'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getInfoTipo, type TipoItem } from '@/lib/tipos-projeto'

type Item = {
  id: string
  tipo: string
  titulo: string | null
  valor_estimado: number | null
  dados: any
}

type Props = {
  projeto: any
  itens: Item[]
  configEmpresa: any
}

type CondicaoPagamento = {
  id: string
  label: string
  desconto_perc: number    // desconto sobre o total (%)
  parcelas: number
  descricao: string
}

const CONDICOES_DEFAULT: CondicaoPagamento[] = [
  { id: 'vista_pix', label: 'À vista (PIX/transferência)', desconto_perc: 5, parcelas: 1, descricao: 'Pagamento único com 5% de desconto.' },
  { id: 'entrada_saldo', label: 'Entrada + saldo', desconto_perc: 3, parcelas: 2, descricao: '50% na aprovação + 50% no início do serviço.' },
  { id: '3x_cartao', label: '3× no cartão', desconto_perc: 0, parcelas: 3, descricao: 'Sem juros no cartão de crédito.' },
  { id: '6x_cartao', label: '6× no cartão', desconto_perc: -3, parcelas: 6, descricao: 'Acréscimo de 3% de taxa. Sem entrada.' },
  { id: '12x_cartao', label: '12× no cartão', desconto_perc: -7, parcelas: 12, descricao: 'Acréscimo de 7% de taxa. Sem entrada.' },
]

export function OrcamentoServicosClient({ projeto, itens, configEmpresa }: Props) {
  const [condicoesSelecionadas, setCondicoes] = useState<string[]>(['vista_pix', 'entrada_saldo', '3x_cartao'])
  const [observacoes, setObservacoes] = useState('')
  const [validadeDias, setValidadeDias] = useState(15)

  const subtotal = useMemo(
    () => itens.reduce((s, i) => s + (parseFloat(String(i.valor_estimado)) || 0), 0),
    [itens],
  )

  function toggleCondicao(id: string) {
    setCondicoes((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  const dataProposta = new Date().toLocaleDateString('pt-BR')
  const dataValidade = new Date(Date.now() + validadeDias * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna esquerda: itens + condições (2/3) */}
      <div className="lg:col-span-2 space-y-6">
        {/* Header explicativo */}
        <div className="bg-verde/10 border border-verde/30 rounded-xl p-4">
          <p className="text-xs text-white/80">
            ✅ <strong>Proposta de serviço</strong> — sem componentes fotovoltaicos.
            Todos os itens já estão precificados com base nos parâmetros configurados
            em <code className="text-sol">/admin/precificacao/servicos</code>.
          </p>
        </div>

        {/* Lista de módulos/itens */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-4">
            📦 Módulos da proposta ({itens.length})
          </p>
          <div className="space-y-2">
            {itens.map((it) => {
              const info = getInfoTipo(it.tipo as TipoItem)
              const valor = parseFloat(String(it.valor_estimado)) || 0
              return (
                <div key={it.id} className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl shrink-0">{info?.emoji || '📋'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white">
                          {it.titulo || info?.label || it.tipo}
                        </p>
                        {info?.descricao && (
                          <p className="text-[10px] text-white/50 mt-0.5">{info.descricao}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-lg font-bold text-verde shrink-0">
                      {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Condições de pagamento */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-1">
            💳 Condições de pagamento
          </p>
          <p className="text-[10px] text-white/50 mb-4">
            Marque quais aparecerão na proposta pro cliente escolher.
          </p>
          <div className="space-y-2">
            {CONDICOES_DEFAULT.map((c) => {
              const selecionado = condicoesSelecionadas.includes(c.id)
              const valorFinal = subtotal * (1 - c.desconto_perc / 100)
              const valorParcela = valorFinal / c.parcelas

              return (
                <label
                  key={c.id}
                  className={`block p-3 rounded-lg border cursor-pointer transition ${
                    selecionado
                      ? 'bg-sol/10 border-sol/40'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => toggleCondicao(c.id)}
                      className="mt-1 w-4 h-4 accent-sol shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
                        <p className="text-sm font-bold text-white">{c.label}</p>
                        <div className="text-right">
                          <p className="text-sm font-bold text-verde">
                            {valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          {c.parcelas > 1 && (
                            <p className="text-[10px] text-white/60">
                              {c.parcelas}× de {valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-white/50">{c.descricao}</p>
                      {c.desconto_perc > 0 && (
                        <span className="inline-block text-[10px] font-bold text-verde bg-verde/10 border border-verde/30 rounded px-1.5 py-0.5 mt-1">
                          {c.desconto_perc}% OFF
                        </span>
                      )}
                      {c.desconto_perc < 0 && (
                        <span className="inline-block text-[10px] font-bold text-coral bg-coral/10 border border-coral/30 rounded px-1.5 py-0.5 mt-1">
                          +{-c.desconto_perc}% de acréscimo
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </section>

        {/* Observações + validade */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-4">
            📝 Detalhes da proposta
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Validade (dias)</label>
              <input
                type="number"
                min={1}
                value={validadeDias}
                onChange={(e) => setValidadeDias(parseInt(e.target.value) || 15)}
                className="w-32 px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
              />
              <p className="text-[10px] text-white/40 mt-1">
                Proposta válida até <strong>{dataValidade}</strong>
              </p>
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Observações (opcional)</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Ex: prazo de execução, requisitos específicos, condições especiais..."
                className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Coluna direita: preview + acoes (1/3, sticky) */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <div className="bg-gradient-to-br from-verde/10 to-sol/5 border border-verde/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-bold text-verde mb-3">
            💰 Resumo da proposta
          </p>

          <div className="space-y-1 mb-3 text-xs text-white/70">
            <div className="flex justify-between">
              <span>Cliente</span>
              <span className="text-white font-bold truncate max-w-[60%]">{projeto.cliente_razao_social}</span>
            </div>
            <div className="flex justify-between">
              <span>Projeto</span>
              <span className="text-white font-mono">{projeto.codigo}</span>
            </div>
            <div className="flex justify-between">
              <span>Data</span>
              <span className="text-white">{dataProposta}</span>
            </div>
            <div className="flex justify-between">
              <span>Módulos</span>
              <span className="text-white">{itens.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Condições</span>
              <span className="text-white">{condicoesSelecionadas.length} formas</span>
            </div>
          </div>

          <div className="p-3 bg-verde/20 rounded-lg mb-3">
            <p className="text-[10px] uppercase text-noite/80 font-bold">Valor total (sem descontos)</p>
            <p className="text-2xl font-black text-noite">
              {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href={`/projetos/${projeto.id}/proposta`}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-sol text-noite font-bold text-sm rounded-lg hover:bg-sol/90 transition"
            >
              📄 Gerar PDF da proposta →
            </Link>
            <Link
              href={`/projetos/${projeto.id}`}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg hover:bg-white/10 transition"
            >
              ← Voltar ao projeto
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
