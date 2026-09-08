/**
 * Card "Ficha Comercial" do cliente — Kalebe 2026-09-07.
 *
 * Mostra:
 *   - Valor de referência (soma dos pv_total dos projetos com proposta)
 *   - Etiquetas (tipos de itens já propostos: on_grid, hibrido, limpeza,
 *     om, ve_recarga, etc)
 *   - Histórico de PDFs (proposta_id, código, valor, link pra baixar)
 *
 * Atualização em tempo real via triggers (migration 106).
 */

import Link from 'next/link'

type PdfProposta = {
  projeto_id: string
  projeto_codigo?: string
  url: string
  valor?: number
  criado_em?: string
}

type Props = {
  valorReferencia: number
  etiquetas: string[]
  pdfs: PdfProposta[]
}

const ETIQUETA_LABEL: Record<string, { label: string; emoji: string; cor: string }> = {
  on_grid:            { label: 'On-grid',            emoji: '☀️', cor: 'bg-sol/10 text-sol border-sol/30' },
  ongrid:             { label: 'On-grid',            emoji: '☀️', cor: 'bg-sol/10 text-sol border-sol/30' },
  hibrido:            { label: 'Híbrido',            emoji: '🔋', cor: 'bg-weg-azul/10 text-weg-azul border-weg-azul/30' },
  hibrido_bess:       { label: 'Híbrido + BESS',     emoji: '🔋', cor: 'bg-weg-azul/10 text-weg-azul border-weg-azul/30' },
  bess:               { label: 'BESS',               emoji: '🔋', cor: 'bg-weg-azul/10 text-weg-azul border-weg-azul/30' },
  expansao_ongrid:    { label: 'Ampliação on-grid',  emoji: '☀️', cor: 'bg-sol/10 text-sol border-sol/30' },
  expansao_hibrido:   { label: 'Ampliação híbrido',  emoji: '🔋', cor: 'bg-weg-azul/10 text-weg-azul border-weg-azul/30' },
  ve_recarga:         { label: 'Carregador VE',      emoji: '🔌', cor: 'bg-verde/10 text-verde border-verde/30' },
  ve:                 { label: 'Carregador VE',      emoji: '🔌', cor: 'bg-verde/10 text-verde border-verde/30' },
  limpeza:            { label: 'Limpeza',            emoji: '🧽', cor: 'bg-white/5 text-white/70 border-white/15' },
  om:                 { label: 'O&M',                emoji: '🛠', cor: 'bg-white/5 text-white/70 border-white/15' },
  servico:            { label: 'Serviço avulso',     emoji: '🔧', cor: 'bg-coral/10 text-coral border-coral/30' },
  servico_avulso:     { label: 'Serviço avulso',     emoji: '🔧', cor: 'bg-coral/10 text-coral border-coral/30' },
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function FichaComercialCliente({ valorReferencia, etiquetas, pdfs }: Props) {
  const temNada = valorReferencia === 0 && etiquetas.length === 0 && pdfs.length === 0

  if (temNada) return null

  return (
    <section className="p-5 bg-white/[0.03] border border-sol/25 rounded-xl">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-sol font-bold">Ficha comercial</p>
          <h3 className="text-white font-bold text-sm mt-0.5">Perfil de negócios com este cliente</h3>
        </div>
        {valorReferencia > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Valor de referência</p>
            <p className="text-sol font-mono font-black text-lg">R$ {fmt(valorReferencia)}</p>
          </div>
        )}
      </div>

      {/* Etiquetas */}
      {etiquetas.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">
            Tipos propostos
          </p>
          <div className="flex flex-wrap gap-1.5">
            {etiquetas.map((t) => {
              const info = ETIQUETA_LABEL[t] || { label: t, emoji: '🏷', cor: 'bg-white/5 text-white/70 border-white/15' }
              return (
                <span key={t} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${info.cor}`}>
                  <span>{info.emoji}</span>
                  {info.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Histórico de PDFs */}
      {pdfs.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">
            Propostas emitidas ({pdfs.length})
          </p>
          <div className="space-y-1">
            {pdfs.slice(0, 6).map((pdf) => {
              const data = pdf.criado_em ? new Date(pdf.criado_em).toLocaleDateString('pt-BR') : '—'
              return (
                <div key={pdf.projeto_id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.02] group">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link href={`/projetos/${pdf.projeto_id}`}
                      className="text-xs font-mono text-white/50 hover:text-sol shrink-0">
                      {pdf.projeto_codigo || pdf.projeto_id.slice(0, 8)}
                    </Link>
                    <span className="text-[11px] text-white/40">{data}</span>
                    {typeof pdf.valor === 'number' && pdf.valor > 0 && (
                      <span className="text-[11px] text-sol font-mono">R$ {fmt(pdf.valor)}</span>
                    )}
                  </div>
                  <a href={pdf.url} target="_blank" rel="noreferrer"
                    className="text-[11px] text-sol hover:underline font-semibold shrink-0">
                    📄 baixar
                  </a>
                </div>
              )
            })}
            {pdfs.length > 6 && (
              <p className="text-[10px] text-white/40 text-center pt-1">
                +{pdfs.length - 6} propostas anteriores
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
