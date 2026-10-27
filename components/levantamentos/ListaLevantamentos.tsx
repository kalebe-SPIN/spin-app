'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CURTO_FINALIDADE, FILTROS_EQUIPE, FINALIDADES } from '@/lib/levantamentos/comum'
import { numeroLevantamento, type Finalidade, type StatusLevantamento } from '@/lib/levantamentos/types'
import type { ModeloParaEscolha } from '@/lib/levantamentos/servidor'
import { AtualizaAoMudar, BarraProgresso, EtiquetaStatus, cardCls } from './ui'
import { NovoLevantamento } from './NovoLevantamento'

export type ItemLista = {
  id: string
  numero: number
  finalidade: Finalidade
  status: StatusLevantamento
  cliente_nome: string
  cidade: string
  progresso: number
  updated_at: string
  consultor: string | null
  projeto_codigo: string | null
  pendencias_projetista: number
}

const CHAVE_ABA = 'lev_aba'

export function ListaLevantamentos({ itens, modelos, ehEquipe, podeCriar }: {
  itens: ItemLista[]
  modelos: ModeloParaEscolha[]
  ehEquipe: boolean
  podeCriar: boolean
}) {
  const [aba, setAba] = useState<'todos' | Finalidade>('todos')
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  useEffect(() => {
    try {
      const a = localStorage.getItem(CHAVE_ABA)
      if (a === 'todos' || FINALIDADES.includes(a as Finalidade)) setAba(a as 'todos' | Finalidade)
    } catch {}
  }, [])
  const escolherAba = (a: 'todos' | Finalidade) => { setAba(a); try { localStorage.setItem(CHAVE_ABA, a) } catch {} }

  const statusDoFiltro = FILTROS_EQUIPE.find((f) => f.id === filtro)?.status || null
  const termo = busca.trim().toLowerCase()
  const daAba = itens.filter((i) => aba === 'todos' || i.finalidade === aba)
  const visiveis = useMemo(() => daAba.filter((i) =>
    (!statusDoFiltro || statusDoFiltro.includes(i.status)) &&
    (!termo || `${i.cliente_nome} ${i.cidade} ${numeroLevantamento(i.numero)} ${i.projeto_codigo || ''} ${i.consultor || ''}`.toLowerCase().includes(termo)),
  ), [daAba, statusDoFiltro, termo])

  return (
    <div className="space-y-4">
      <AtualizaAoMudar />
      {podeCriar && <NovoLevantamento modelos={modelos} />}

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {(['todos', ...FINALIDADES] as const).map((a) => {
          const n = itens.filter((i) => a === 'todos' || i.finalidade === a).length
          const on = aba === a
          return (
            <button key={a} role="tab" aria-selected={on} type="button" onClick={() => escolherAba(a)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-semibold whitespace-nowrap ${on ? 'bg-sol text-noite border-transparent' : 'border-white/15 text-white/70'}`}>
              {a === 'todos' ? 'Todos' : CURTO_FINALIDADE[a]} <span className="opacity-70 text-xs">{n}</span>
            </button>
          )
        })}
      </div>

      {ehEquipe && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTROS_EQUIPE.map((f) => {
            const n = f.status ? daAba.filter((i) => f.status!.includes(i.status)).length : daAba.length
            const on = filtro === f.id
            return (
              <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
                className={`px-2.5 py-1 rounded-full border text-xs whitespace-nowrap ${on ? 'border-sol text-white font-semibold' : 'border-white/15 text-white/60'}`}>
                {f.rotulo} <span className="opacity-70">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {itens.length > 8 && (
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, cidade, nº ou projeto"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none" />
      )}

      {!visiveis.length ? (
        <div className="rounded-xl border border-dashed border-white/15 p-5 space-y-1">
          <p className="font-bold text-white">Nenhum levantamento{aba !== 'todos' ? ` de “${modelos.find((m) => m.codigo === aba)?.nome || CURTO_FINALIDADE[aba]}”` : ''}{statusDoFiltro || termo ? ' com esse filtro' : ' ainda'}.</p>
          <p className="text-sm text-white/60">
            {podeCriar
              ? 'Toque em “Novo levantamento”, escolha a finalidade, confira os dados que vieram do projeto e conceda o acesso a quem vai fazer a visita.'
              : 'Quando o admin liberar o levantamento da visita técnica, ele aparece aqui e você recebe o link no sino. As fotos podem ser tiradas na hora pelo celular; o que você preencher fica salvo sozinho.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {visiveis.map((i) => (
            <li key={i.id}>
              <Link href={`/levantamentos/${i.id}`} className={`${cardCls} block hover:border-sol/40 transition space-y-2`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="font-bold text-white text-base min-w-0 break-words">{i.cliente_nome || 'Sem nome'}</span>
                  <EtiquetaStatus status={i.status} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/55">
                  <span>{numeroLevantamento(i.numero)}</span>
                  <span>{CURTO_FINALIDADE[i.finalidade]}</span>
                  {i.cidade && <span>{i.cidade}</span>}
                  {i.projeto_codigo && <span>Projeto {i.projeto_codigo}</span>}
                  {i.consultor && <span>{i.consultor}</span>}
                  <span>{i.progresso}% · {new Date(i.updated_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  {i.status === 'com_pendencia' && i.pendencias_projetista > 0 && (
                    <span className="text-white/80">⚠ {i.pendencias_projetista} pendência{i.pendencias_projetista > 1 ? 's' : ''} para corrigir</span>
                  )}
                </div>
                <BarraProgresso pct={i.progresso} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
