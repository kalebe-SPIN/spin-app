'use client'

import { useMemo, useState } from 'react'
import type { CriativoRow } from './CriativosAdminClient'

const TIPO_EMOJI: Record<string, string> = {
  imagem: '🖼', video: '🎬', pdf: '📄', texto: '💬',
}

export function BibliotecaClient({
  criativos, bucketPublicUrl,
}: {
  criativos: CriativoRow[]
  bucketPublicUrl: string
}) {
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null)
  const [tipoAtivo, setTipoAtivo] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState<CriativoRow | null>(null)

  const categorias = useMemo(() => {
    const set = new Set<string>()
    criativos.forEach((c) => c.categoria && set.add(c.categoria))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [criativos])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return criativos.filter((c) => {
      if (categoriaAtiva && c.categoria !== categoriaAtiva) return false
      if (tipoAtivo && c.tipo !== tipoAtivo) return false
      if (q && !`${c.titulo} ${c.descricao || ''} ${c.categoria || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [criativos, categoriaAtiva, tipoAtivo, busca])

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl space-y-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar criativo por título, descrição, categoria..."
          className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-sm text-white"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Tipo:</span>
          <FiltroChip label="Todos" ativo={tipoAtivo === null} onClick={() => setTipoAtivo(null)} />
          {(['imagem', 'video', 'pdf', 'texto'] as const).map((t) => (
            <FiltroChip
              key={t}
              label={`${TIPO_EMOJI[t]} ${t}`}
              ativo={tipoAtivo === t}
              onClick={() => setTipoAtivo(t)}
            />
          ))}
        </div>

        {categorias.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Categoria:</span>
            <FiltroChip label="Todas" ativo={categoriaAtiva === null} onClick={() => setCategoriaAtiva(null)} />
            {categorias.map((c) => (
              <FiltroChip
                key={c}
                label={c}
                ativo={categoriaAtiva === c}
                onClick={() => setCategoriaAtiva(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Grid de cards */}
      {filtrados.length === 0 ? (
        <p className="text-sm text-white/40 italic text-center py-10">
          {criativos.length === 0
            ? 'Nenhum criativo ainda. Peça pro admin cadastrar em /admin/criativos.'
            : 'Nenhum criativo bate com o filtro.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((c) => (
            <CardBiblioteca
              key={c.id}
              criativo={c}
              bucketPublicUrl={bucketPublicUrl}
              onUsar={() => setEnviando(c)}
            />
          ))}
        </div>
      )}

      {enviando && (
        <ModalEnvio criativo={enviando} bucketPublicUrl={bucketPublicUrl} onFechar={() => setEnviando(null)} />
      )}
    </div>
  )
}

function FiltroChip({ label, ativo, onClick }: { label: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition ${
        ativo ? 'bg-sol text-noite-0 border-sol font-bold' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

function CardBiblioteca({
  criativo, bucketPublicUrl, onUsar,
}: {
  criativo: CriativoRow
  bucketPublicUrl: string
  onUsar: () => void
}) {
  const url = criativo.arquivo_url ? `${bucketPublicUrl}/${criativo.arquivo_url}` : null

  return (
    <div className="bg-noite/60 border border-white/10 rounded-lg overflow-hidden hover:border-sol/50 transition-colors">
      {criativo.tipo === 'imagem' && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={criativo.titulo} className="w-full h-40 object-cover bg-black/40" />
      )}
      {criativo.tipo === 'video' && url && (
        <video src={url} controls className="w-full h-40 object-cover bg-black/40" />
      )}
      {criativo.tipo === 'pdf' && url && (
        <div className="relative h-56 bg-white/5">
          {/* Preview inline da 1ª página via <embed> — funciona em quase todos os browsers */}
          <embed src={`${url}#page=1&view=Fit&toolbar=0&navpanes=0`} type="application/pdf" className="w-full h-full pointer-events-none" />
          <a href={url} target="_blank" rel="noopener"
            className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-noite/60 to-transparent opacity-0 hover:opacity-100 transition"
            title="Abrir PDF em nova aba"
          >
            <span className="px-2 py-1 bg-sol/90 text-noite-0 text-xs font-bold rounded">📄 Abrir PDF</span>
          </a>
        </div>
      )}
      {criativo.tipo === 'texto' && (
        <div className="h-56 p-4 bg-white/[0.03] overflow-y-auto text-base text-white/85 whitespace-pre-wrap leading-relaxed">
          {criativo.texto}
        </div>
      )}

      <div className="p-3 space-y-1">
        <p className="text-sm font-bold text-white truncate">{TIPO_EMOJI[criativo.tipo]} {criativo.titulo}</p>
        {criativo.categoria && <p className="text-[10px] text-sol">🏷 {criativo.categoria}</p>}
        {criativo.descricao && <p className="text-[11px] text-white/50 line-clamp-2">{criativo.descricao}</p>}

        <button
          onClick={onUsar}
          className="w-full mt-2 px-3 py-1.5 bg-verde/20 border border-verde/40 text-verde font-bold text-xs rounded-lg hover:bg-verde/30"
        >
          📱 Usar / Enviar
        </button>
      </div>
    </div>
  )
}

function ModalEnvio({
  criativo, bucketPublicUrl, onFechar,
}: {
  criativo: CriativoRow
  bucketPublicUrl: string
  onFechar: () => void
}) {
  const [telefone, setTelefone] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const url = criativo.arquivo_url ? `${bucketPublicUrl}/${criativo.arquivo_url}` : null

  const mensagem = useMemo(() => {
    const primeiroNome = nomeCliente.trim().split(' ')[0] || 'cliente'
    const template = criativo.mensagem_whatsapp_template ||
      (criativo.tipo === 'texto'
        ? '{link}'
        : 'Oi {cliente_nome}! Dá uma olhada nesse material da SPIN: {link}')
    return template
      .replace(/\{cliente_nome\}/g, primeiroNome)
      .replace(/\{link\}/g, criativo.tipo === 'texto' ? (criativo.texto || '') : (url || ''))
  }, [criativo, nomeCliente, url])

  const telefoneLimpo = telefone.replace(/\D/g, '')
  const linkWa = telefoneLimpo
    ? `https://wa.me/55${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/?text=${encodeURIComponent(mensagem)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onFechar}>
      <div className="bg-noite border border-sol/25 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <p className="text-white font-bold">Enviar criativo</p>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-xl">×</button>
        </div>

        <div className="p-5 space-y-4">
          {criativo.tipo === 'imagem' && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="w-full max-h-48 object-contain bg-black/40 rounded" />
          )}

          <div>
            <p className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1">
              Nome do cliente (pra personalizar)
            </p>
            <input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-sm text-white" />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1">
              Telefone (opcional — sem, abre WA sem destinatário)
            </p>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)}
              placeholder="(48) 9..."
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-sm text-white" />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1">Pré-visualização da mensagem</p>
            <div className="p-3 bg-white/5 border border-white/15 rounded-lg text-sm text-white/80 whitespace-pre-wrap break-words">
              {mensagem}
            </div>
          </div>

          <a
            href={linkWa}
            target="_blank"
            rel="noopener"
            className="block w-full text-center px-4 py-3 bg-verde text-noite-0 font-bold text-sm rounded-lg hover:bg-verde/80"
          >
            📱 Abrir WhatsApp
          </a>

          <button
            onClick={() => navigator.clipboard?.writeText(mensagem)}
            className="w-full px-4 py-2 bg-white/5 border border-white/15 text-white/70 font-semibold text-xs rounded-lg hover:bg-white/10"
          >
            📋 Copiar mensagem
          </button>
        </div>
      </div>
    </div>
  )
}
