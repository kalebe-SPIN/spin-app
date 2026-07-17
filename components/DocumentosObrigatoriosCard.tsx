'use client'

/**
 * Card com os 4 slots de upload obrigatórios do consultor.
 * Só depois dos 4 uploads, o sistema libera geração dos arquivos das etapas.
 */

import { useState, useTransition } from 'react'
import Image from 'next/image'
import {
  uploadDocumentoHomologacaoAction,
  removerDocumentoHomologacaoAction,
  type TipoDoc,
} from '@/app/homologacoes/[id]/actions'

const SLOTS: Array<{
  chave: TipoDoc
  emoji: string
  label: string
  desc: string
  accept: string
  cor: string
}> = [
  {
    chave: 'foto_disjuntor',
    emoji: '⚡',
    label: 'Foto do disjuntor geral',
    desc: 'Do padrão de entrada, mostrando amperagem visível',
    accept: 'image/*',
    cor: 'sol',
  },
  {
    chave: 'foto_padrao_entrada',
    emoji: '🔌',
    label: 'Foto do padrão de entrada',
    desc: 'Completo, mostrando caixa + entrada da rede',
    accept: 'image/*',
    cor: 'weg-azul',
  },
  {
    chave: 'foto_fachada',
    emoji: '🏠',
    label: 'Foto da fachada do imóvel',
    desc: 'Vista frontal do imóvel — pra homologação CELESC',
    accept: 'image/*',
    cor: 'verde',
  },
  {
    chave: 'pdf_fatura_instalacao',
    emoji: '📄',
    label: 'PDF da fatura CELESC',
    desc: 'Fatura da UC atual (mais recente) — dados corretos',
    accept: 'application/pdf',
    cor: 'coral',
  },
]

type Props = {
  homologacaoId: string
  urls: {
    foto_disjuntor?: string | null
    foto_padrao_entrada?: string | null
    foto_fachada?: string | null
    pdf_fatura_instalacao?: string | null
  }
  documentosCompletosEm?: string | null
}

export function DocumentosObrigatoriosCard({ homologacaoId, urls, documentosCompletosEm }: Props) {
  const totalEnviados = Object.values(urls).filter(Boolean).length
  const completos = totalEnviados === 4
  const progresso = (totalEnviados / 4) * 100

  return (
    <section className={`p-5 rounded-xl border ${
      completos
        ? 'bg-verde/5 border-verde/30'
        : 'bg-sol/5 border-sol/30'
    }`}>
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className={`text-xs uppercase tracking-wider font-bold ${
            completos ? 'text-verde' : 'text-sol'
          }`}>
            📸 Documentos obrigatórios do consultor
          </h2>
          <p className="text-[10px] text-white/50 mt-0.5">
            {completos
              ? `✓ Completo em ${new Date(documentosCompletosEm || '').toLocaleString('pt-BR')} — arquivos das etapas gerados automaticamente`
              : 'Envie os 4 documentos pra sistema gerar os arquivos das etapas'}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black ${completos ? 'text-verde' : 'text-sol'}`}>
            {totalEnviados}/4
          </p>
          <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden">
            <div className={`h-full ${completos ? 'bg-verde' : 'bg-sol'} transition-all`}
              style={{ width: `${progresso}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SLOTS.map((slot) => (
          <SlotUpload
            key={slot.chave}
            homologacaoId={homologacaoId}
            slot={slot}
            urlAtual={urls[slot.chave as keyof typeof urls] || null}
          />
        ))}
      </div>

      {!completos && (
        <p className="mt-3 text-[10px] text-white/40 italic">
          🔒 Enquanto não subir os 4, os arquivos das etapas (memorial, listas, layout) ficam bloqueados.
        </p>
      )}
    </section>
  )
}

function SlotUpload({
  homologacaoId, slot, urlAtual,
}: {
  homologacaoId: string
  slot: typeof SLOTS[number]
  urlAtual: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(file: File) {
    setErro(null)
    if (file.size > 10 * 1024 * 1024) {
      setErro('Arquivo maior que 10MB. Reduza a resolução da foto.')
      return
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
      reader.readAsDataURL(file)
    })

    startTransition(async () => {
      const res = await uploadDocumentoHomologacaoAction({
        homologacaoId,
        tipo: slot.chave,
        arquivoBase64: base64,
        nomeOriginal: file.name,
      })
      if ('erro' in res && res.erro) setErro(res.erro)
    })
  }

  function remover() {
    if (!window.confirm(`Remover ${slot.label}?`)) return
    startTransition(async () => {
      await removerDocumentoHomologacaoAction({ homologacaoId, tipo: slot.chave })
    })
  }

  const eImagem = slot.accept.startsWith('image')
  const enviado = !!urlAtual

  return (
    <div className={`p-3 rounded-lg border ${
      enviado
        ? 'bg-verde/5 border-verde/30'
        : 'bg-noite/40 border-white/10 border-dashed'
    }`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{slot.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{slot.label}</p>
          <p className="text-[10px] text-white/50">{slot.desc}</p>
        </div>
        {enviado && (
          <span className="text-verde font-bold text-xs">✓</span>
        )}
      </div>

      {enviado ? (
        <div className="mt-3 space-y-2">
          {eImagem && urlAtual && (
            <a href={urlAtual} target="_blank" rel="noreferrer" className="block">
              <img
                src={urlAtual}
                alt={slot.label}
                className="w-full h-32 object-cover rounded border border-white/10 hover:border-verde/40"
              />
            </a>
          )}
          <div className="flex gap-2 text-[10px]">
            <a
              href={urlAtual || '#'}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-center px-2 py-1 bg-verde/20 border border-verde/40 rounded text-verde font-bold hover:bg-verde/30"
            >
              📥 {eImagem ? 'Ver imagem' : 'Abrir PDF'}
            </a>
            <button
              type="button"
              onClick={remover}
              disabled={isPending}
              className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60 hover:text-coral hover:border-coral/40"
              title="Remover e reenviar"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <label className={`block cursor-pointer text-center px-3 py-2 bg-sol/10 border border-sol/30 border-dashed rounded text-xs font-bold text-sol hover:bg-sol/20 ${isPending ? 'opacity-40 cursor-wait' : ''}`}>
            {isPending ? '⏳ Enviando...' : '+ Escolher arquivo'}
            <input
              type="file"
              accept={slot.accept}
              onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
              disabled={isPending}
              className="hidden"
            />
          </label>
        </div>
      )}

      {erro && (
        <p className="text-[10px] text-coral mt-2">⚠️ {erro}</p>
      )}
    </div>
  )
}
