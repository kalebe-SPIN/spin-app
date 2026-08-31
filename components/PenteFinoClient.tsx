'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  normalizarFabricanteAction,
  normalizarCategoriasAction,
  normalizarDescricaoCurtaAction,
  normalizarCodigoInternoAction,
  normalizarSpecsVaziasAction,
  normalizarTudoAction,
} from '@/app/admin/catalogo/pente-fino/actions'

type Diagnostico = {
  total_produtos: number
  ativos: number
  sem_fabricante: number
  sem_categoria: number
  sem_subcategoria: number
  sem_descricao: number
  sem_codigo_interno: number
  sem_specs: number
  ativos_sem_preco: number
  ativos_sem_preco_por_cat: Record<string, number>
}

type Props = {
  diagnostico: Diagnostico
  amostraSemPreco: Array<{ id: string; modelo: string; categoria: string; codigo_weg: string }>
}

export function PenteFinoClient({ diagnostico: d, amostraSemPreco }: Props) {
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function executar(fn: () => Promise<any>, nome: string) {
    setErro(null); setResultado(null)
    startTransition(async () => {
      try {
        const r = await fn()
        if ('erro' in r && r.erro) setErro(r.erro)
        else setResultado(`✓ ${nome} — ${JSON.stringify(r).slice(0, 200)}`)
      } catch (e: any) {
        setErro(e?.message || 'Erro')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Ação em bloco — pente fino completo */}
      <section className="p-5 bg-sol/5 border border-sol/40 rounded-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">🧹 Pente fino completo</h2>
            <p className="text-xs text-white/60">
              Roda todas as normalizações abaixo em sequência. Seguro (idempotente).
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => executar(normalizarTudoAction, 'pente fino completo')}
            className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
          >
            {isPending ? '⏳ Rodando...' : '▶ Rodar tudo agora'}
          </button>
        </div>
        {resultado && (
          <div className="mt-3 p-3 bg-verde/10 border border-verde/30 rounded text-xs text-verde font-mono break-all">
            {resultado}
          </div>
        )}
        {erro && (
          <div className="mt-3 p-3 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
            ⚠ {erro}
          </div>
        )}
      </section>

      {/* Grid de problemas */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProblemaCard
          titulo="Sem fabricante"
          descricao="Vou setar tudo como 'WEG'"
          count={d.sem_fabricante}
          disabled={isPending}
          onCorrigir={() => executar(normalizarFabricanteAction, 'fabricante')}
        />
        <ProblemaCard
          titulo="Sem categoria/subcategoria"
          descricao="Vou setar categoria='outro' + subcategoria='sem_categoria'"
          count={d.sem_categoria + d.sem_subcategoria}
          disabled={isPending}
          onCorrigir={() => executar(normalizarCategoriasAction, 'categorias')}
        />
        <ProblemaCard
          titulo="Sem descrição curta"
          descricao="Vou copiar o modelo pra descricao_curta"
          count={d.sem_descricao}
          disabled={isPending}
          onCorrigir={() => executar(normalizarDescricaoCurtaAction, 'descrição')}
        />
        <ProblemaCard
          titulo="Sem código interno SPIN"
          descricao="Vou gerar 'SPIN-' + código_weg"
          count={d.sem_codigo_interno}
          disabled={isPending}
          onCorrigir={() => executar(normalizarCodigoInternoAction, 'código interno')}
        />
        <ProblemaCard
          titulo="Sem specs"
          descricao="Vou setar specs = {} pra não quebrar leitores"
          count={d.sem_specs}
          disabled={isPending}
          onCorrigir={() => executar(normalizarSpecsVaziasAction, 'specs')}
        />
      </section>

      {/* Preços — só listagem, não tem fix automático (precisa cadastro manual) */}
      <section className="p-5 bg-coral/5 border border-coral/40 rounded-xl">
        <h2 className="text-lg font-bold text-white mb-2">💰 Produtos ATIVOS sem preço vigente</h2>
        <p className="text-xs text-white/60 mb-4">
          <strong className="text-coral">{d.ativos_sem_preco}</strong> produtos ativos não têm
          preço em <code className="text-sol">precos_produtos</code> ou o preço está R$ 0,00.
          Isso é a principal causa de zerar linhas no kit. Cadastre preço manualmente ou reimporte a planilha WEG.
        </p>

        {/* Distribuição por categoria */}
        {Object.keys(d.ativos_sem_preco_por_cat).length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] uppercase font-bold text-white/50 mb-2">Sem preço por categoria:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.ativos_sem_preco_por_cat)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, n]) => (
                  <span key={cat}
                    className="text-[11px] px-2 py-1 rounded bg-white/[0.03] border border-white/10 text-white/70">
                    <code className="text-coral">{cat}</code>: {n}
                  </span>
                ))}
            </div>
          </div>
        )}

        {amostraSemPreco.length > 0 && (
          <>
            <p className="text-[10px] uppercase font-bold text-white/50 mb-2">Primeiros 20:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-white/40">
                  <tr>
                    <th className="text-left py-1.5 px-2">Modelo</th>
                    <th className="text-left py-1.5 px-2">Categoria</th>
                    <th className="text-left py-1.5 px-2">Cód WEG</th>
                    <th className="text-right py-1.5 px-2">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {amostraSemPreco.map((p) => (
                    <tr key={p.id} className="text-white/70">
                      <td className="py-1.5 px-2">{p.modelo}</td>
                      <td className="py-1.5 px-2"><code className="text-[10px] text-white/50">{p.categoria}</code></td>
                      <td className="py-1.5 px-2"><code className="text-[10px] text-white/50">{p.codigo_weg}</code></td>
                      <td className="py-1.5 px-2 text-right">
                        <Link href={`/admin/catalogo`} className="text-[10px] text-sol hover:underline">
                          editar →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="text-xs text-white/50">
        <p>💡 <strong>Fluxo recomendado:</strong> 1) clica 'Rodar tudo' pra normalizar campos vazios;
          2) resolver os produtos ATIVOS sem preço (cadastrar preço no /admin/catalogo ou reimportar
          a planilha WEG com preços corretos); 3) monta um kit novo pra validar.
        </p>
      </section>
    </div>
  )
}

function ProblemaCard({
  titulo, descricao, count, disabled, onCorrigir,
}: {
  titulo: string
  descricao: string
  count: number
  disabled: boolean
  onCorrigir: () => void
}) {
  const ok = count === 0
  return (
    <div className={`p-4 rounded-lg border ${ok ? 'bg-verde/5 border-verde/30' : 'bg-coral/5 border-coral/40'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className={`text-sm font-bold ${ok ? 'text-verde' : 'text-coral'}`}>
          {ok ? '✅' : '⚠'} {titulo}
        </h3>
        <span className={`text-2xl font-black ${ok ? 'text-verde' : 'text-coral'}`}>{count}</span>
      </div>
      <p className="text-[11px] text-white/60 mb-3">{descricao}</p>
      {!ok && (
        <button
          type="button"
          disabled={disabled}
          onClick={onCorrigir}
          className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
        >
          Corrigir agora
        </button>
      )}
    </div>
  )
}
