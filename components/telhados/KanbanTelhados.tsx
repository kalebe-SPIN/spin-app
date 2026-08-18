'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  moverTelhadoFaseAction,
  type TelhadoFase,
} from '@/app/crm/servicos/actions'
import { NovoTelhadoModal } from './NovoTelhadoModal'
import { EditarTelhadoModal } from './EditarTelhadoModal'
import { EscolherCriativoModal } from '@/components/criativos/EscolherCriativoModal'

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

export function KanbanTelhados({
  telhados,
  bucketPublicUrl,
  parametrosLimpeza,
  cidades,
}: {
  telhados: TelhadoCard[]
  bucketPublicUrl: string
  parametrosLimpeza?: any
  cidades?: Array<{ id: string; cidade: string; uf: string; km: number }>
}) {
  const router = useRouter()
  const [novoAberto, setNovoAberto] = useState(false)
  const [editando, setEditando] = useState<TelhadoCard | null>(null)
  const [colunaHover, setColunaHover] = useState<TelhadoFase | null>(null)
  const [, startTransition] = useTransition()

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
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-white">
            CRM — <span className="text-sol">Prospecção de telhados</span>
          </h1>
          <p className="text-white/50 text-xs mt-0.5">
            {telhados.length} telhado{telhados.length === 1 ? '' : 's'} · <strong>clica no card</strong> pra editar · <strong>arrasta</strong> pra mudar de fase
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
                      onAbrirEditor={() => setEditando(t)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {novoAberto && <NovoTelhadoModal onFechar={() => setNovoAberto(false)} />}
      {editando && (
        <EditarTelhadoModal
          telhado={editando}
          bucketPublicUrl={bucketPublicUrl}
          parametrosLimpeza={parametrosLimpeza}
          cidades={cidades}
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
  telhado, bucketPublicUrl, onAbrirEditor,
}: {
  telhado: TelhadoCard
  bucketPublicUrl: string
  onAbrirEditor: () => void
}) {
  const [arrastando, setArrastando] = useState(false)
  const [criativosAberto, setCriativosAberto] = useState(false)

  const fasesCriativos = telhado.fase === 'prospeccao' || telhado.fase === 'contato'
  const fasesProposta = telhado.fase === 'proposta' || telhado.fase === 'fechado'
  const telLimpo = telhado.cliente_telefone?.replace(/\D/g, '') || ''

  function linkWaProposta(): string {
    const primeiroNome = telhado.cliente_nome?.trim().split(' ')[0] || 'cliente'
    const valor = telhado.proposta_valor
      ? telhado.proposta_valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
      : 'valor a confirmar'
    const linhas = [
      `Oi ${primeiroNome}, tudo bem?`,
      '',
      `Segue a proposta da SPIN Solar pra limpeza e revisão do seu sistema fotovoltaico${telhado.qtd_placas_estimada ? ` (${telhado.qtd_placas_estimada} placas)` : ''}:`,
      '',
      `💰 *Valor: ${valor}*`,
      '',
      'Podemos agendar? Qualquer dúvida é só me chamar.',
    ]
    const msg = encodeURIComponent(linhas.join('\n'))
    return telLimpo ? `https://wa.me/55${telLimpo}?text=${msg}` : `https://wa.me/?text=${msg}`
  }

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
              telhado.proposta_valor ? (
                <a
                  href={linkWaProposta()}
                  target="_blank" rel="noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="block w-full text-center px-2 py-1.5 bg-verde/20 border border-verde/40 text-verde text-[11px] font-bold rounded hover:bg-verde/30"
                >
                  🧾 Enviar proposta WhatsApp
                </a>
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
