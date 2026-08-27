'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  moverTelhadoFaseAction,
  type TelhadoFase,
} from '@/app/crm/servicos/actions'
import { NovoTelhadoModal } from './NovoTelhadoModal'
import { EditarTelhadoModal } from './EditarTelhadoModal'
import { EscolherCriativoModal } from '@/components/criativos/EscolherCriativoModal'
import { EnviarPropostaWhatsApp, type DadosEmpresa } from './EnviarPropostaWhatsApp'

export type TelhadoCard = {
  id: string
  fase: TelhadoFase
  apelido: string | null
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
  // Proposta gerada pelo simulador embutido (fases proposta/fechado)
  proposta_dados?: { entradas: any; resultado: any } | null
  proposta_valor?: number | null
}

const COLUNAS: { fase: TelhadoFase; titulo: string; sub: string; cor: string; hover: string }[] = [
  { fase: 'prospeccao', titulo: 'Prospecção', sub: 'avistado, sem contato',    cor: 'text-white/70 border-white/15',    hover: 'ring-white/40' },
  { fase: 'contato',    titulo: 'Contato',    sub: 'ligou / mandou WhatsApp', cor: 'text-weg-azul border-weg-azul/40', hover: 'ring-weg-azul' },
  { fase: 'proposta',   titulo: 'Proposta',   sub: 'orçamento enviado',        cor: 'text-sol border-sol/40',           hover: 'ring-sol' },
  { fase: 'fechado',    titulo: 'Fechado',    sub: 'virou cliente',            cor: 'text-verde border-verde/40',       hover: 'ring-verde' },
]

const DRAG_MIME = 'application/x-telhado-id'

type Vendedor = { id: string; nome_completo: string; role: string }

