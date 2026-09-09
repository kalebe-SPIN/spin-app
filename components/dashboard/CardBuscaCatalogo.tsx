'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Card "Catálogo" no dashboard — substitui o antigo "Orçamento Rápido".
 * Kalebe 2026-09-09: em vez de link, é um CAMPO. O usuário digita o termo
 * (modelo, marca, subcategoria) e enter/botão leva ao /catalogo já filtrado.
 * De lá cria projeto formal com o item escolhido.
 */
export function CardBuscaCatalogo({ etapa }: { etapa?: number }) {
  const router = useRouter()
  const [termo, setTermo] = useState('')

  function ir() {
    const q = termo.trim()
    router.push(q ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo')
  }

  return (
    <div className="relative p-5 rounded-xl border bg-gradient-to-br from-coral/10 to-sol/5 border-coral/40 hover:border-coral/70 transition-all flex flex-col">
      {typeof etapa === 'number' && (
        <span className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-sol text-noite text-xs font-black flex items-center justify-center shadow-lg ring-2 ring-noite">
          {etapa}
        </span>
      )}
      <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-coral bg-coral/10 border border-coral/30 px-2 py-0.5 rounded-full">
        Novo
      </span>

      <h3 className="text-base font-bold text-white mb-1.5">🛒 Catálogo</h3>
      <p className="text-xs text-white/60 leading-relaxed mb-3">
        Encontre placas, inversores, baterias e wallbox direto do catálogo. Depois
        crie o projeto formal a partir do item escolhido.
      </p>

      <div className="mt-auto flex gap-2">
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ir() }}
          placeholder="Buscar modelo, marca..."
          className="flex-1 bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
        />
        <button
          onClick={ir}
          className="px-4 py-2 rounded-lg bg-sol text-noite font-bold text-sm hover:bg-sol/80 transition shrink-0"
        >
          Abrir
        </button>
      </div>
    </div>
  )
}
