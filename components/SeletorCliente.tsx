'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Cliente = {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cpf_cnpj: string | null
  tipo: 'pf' | 'pj'
  cidade?: string | null
}

export function SeletorCliente({
  onEscolher,
  clienteAtualId,
}: {
  onEscolher: (cliente: Cliente | null) => void
  clienteAtualId?: string
}) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(false)
  const [escolhido, setEscolhido] = useState<Cliente | null>(null)
  const [aberto, setAberto] = useState(false)

  // Pré-carrega cliente atual se editando
  useEffect(() => {
    if (!clienteAtualId) return
    const s = createClient()
    s.from('clientes')
      .select('id, razao_social, nome_fantasia, cpf_cnpj, tipo, cidade:endereco->cidade')
      .eq('id', clienteAtualId)
      .single()
      .then(({ data }) => {
        if (data) {
          setEscolhido(data as any)
          onEscolher(data as any)
        }
      })
  }, [clienteAtualId])

  useEffect(() => {
    if (busca.length < 2) {
      setResultados([])
      return
    }
    const timer = setTimeout(async () => {
      setCarregando(true)
      const s = createClient()
      const { data } = await s
        .from('clientes')
        .select('id, razao_social, nome_fantasia, cpf_cnpj, tipo, cidade:endereco->cidade')
        .eq('ativo', true)
        .or(`razao_social.ilike.%${busca}%,nome_fantasia.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%`)
        .limit(10)
      setResultados((data || []) as any)
      setCarregando(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [busca])

  function escolher(c: Cliente) {
    setEscolhido(c)
    onEscolher(c)
    setBusca('')
    setResultados([])
    setAberto(false)
  }

  function limpar() {
    setEscolhido(null)
    onEscolher(null)
  }

  if (escolhido) {
    return (
      <div className="p-3 bg-sol/10 border border-sol/40 rounded-lg flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span>{escolhido.tipo === 'pf' ? '👤' : '🏢'}</span>
            <p className="text-sm font-bold text-white truncate">{escolhido.razao_social}</p>
          </div>
          <p className="text-[10px] text-white/60">
            {escolhido.cpf_cnpj || 'sem doc'}
            {escolhido.cidade && ` · ${escolhido.cidade}`}
          </p>
        </div>
        <button
          type="button"
          onClick={limpar}
          className="text-xs text-white/50 hover:text-coral"
        >
          ✕ trocar
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        placeholder="🔍 Buscar cliente por nome, razão social ou CPF/CNPJ..."
        className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:border-sol/40 focus:outline-none"
      />

      {aberto && busca.length >= 2 && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-noite border border-white/10 rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {carregando && (
            <p className="p-3 text-xs text-white/40 text-center">Buscando...</p>
          )}
          {!carregando && resultados.length === 0 && (
            <p className="p-3 text-xs text-white/40 text-center">Nenhum cliente encontrado.</p>
          )}
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => escolher(c)}
              className="w-full text-left p-3 border-b border-white/5 hover:bg-white/[0.05] transition"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs">{c.tipo === 'pf' ? '👤' : '🏢'}</span>
                <p className="text-sm font-bold text-white truncate">{c.razao_social}</p>
              </div>
              <p className="text-[10px] text-white/50">
                {c.cpf_cnpj || 'sem doc'}
                {c.cidade && ` · ${c.cidade}`}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