export function KanbanTelhados({
  telhados,
  bucketPublicUrl,
  parametrosLimpeza,
  cidades,
  empresa,
  vendedores,
  ehAdmin,
  userIdAtual,
}: {
  telhados: TelhadoCard[]
  bucketPublicUrl: string
  parametrosLimpeza?: any
  cidades?: Array<{ id: string; cidade: string; uf: string; km: number }>
  empresa?: DadosEmpresa | null
  vendedores?: Vendedor[]
  ehAdmin?: boolean
  userIdAtual?: string
}) {
  const router = useRouter()
  const [novoAberto, setNovoAberto] = useState(false)
  const [editando, setEditando] = useState<TelhadoCard | null>(null)
  const [colunaHover, setColunaHover] = useState<TelhadoFase | null>(null)
  const [busca, setBusca] = useState('')
  const [, startTransition] = useTransition()

  const telhadosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return telhados
    return telhados.filter((t) => {
      const alvo = [
        t.apelido, t.cliente_nome, t.cliente_telefone,
        t.endereco, t.bairro, t.cidade,
      ].filter(Boolean).join(' ').toLowerCase()
      return alvo.includes(q)
    })
  }, [telhados, busca])

  async function moverPorDrop(telhadoId: string, novaFase: TelhadoFase) {
    // Otimista: já mostra loading; refresh depois
    startTransition(async () => {
      const r = await moverTelhadoFaseAction(telhadoId, novaFase)
      if (r?.erro) alert(r.erro)
      router.refresh()
    })
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-black text-white">
          CRM — <span className="text-sol">Prospecção de telhados</span>
        </h1>
        <p className="text-white/50 text-xs mt-0.5">
          {busca
            ? <><strong className="text-white">{telhadosFiltrados.length}</strong> de {telhados.length} bate{telhados.length === 1 ? '' : 'm'} com &ldquo;{busca}&rdquo;</>
            : <>{telhados.length} telhado{telhados.length === 1 ? '' : 's'} · <strong>clica no card</strong> pra editar · <strong>arrasta</strong> pra mudar de fase</>}
        </p>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2 items-stretch">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">🔍</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por apelido, cliente, telefone, endereço, bairro, cidade…"
            className="w-full h-12 pl-10 pr-10 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-sol/40 focus:outline-none"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs px-2 py-1"
              aria-label="Limpar busca">
              ✕
            </button>
          )}
        </div>
        <button
          onClick={() => setNovoAberto(true)}
          className="h-12 inline-flex items-center justify-center gap-1 px-6 bg-sol text-noite font-black text-sm rounded-lg hover:bg-sol/90 shadow-lg shadow-sol/20 whitespace-nowrap"
        >
          + Novo telhado
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUNAS.map((col) => {
          const cardsDaColuna = telhadosFiltrados.filter((t) => t.fase === col.fase)
          const emHover = colunaHover === col.fase
          return (
            <div
              key={col.fase}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_MIME)) {
                  e.preventDefault()
                  setColunaHover(col.fase)
                }
              }}
              onDragLeave={() => setColunaHover(null)}
              onDrop={(e) => {
                e.preventDefault()
                setColunaHover(null)
                const id = e.dataTransfer.getData(DRAG_MIME)
                if (id) moverPorDrop(id, col.fase)
              }}
              className={`bg-white/[0.02] border rounded-xl overflow-hidden transition ${col.cor} ${
                emHover ? `ring-2 ring-offset-2 ring-offset-noite ${col.hover}` : ''
              }`}
            >
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
                  <p className="text-[11px] text-white/30 text-center py-6 italic">
                    {emHover ? '⇩ solta aqui' : 'vazio'}
                  </p>
                ) : (
                  cardsDaColuna.map((t) => (
                    <CardTelhado
                      key={t.id}
                      telhado={t}
                      bucketPublicUrl={bucketPublicUrl}
                      empresa={empresa}
                      onAbrirEditor={() => setEditando(t)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {novoAberto && (
        <NovoTelhadoModal
          onFechar={() => setNovoAberto(false)}
          vendedores={vendedores}
          ehAdmin={ehAdmin}
          userIdAtual={userIdAtual}
        />
      )}
      {editando && (
        <EditarTelhadoModal
          telhado={editando}
          bucketPublicUrl={bucketPublicUrl}
          parametrosLimpeza={parametrosLimpeza}
          cidades={cidades}
          vendedores={vendedores}
          ehAdmin={ehAdmin}
          propostaAnterior={editando.proposta_dados && editando.proposta_valor
            ? {
                entradas: editando.proposta_dados.entradas,
                resultado: editando.proposta_dados.resultado,
                valor_final: editando.proposta_valor,
              }
            : null
          }
          onFechar={() => setEditando(null)}
        />
      )}
    </>
  )
}

function CardTelhado({
  telhado, bucketPublicUrl, onAbrirEditor, empresa,
}: {
  telhado: TelhadoCard
  bucketPublicUrl: string
  onAbrirEditor: () => void
  empresa?: DadosEmpresa | null
}) {
  const [arrastando, setArrastando] = useState(false)
  const [criativosAberto, setCriativosAberto] = useState(false)

  const fasesCriativos = telhado.fase === 'prospeccao' || telhado.fase === 'contato'
  const fasesProposta = telhado.fase === 'proposta' || telhado.fase === 'fechado'

  const fotoSrc = telhado.foto_url.startsWith('http')
    ? telhado.foto_url
    : `${bucketPublicUrl}/${telhado.foto_url}`

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, telhado.id)
        e.dataTransfer.effectAllowed = 'move'
        setArrastando(true)
      }}
      onDragEnd={() => setArrastando(false)}
      onClick={onAbrirEditor}
      className={`bg-noite/60 border border-white/10 rounded-lg overflow-hidden transition-all cursor-pointer hover:border-sol/50 hover:shadow-lg hover:shadow-sol/10 ${
        arrastando ? 'opacity-40 scale-95' : ''
      }`}
      title="Clica pra editar · Arrasta pra mudar de fase"
    >
      {/* Foto */}
      <div className="relative h-24 bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoSrc} alt="Telhado" className="w-full h-full object-cover pointer-events-none" />
        {telhado.qtd_placas_estimada && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-noite/90 backdrop-blur text-[10px] text-white font-bold rounded">
            {telhado.qtd_placas_estimada} placas
            {telhado.potencia_kwp_estimada && <span className="text-sol"> · {telhado.potencia_kwp_estimada}kWp</span>}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-white text-xs font-bold leading-tight truncate">
          {telhado.apelido || telhado.endereco}
        </p>
        {telhado.apelido ? (
          <p className="text-[10px] text-white/50 truncate">📍 {telhado.endereco}</p>
        ) : telhado.cidade && (
          <p className="text-[10px] text-white/40 truncate">
            {telhado.bairro && `${telhado.bairro} · `}{telhado.cidade}
          </p>
        )}
        {telhado.cliente_nome && (
          <p className="text-[10px] text-verde mt-1 truncate">👤 {telhado.cliente_nome}</p>
        )}

        {/* Valor da proposta (se gerada) */}
        {telhado.proposta_valor && telhado.proposta_valor > 0 && (
          <p className="text-[11px] text-sol font-bold mt-1">
            🧾 {telhado.proposta_valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
        )}

        {/* Ação contextual por fase (não abre o editor — stopPropagation) */}
        {(fasesCriativos || fasesProposta) && (
          <div className="mt-2 pt-2 border-t border-white/10">
            {fasesCriativos && (
              <button
                onClick={(e) => { e.stopPropagation(); setCriativosAberto(true) }}
                className="w-full px-2 py-1.5 bg-weg-azul/15 border border-weg-azul/40 text-weg-azul text-[11px] font-bold rounded hover:bg-weg-azul/25"
              >
                📚 Enviar criativos WhatsApp
              </button>
            )}
            {fasesProposta && (
              telhado.proposta_valor && telhado.proposta_dados?.entradas ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <EnviarPropostaWhatsApp
                    telhadoId={telhado.id}
                    empresa={empresa}
                    dados={{
                      clienteNome: telhado.cliente_nome,
                      clienteTelefone: telhado.cliente_telefone,
                      endereco: telhado.endereco,
                      cidade: telhado.cidade,
                      apelido: telhado.apelido,
                      qtdPlacas: telhado.proposta_dados.entradas.qtd_modulos || telhado.qtd_placas_estimada || 0,
                      potenciaKwp: Number(((telhado.proposta_dados.entradas.qtd_modulos || telhado.qtd_placas_estimada || 0) * 0.55).toFixed(2)),
                      valorFinal: telhado.proposta_valor,
                      numTecnicos: telhado.proposta_dados.resultado?.qtd_tecnicos_calculado || telhado.proposta_dados.entradas.qtd_instaladores || 1,
                      numDias: telhado.proposta_dados.resultado?.dias_calculado || telhado.proposta_dados.entradas.dias_estimados || 1,
                      temPontoAgua: telhado.proposta_dados.entradas.tem_ponto_agua ?? true,
                      temPontoEnergia: telhado.proposta_dados.entradas.tem_ponto_energia ?? true,
                      sujidade: telhado.proposta_dados.entradas.sujidade || 'medio',
                    }}
                  />
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onAbrirEditor() }}
                  className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white/50 text-[11px] font-bold rounded hover:bg-white/10"
                  title="Salva uma proposta primeiro no card"
                >
                  ⚠ Sem proposta salva — clica pra gerar
                </button>
              )
            )}
          </div>
        )}
      </div>

      {criativosAberto && (
        <div onClick={(e) => e.stopPropagation()}>
          <EscolherCriativoModal
            clienteNome={telhado.cliente_nome}
            clienteTelefone={telhado.cliente_telefone}
            onFechar={() => setCriativosAberto(false)}
          />
        </div>
      )}
    </div>
  )
}
