'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { enviarDocumentoAction } from '@/app/vaga/actions'

/**
 * Linha de upload de um tipo de documento do candidato.
 * Mostra estado "enviado" quando já existe arquivo daquele tipo.
 */
export function UploadDocumento({
  tipo,
  titulo,
  descricao,
  enviado,
  nomeArquivo,
}: {
  tipo: string
  titulo: string
  descricao: string
  enviado: boolean
  nomeArquivo?: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function onPick(file: File | null) {
    if (!file) return
    setErro(null)
    const fd = new FormData()
    fd.set('tipo', tipo)
    fd.set('arquivo', file)
    startTransition(async () => {
      const res = await enviarDocumentoAction(fd)
      if ('erro' in res) { setErro(res.erro); return }
      router.refresh()
    })
  }

  return (
    <div className={`p-4 rounded-xl border ${enviado ? 'bg-verde/[0.05] border-verde/25' : 'bg-white/[0.03] border-white/10'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-white font-bold text-sm flex items-center gap-2">
            {enviado && <span className="text-verde">✓</span>}
            {titulo}
          </p>
          <p className="text-white/50 text-xs mt-1 leading-snug">{descricao}</p>
          {enviado && nomeArquivo && (
            <p className="text-verde/80 text-xs mt-2 truncate">Enviado: {nomeArquivo}</p>
          )}
          {erro && <p className="text-coral text-xs mt-2">{erro}</p>}
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
              enviado
                ? 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                : 'bg-sol text-noite-0 hover:bg-sol-claro'
            }`}
          >
            {pending ? 'Enviando...' : enviado ? 'Trocar' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
