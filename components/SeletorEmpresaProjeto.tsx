'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { definirEmpresaProjetoAction } from '@/app/projetos/[id]/kit/actions'

/**
 * De qual CNPJ é a proposta do projeto (Kalebe 2026-10-22 — multiempresa):
 * a empresa define o fornecedor (catálogo do kit) e a marca do PDF.
 */
export function SeletorEmpresaProjeto({ projetoId, empresaId, empresas, temKit }: {
  projetoId: string
  empresaId: string | null
  empresas: Array<{ id: string; nome: string; cnpj: string | null; fornecedor: string | null }>
  temKit: boolean
}) {
  const router = useRouter()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function trocar(id: string) {
    if (!id || id === empresaId) return
    if (temKit && !confirm('O kit atual foi montado com o catálogo da outra empresa. Trocando, escolha o kit de novo com os produtos do fornecedor dela. Continuar?')) return
    setErro(null); setSalvando(true)
    try {
      const r = await definirEmpresaProjetoAction(projetoId, id)
      if ('erro' in r) { setErro(r.erro); return }
      router.refresh()
    } finally { setSalvando(false) }
  }

  return (
    <div className="mt-3 max-w-xl space-y-1">
      <label className="block">
        <span className="block text-[11px] font-bold text-white/60 mb-1">Empresa da proposta (CNPJ)</span>
        <select value={empresaId || ''} onChange={(e) => trocar(e.target.value)} disabled={salvando}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm disabled:opacity-50">
          {empresas.map((x) => (
            <option key={x.id} value={x.id} className="bg-noite">{x.nome}{x.cnpj ? ` · CNPJ ${x.cnpj}` : ''}{x.fornecedor ? ` · ${x.fornecedor}` : ''}</option>
          ))}
        </select>
        <span className="block text-[10px] text-white/45 mt-1">Define o fornecedor (placas, inversores e itens do kit) e a marca do PDF.</span>
      </label>
      {erro && <p className="text-[11px] text-white/80 border border-coral/45 rounded-lg px-2 py-1">⚠ {erro}</p>}
    </div>
  )
}
