'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  moverTelhadoFaseAction,
  excluirTelhadoAction,
  type TelhadoFase,
} from '@/app/crm/servicos/actions'
import { NovoTelhadoModal } from './NovoTelhadoModal'

export type TelhadoCard = {
  id: string
  fase: TelhadoFase
  endereco: string
  bairro: string | null
  cidade: string | null
  qtd_placas_estimada: number | null
  potencia_kwp_estimada: number | null
  foto_url: string
  cliente_nome: string | null
  cliente_telefone: string | null
  ultima_interacao_em: string | null
  criado_em: string
}

const COLUNAS: { fase: TelhadoFase; titulo: string; sub: string; cor: string }[] = [
  { fase: 'prospeccao', titulo: 'Prospecção', sub: 'avistado, sem contato', cor: 'text-white/70 border-white/15' },
  { fase: 'contato',    titulo: 'Contato',    sub: 'ligou / mandou WhatsApp', cor: 'text-weg-azul border-weg-azul/40' },
  { fase: 'proposta',   titulo: 'Proposta',   sub: 'orçamento enviado', cor: 'text-sol border-sol/40' },
  { fase: 'fechado',    titulo: 'Fechado',    sub: 'virou cliente', cor: 'text-verde border-verde/40' },
]

export function KanbanTelhados({
  telhados,
  bucketPublicUrl,
}: {
  telhados: TelhadoCard[]
  bucketPublicUrl: string
}) {
  const [novoAberto, setNovoAberto] = useState(false)

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-white">
            CRM — <span className="text-sol">Prospecção de telhados</span>
          </h1>
          <p className="text-white/50 text-xs mt-0.5">
            {telhados.length} telhado{telhados.length === 1 ? '' : 's'} no funil ·
            Perdidos ficam ocultos (tag lateral, disponível no card).
          </p>
        </div>
        <button
          onClick={() => setNovoAberto(true)}
          className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro shadow-lg shadow-sol/20"
        >
          + Novo telhado
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUNAS.map((col) => {
          const cardsDaColuna = telhados.filter((t) => t.fase === col.fase)
          return (
            <div key={col.fase} className={`bg-white/[0.02] border rounded-xl overflow-hidden ${col.cor}`}>
              <div className="px-4 py-3 border-b border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm">{col.titulo}</p>
                  <span className="text-[11px] px-2 py-0.5 bg-white/5 rounded-full text-white/60 font-mono">
                    {cardsDaColuna.length}
                  </span>
                </div>
                <p className="text-[10px] text-white/40 mt-0.5">{col.sub}</p>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {cardsDaColuna.length === 0 ? (
                  <p className="text-[11px] text-white/30 text-center py-6 italic">vazio</p>
                ) : (
                  cardsDaColuna.map((t) => (
                    <CardTelhado key={t.id} telhado={t} bucketPublicUrl={bucketPublicUrl} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {novoAberto && <NovoTelhadoModal onFechar={() => setNovoAberto(false)} />}
    </>
  )
}

function CardTelhado({ telhado, bucketPublicUrl }: { telhado: TelhadoCard; bucketPublicUrl: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mostrarAcoes, setMostrarAcoes] = useState(false)

  const fotoSrc = telhado.foto_url.startsWith('http')
    ? telhado.foto_url
    : `${bucketPublicUrl}/${telhado.foto_url}`

  function mover(novaFase: TelhadoFase) {
    startTransition(async () => {
      const r = await moverTelhadoFaseAction(telhado.id, novaFase)
      if (r?.erro) alert(r.erro)
      router.refresh()
    })
  }

  function excluir() {
    if (!confirm(`Excluir "${telhado.endereco}"? Não dá pra desfazer.`)) return
    startTransition(async () => {
      const r = await excluirTelhadoAction(telhado.id)
      if (r?.erro) alert(r.erro)
      router.refresh()
    })
  }

  return (
    <div className="bg-noite/60 border border-white/10 rounded-lg overflow-hidden hover:border-sol/30 transition-colors">
      {/* Foto */}
      <div className="relative h-24 bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoSrc} alt="Telhado" className="w-full h-full object-cover" />
        {telhado.qtd_placas_estimada && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-noite/90 backdrop-blur text-[10px] text-white font-bold rounded">
            {telhado.qtd_placas_estimada} placas
            {telhado.potencia_kwp_estimada && <span className="text-sol"> · {telhado.potencia_kwp_estimada}kWp</span>}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-white text-xs font-bold leading-tight truncate">{telhado.endereco}</p>
        {telhado.cidade && (
          <p className="text-[10px] text-white/40 truncate">{telhado.bairro && `${telhado.bairro} · `}{telhado.cidade}</p>
        )}
        {telhado.cliente_nome && (
          <p className="text-[10px] text-verde mt-1 truncate">👤 {telhado.cliente_nome}</p>
        )}

        {/* Ações */}
        <div className="mt-2 flex items-center justify-between gap-1">
          <button
            onClick={() => setMostrarAcoes(!mostrarAcoes)}
            className="text-[10px] text-white/50 hover:text-white"
          >
            {mostrarAcoes ? '× fechar' : '⋯ ações'}
          </button>
          {telhado.cliente_telefone && (
            <a
              href={`https://wa.me/55${telhado.cliente_telefone}`}
              target="_blank" rel="noopener"
              className="text-[10px] text-verde hover:underline"
            >
              📱 wa
            </a>
          )}
        </div>

        {mostrarAcoes && (
          <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
            <p className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Mover pra</p>
            <div className="grid grid-cols-2 gap-1">
              {COLUNAS.filter((c) => c.fase !== telhado.fase).map((c) => (
                <button
                  key={c.fase}
                  onClick={() => mover(c.fase)}
                  disabled={isPending}
                  className="text-[10px] px-1.5 py-1 bg-white/5 border border-white/10 rounded text-white/70 hover:bg-white/10 disabled:opacity-40"
                >
                  {c.titulo}
                </button>
              ))}
              {telhado.fase !== 'perdido' && (
                <button
                  onClick={() => mover('perdido')}
                  disabled={isPending}
                  className="text-[10px] px-1.5 py-1 bg-coral/10 border border-coral/25 rounded text-coral hover:bg-coral/20 disabled:opacity-40 col-span-2"
                >
                  ✗ Perdido
                </button>
              )}
            </div>
            <button
              onClick={excluir}
              disabled={isPending}
              className="w-full text-[10px] px-1.5 py-1 bg-coral/10 border border-coral/25 rounded text-coral hover:bg-coral/20 disabled:opacity-40 mt-1"
            >
              🗑 Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
