'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  bucket?: string
  pasta?: string                        // subpasta dentro do bucket, ex: 'logo' | 'assinatura'
  valorAtual: string                    // URL atual (se existir)
  onChange: (url: string) => void       // callback quando upload conclui
  label: string
  ajuda?: string
  accept?: string                       // MIME types aceitos
  maxMB?: number
}

export function UploadImagem({
  bucket = 'empresa-assets',
  pasta = '',
  valorAtual,
  onChange,
  label,
  ajuda,
  accept = 'image/png,image/jpeg,image/webp,image/svg+xml',
  maxMB = 5,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleFile(file: File) {
    setErro(null)

    // Validação tamanho
    if (file.size > maxMB * 1024 * 1024) {
      setErro(`Arquivo excede ${maxMB} MB`)
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()

      // Nome único: pasta/timestamp-nomeoriginal
      const ext = file.name.split('.').pop() || 'png'
      const nomeSanitizado = file.name.replace(/[^a-zA-Z0-9.]/g, '_').slice(0, 30)
      const path = `${pasta ? pasta + '/' : ''}${Date.now()}-${nomeSanitizado}`

      // Upload
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
        })

      if (upErr) {
        console.error('[UploadImagem] erro:', upErr)
        setErro(upErr.message || 'Erro no upload')
        return
      }

      // Pega URL pública
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      onChange(publicUrl)
    } catch (e: any) {
      console.error('[UploadImagem] exception:', e)
      setErro(e.message || 'Erro inesperado')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleRemover() {
    onChange('')
    setErro(null)
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-white/60 uppercase tracking-wider block">
        {label}
      </label>

      {valorAtual ? (
        <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/10 rounded-lg">
          {/* Preview */}
          {valorAtual.match(/\.(png|jpe?g|webp|svg)$/i) ? (
            <img
              src={valorAtual}
              alt={label}
              className="w-16 h-16 object-contain bg-white/5 rounded border border-white/10"
            />
          ) : (
            <div className="w-16 h-16 flex items-center justify-center bg-white/5 rounded border border-white/10 text-2xl">
              📎
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-verde">✓ Arquivo enviado</p>
            <a
              href={valorAtual}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-white/40 hover:text-white/60 truncate block underline"
            >
              {valorAtual.split('/').pop()}
            </a>
          </div>
          <button
            type="button"
            onClick={handleRemover}
            className="text-xs text-coral hover:text-coral/80 whitespace-nowrap"
          >
            Remover
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full p-4 border-2 border-dashed border-white/15 rounded-lg text-center hover:border-sol/40 hover:bg-white/[0.02] transition disabled:opacity-50"
        >
          {uploading ? (
            <p className="text-sm text-sol">⏳ Enviando...</p>
          ) : (
            <>
              <p className="text-sm text-white/80">📤 Clique pra enviar</p>
              <p className="text-xs text-white/40 mt-1">PNG, JPG, WEBP ou SVG · até {maxMB} MB</p>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {ajuda && !erro && (
        <p className="text-xs text-white/40">{ajuda}</p>
      )}

      {erro && (
        <p className="text-xs text-coral">❌ {erro}</p>
      )}
    </div>
  )
}
