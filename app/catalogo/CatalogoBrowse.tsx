'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

type Produto = {
  id: string
  modelo: string
  marca: string | null
  categoria: string
  subcategoria: string | null
  potencia_wp: number | null
  potencia_kw: number | null
  preco_venda: number | null
  disponivel_estoque: boolean
  descricao_publica: string | null
  imagem_url: string | null
}

type Props = {
  produtos: Produto[]
  termoInicial: string
  categoriaInicial: string | null
  erro: string | null
}

const CATEGORIA_LABEL: Record<string, { emoji: string; label: string }> = {
  placa:       { emoji: '☀️', label: 'Placas' },
  inversor:    { emoji: '🔌', label: 'Inversores' },
  bateria:     { emoji: '🔋', label: 'Baterias' },
  cabo:        { emoji: '🔗', label: 'Cabos' },
  estrutura:   { emoji: '🏗', label: 'Estrutura' },
  wallbox:     { emoji: '🚗', label: 'Wallbox / VE' },
  protecao:    { emoji: '🛡', label: 'Proteção' },
  acessorio:   { emoji: '⚙️', label: 'Acessórios' },
}

const fmtBRL = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export function CatalogoBrowse({ produtos, termoInicial, categoriaInicial, erro }: Props) {
  const [termo, setTermo] = useState(termoInicial)
  const [categoria, setCategoria] = useState<string | null>(categoriaInicial)

  const categorias = useMemo(() => {
    const set = new Set(produtos.map(p => p.categoria).filter(Boolean))
    return Array.from(set).sort()
  }, [produtos])

  const filtrados = useMemo(() => {
    let lista = produtos
    if (categoria) lista = lista.filter(p => p.categoria === categoria)
    if (termo.trim().length >= 1) {
      const t = termo.trim().toLowerCase()
      lista = lista.filter(p =>
        p.modelo?.toLowerCase().includes(t) ||
        p.marca?.toLowerCase().includes(t) ||
        p.subcategoria?.toLowerCase().includes(t)
      )
    }
    return lista
  }, [produtos, termo, categoria])

  const porCategoria = useMemo(() => {
    const grupos: Record<string, Produto[]> = {}
    for (const p of filtrados) {
      const c = p.categoria
      if (!grupos[c]) grupos[c] = []
      grupos[c].push(p)
    }
    return grupos
  }, [filtrados])

  return (
    <>
      {/* Barra de busca + filtros */}
      <div className="mb-6">
        <div className="flex gap-3 mb-3">
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por modelo, marca, subcategoria..."
            className="flex-1 bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-4 py-3 text-white text-sm focus:outline-none"
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoria(null)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              categoria === null
                ? 'bg-sol/20 border-sol/50 text-sol'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            Todas
          </button>
          {categorias.map(c => {
            const info = CATEGORIA_LABEL[c] || { emoji: '📎', label: c }
            return (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${
                  categoria === c
                    ? 'bg-sol/20 border-sol/50 text-sol'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span>{info.emoji}</span> {info.label}
              </button>
            )
          })}
        </div>
      </div>

      {erro && (
        <div className="bg-coral/10 border border-coral/30 text-coral rounded-xl p-4 mb-4 text-sm">
          {erro}
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/10 border-dashed rounded-xl p-10 text-center text-white/40 text-sm">
          Nenhum produto encontrado{termo ? ` pra "${termo}"` : ''}.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(porCategoria).map(([cat, itens]) => {
            const info = CATEGORIA_LABEL[cat] || { emoji: '📎', label: cat }
            return (
              <section key={cat}>
                <h2 className="text-xs uppercase tracking-widest font-bold text-sol mb-3 flex items-center gap-2">
                  <span>{info.emoji}</span> {info.label}
                  <span className="text-white/40 font-normal">· {itens.length}</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {itens.map(p => (
                    <CardProduto key={p.id} produto={p} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function CardProduto({ produto }: { produto: Produto }) {
  const potencia = produto.potencia_wp
    ? `${produto.potencia_wp}Wp`
    : produto.potencia_kw
      ? `${produto.potencia_kw}kW`
      : null

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col gap-2 hover:border-sol/40 transition">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          {produto.marca && (
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
              {produto.marca}
            </p>
          )}
          <p className="text-sm font-bold text-white truncate">{produto.modelo}</p>
          {produto.subcategoria && (
            <p className="text-[11px] text-white/50 mt-0.5">{produto.subcategoria}</p>
          )}
        </div>
        {potencia && (
          <span className="text-[10px] font-mono font-bold text-sol shrink-0">{potencia}</span>
        )}
      </div>

      {produto.descricao_publica && (
        <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2">
          {produto.descricao_publica}
        </p>
      )}

      <div className="flex items-baseline justify-between mt-auto pt-2 border-t border-white/5">
        <p className="text-sm font-mono font-bold text-white">
          {fmtBRL(produto.preco_venda)}
        </p>
        {produto.disponivel_estoque ? (
          <span className="text-[10px] uppercase tracking-wider font-bold text-verde bg-verde/10 px-2 py-0.5 rounded-full">
            estoque
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-bold text-white/40">
            sob demanda
          </span>
        )}
      </div>

      <Link
        href={`/projetos/novo?produto_id=${produto.id}&categoria=${produto.categoria}`}
        className="block text-center text-xs font-bold text-sol bg-sol/10 hover:bg-sol/20 border border-sol/30 rounded-lg py-2 mt-1 transition"
      >
        Criar projeto com esse item →
      </Link>
    </div>
  )
}
