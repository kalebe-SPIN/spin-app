'use client'

import { useEffect, useRef, useState } from 'react'
import { salvarFotoPerfilAction, removerFotoPerfilAction, type AlvoFoto } from '@/app/contatos/foto-actions'

/**
 * Avatar do contato/cliente (Kalebe 2026-10-01). A API oficial do WhatsApp
 * não entrega a foto do cliente: sem foto, mostra as iniciais numa cor fixa
 * por contato (como o WhatsApp faz com quem não tem foto). Com `alvo`, um
 * clique escolhe a foto — cortada em quadrado e reduzida no navegador.
 */

function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter((p) => /^[A-Za-zÀ-ÿ]/.test(p))
  if (!palavras.length) return ''
  const primeira = palavras[0][0]
  const ultima = palavras.length > 1 ? palavras[palavras.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

function corDe(semente: string): string {
  let h = 0
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 45% 32%)`
}

/** Corta no centro em quadrado e reduz pra 256 px (JPEG ~20–40 KB). */
async function reduzirFoto(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const lado = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, 256, 256)
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('não consegui ler a imagem'))), 'image/jpeg', 0.85))
}

export function AvatarContato({
  nome,
  semente,
  foto,
  tamanho = 40,
  alvo,
  onFotoAlterada,
}: {
  nome: string
  semente?: string               // o que define a cor (telefone/id); padrão: nome
  foto?: string | null
  tamanho?: number
  alvo?: AlvoFoto | null         // presente = clicável pra trocar a foto
  onFotoAlterada?: (url: string | null) => void
}) {
  const [url, setUrl] = useState<string | null>(foto || null)
  const [quebrada, setQuebrada] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setUrl(foto || null); setQuebrada(false) }, [foto])

  const txt = iniciais(nome)
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.38) }
  const editavel = !!alvo && (!!alvo.contato_id || !!alvo.cliente_id)

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !alvo) return
    setEnviando(true)
    try {
      const blob = await reduzirFoto(f)
      const fd = new FormData()
      fd.append('arquivo', blob, 'foto.jpg')
      if (alvo.contato_id) fd.append('contato_id', alvo.contato_id)
      if (alvo.cliente_id) fd.append('cliente_id', alvo.cliente_id)
      const r = await salvarFotoPerfilAction(fd)
      if ('erro' in r) window.alert(r.erro)
      else { setUrl(r.foto_url); setQuebrada(false); onFotoAlterada?.(r.foto_url) }
    } catch (err: any) {
      window.alert(`Não consegui usar essa imagem: ${err?.message || err}`)
    } finally {
      setEnviando(false)
    }
  }

  async function remover(e: React.MouseEvent) {
    e.stopPropagation()
    if (!alvo || !window.confirm('Remover a foto deste contato?')) return
    setEnviando(true)
    const r = await removerFotoPerfilAction(alvo)
    setEnviando(false)
    if ('erro' in r) window.alert(r.erro)
    else { setUrl(null); onFotoAlterada?.(null) }
  }

  const mostrarFoto = !!url && !quebrada
  const miolo = mostrarFoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url!} alt={nome} onError={() => setQuebrada(true)} className="w-full h-full object-cover" />
  ) : (
    <span className="font-bold text-white/90 select-none leading-none">{txt || '👤'}</span>
  )

  if (!editavel) {
    return (
      <span className="relative shrink-0 rounded-full overflow-hidden flex items-center justify-center"
        style={{ ...estilo, background: mostrarFoto ? undefined : corDe(semente || nome) }} title={nome}>
        {miolo}
      </span>
    )
  }

  return (
    <span className="relative shrink-0 group" style={{ width: tamanho, height: tamanho }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
        disabled={enviando}
        title={mostrarFoto ? 'Trocar a foto' : 'Adicionar foto (o WhatsApp não envia a foto do cliente)'}
        className="w-full h-full rounded-full overflow-hidden flex items-center justify-center ring-1 ring-white/10 hover:ring-sol/60 transition"
        style={{ ...estilo, background: mostrarFoto ? undefined : corDe(semente || nome) }}
      >
        {enviando ? <span className="text-xs text-white/80">…</span> : miolo}
        <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
          style={{ fontSize: Math.round(tamanho * 0.36) }}>
          📷
        </span>
      </button>
      {mostrarFoto && !enviando && (
        <button type="button" onClick={remover} title="Remover foto"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-noite border border-white/20 text-[9px] text-white/70 hover:text-coral hidden group-hover:flex items-center justify-center">
          ✕
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={escolher} />
    </span>
  )
}
