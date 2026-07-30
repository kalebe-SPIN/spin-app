'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  salvarServicoGenericoAction,
  type SubitemEscopo,
  type DetalhamentoInterno,
} from '@/app/projetos/[id]/servico/actions'
import { getInfoTipo, type TipoItem } from '@/lib/tipos-projeto'

type Props = {
  projetoId: string
  tipo: TipoItem
  dadosIniciais?: {
    descricao?: string
    subitens?: SubitemEscopo[]
    observacoes?: string
    valor_cliente?: number
    detalhamento_interno?: DetalhamentoInterno
  }
  podeVerMargem?: boolean // true = admin/gestor; false = vendedor/consultor
}

function formatarBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ServicoGenericoForm({ projetoId, tipo, dadosIniciais, podeVerMargem = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const info = getInfoTipo(tipo)

  const [descricao, setDescricao] = useState(dadosIniciais?.descricao ?? '')
  const [observacoes, setObservacoes] = useState(dadosIniciais?.observacoes ?? '')
  const [subitens, setSubitens] = useState<SubitemEscopo[]>(
    dadosIniciais?.subitens?.length ? dadosIniciais.subitens : [{ item: '', qtd: 1 }],
  )
  const [valorCliente, setValorCliente] = useState<number>(dadosIniciais?.valor_cliente ?? 0)

  // Detalhamento interno — todos os roles preenchem custo bruto; margem/comissão/imposto só admin
  const [maoDeObra, setMaoDeObra] = useState<number>(dadosIniciais?.detalhamento_interno?.mao_de_obra ?? 0)
  const [materiais, setMateriais] = useState<number>(dadosIniciais?.detalhamento_interno?.materiais ?? 0)
  const [deslocamento, setDeslocamento] = useState<number>(dadosIniciais?.detalhamento_interno?.deslocamento ?? 0)
  const [margem, setMargem] = useState<number>(dadosIniciais?.detalhamento_interno?.margem ?? 0)
  const [comissao, setComissao] = useState<number>(dadosIniciais?.detalhamento_interno?.comissao ?? 0)
  const [impostos, setImpostos] = useState<number>(dadosIniciais?.detalhamento_interno?.impostos ?? 0)

  const custoBruto = maoDeObra + materiais + deslocamento
  const custoTotal = custoBruto + margem + comissao + impostos

  function addSubitem() {
    setSubitens([...subitens, { item: '', qtd: 1 }])
  }
  function removeSubitem(idx: number) {
    setSubitens(subitens.filter((_, i) => i !== idx))
  }
  function updateSubitem(idx: number, campo: keyof SubitemEscopo, valor: string | number) {
    setSubitens(subitens.map((s, i) => (i === idx ? { ...s, [campo]: valor } : s)))
  }

  function handleSalvar() {
    setErro(null)

    const detalhamento: DetalhamentoInterno = {
      mao_de_obra: maoDeObra || undefined,
      materiais: materiais || undefined,
      deslocamento: deslocamento || undefined,
      // Só grava margem/comissão/impostos se o role tem permissão
      ...(podeVerMargem
        ? {
            margem: margem || undefined,
            comissao: comissao || undefined,
            impostos: impostos || undefined,
          }
        : {}),
    }

    startTransition(async () => {
      const res = await salvarServicoGenericoAction(
        projetoId,
        { tipo, descricao, subitens, observacoes },
        valorCliente,
        detalhamento,
      )
      if ('erro' in res && res.erro) {
        setErro(res.erro)
        return
      }
      router.push(`/projetos/${projetoId}`)
    })
  }

  if (!info) return <div className="text-coral">Tipo de item desconhecido: {tipo}</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <div className="text-3xl">{info.emoji}</div>
          <div>
            <h2 className="text-xl font-bold">{info.label}</h2>
            <p className="text-sm text-white/60 mt-1">{info.descricao}</p>
            <p className="text-xs text-white/40 mt-1 italic">Ex: {info.exemploUso}</p>
          </div>
        </div>
      </div>

      {/* Descrição do escopo */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-white/60 font-bold mb-2">
            Descrição do escopo *
          </label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={`Descreva o que a SPIN vai fornecer. Ex: ${info.exemploUso}`}
            rows={3}
            className="w-full rounded-lg bg-noite/50 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-sol/50"
          />
        </div>

        {/* Subitens (quantidades) */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-white/60 font-bold mb-2">
            Subitens do escopo (opcional)
          </label>
          <div className="space-y-2">
            {subitens.map((s, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={s.item}
                  onChange={(e) => updateSubitem(idx, 'item', e.target.value)}
                  placeholder="Ex: Base concreto 2×2m para inversor"
                  className="flex-1 rounded-lg bg-noite/50 border border-white/10 px-3 py-1.5 text-sm focus:outline-none focus:border-sol/50"
                />
                <input
                  type="number"
                  min={1}
                  value={s.qtd}
                  onChange={(e) => updateSubitem(idx, 'qtd', Number(e.target.value))}
                  className="w-20 rounded-lg bg-noite/50 border border-white/10 px-3 py-1.5 text-sm text-center focus:outline-none focus:border-sol/50"
                />
                {subitens.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSubitem(idx)}
                    className="text-coral/70 hover:text-coral text-xs px-2"
                    title="Remover"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSubitem}
            className="mt-2 text-xs text-sol hover:text-sol/80"
          >
            + adicionar subitem
          </button>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-white/60 font-bold mb-2">
            Observações internas (opcional)
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Notas técnicas, cuidados, prazos… — não aparece na proposta pro cliente"
            rows={2}
            className="w-full rounded-lg bg-noite/50 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-sol/50"
          />
        </div>
      </div>

      {/* Custo interno (visão SPIN) */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-wider text-white/60 font-bold">
            🔒 Custo interno (visão SPIN)
          </h3>
          <span className="text-[10px] text-white/40 italic">Cliente nunca vê essa seção</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <CampoValor label="Mão de obra" valor={maoDeObra} onChange={setMaoDeObra} />
          <CampoValor label="Materiais" valor={materiais} onChange={setMateriais} />
          <CampoValor label="Deslocamento" valor={deslocamento} onChange={setDeslocamento} />
        </div>

        {podeVerMargem ? (
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
            <CampoValor label="Margem" valor={margem} onChange={setMargem} />
            <CampoValor label="Comissão" valor={comissao} onChange={setComissao} />
            <CampoValor label="Impostos" valor={impostos} onChange={setImpostos} />
          </div>
        ) : (
          <div className="pt-3 border-t border-white/5 text-xs text-white/40 italic">
            Margem, comissão e impostos são geridos pelo admin/gestor — não visíveis pra este perfil.
          </div>
        )}

        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-sm">
          <span className="text-white/60">Custo bruto SPIN</span>
          <span className="font-mono">R$ {formatarBRL(custoBruto)}</span>
        </div>
        {podeVerMargem && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Custo total (bruto + margem + comissão + imposto)</span>
            <span className="font-mono">R$ {formatarBRL(custoTotal)}</span>
          </div>
        )}
      </div>

      {/* Valor pro cliente */}
      <div className="rounded-xl border border-sol/30 bg-sol/5 p-5">
        <label className="block text-xs uppercase tracking-wider text-sol font-bold mb-2">
          Valor total pro cliente *
        </label>
        <div className="flex items-baseline gap-2">
          <span className="text-white/50">R$</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={valorCliente}
            onChange={(e) => setValorCliente(Number(e.target.value))}
            className="flex-1 text-2xl font-bold bg-transparent border-b border-sol/30 focus:outline-none focus:border-sol"
          />
        </div>
        <p className="text-xs text-white/50 mt-2">
          Este é o valor que aparece na proposta pro cliente — sem decomposição.
        </p>
      </div>

      {erro && (
        <div className="rounded-lg bg-coral/10 border border-coral/30 p-3 text-sm text-coral">
          {erro}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.push(`/projetos/${projetoId}`)}
          disabled={isPending}
          className="px-4 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/5 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSalvar}
          disabled={isPending}
          className="px-6 py-2 rounded-lg text-sm font-bold bg-sol text-noite hover:bg-sol/90 disabled:opacity-50"
        >
          {isPending ? 'Salvando…' : 'Salvar escopo'}
        </button>
      </div>
    </div>
  )
}

function CampoValor({
  label,
  valor,
  onChange,
}: {
  label: string
  valor: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</label>
      <div className="flex items-baseline gap-1">
        <span className="text-xs text-white/40">R$</span>
        <input
          type="number"
          step="0.01"
          min={0}
          value={valor}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 rounded-md bg-noite/50 border border-white/10 px-2 py-1 text-sm text-right focus:outline-none focus:border-sol/50"
        />
      </div>
    </div>
  )
}
