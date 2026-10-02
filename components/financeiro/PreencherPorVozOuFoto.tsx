'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Registrar saída por VOZ e/ou FOTO/PDF (Kalebe 2026-10-02). A fala vira
 * texto no próprio navegador (reconhecimento de voz do Chrome/Edge/Android);
 * a foto é reduzida antes de subir. A IA (/api/financeiro/interpretar) lê
 * tudo e devolve os campos — o formulário abre preenchido pra conferir.
 * Dá pra combinar: foto da nota + "é do projeto do Paulo, paguei no PIX".
 */

export type DadosIA = {
  grupo: string
  descricao: string
  valor: number | null
  data: string | null
  ja_pago: boolean
  forma_pagamento: string | null
  fornecedor_id: string | null
  fornecedor_nome: string | null
  fornecedor_cnpj: string | null
  nf: string | null
  tipo_imposto: string | null
  competencia: string | null
  subtipo_pessoal: string | null
  favorecido: string | null
  categoria_id: string | null
  projeto_id: string | null
  servico_id: string | null
  observacoes: string | null
}
export type ResultadoIA = { dados: DadosIA; comprovante: string | null; avisos: string[] }

const MAX_PDF = 3_200_000   // base64 cresce ~33%: cabe no limite de 4,5 MB da requisição

async function reduzirImagem(f: File): Promise<{ base64: string; mime: string; previa: string }> {
  const bmp = await createImageBitmap(f)
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: url.split(',')[1], mime: 'image/jpeg', previa: url }
}

function lerComoBase64(f: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] || '')
    r.onerror = () => falha(new Error('não consegui ler o arquivo'))
    r.readAsDataURL(f)
  })
}

export function PreencherPorVozOuFoto({ onResultado, compacto = false }: {
  onResultado: (r: ResultadoIA) => void
  compacto?: boolean
}) {
  const [aberto, setAberto] = useState(!compacto)
  const [texto, setTexto] = useState('')
  const [parcial, setParcial] = useState('')
  const [ouvindo, setOuvindo] = useState(false)
  const [semVoz, setSemVoz] = useState(false)
  const [arquivo, setArquivo] = useState<{ base64: string; mime: string; nome: string; previa?: string } | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const recRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { try { recRef.current?.stop() } catch {} }, [])

  function ouvir() {
    setErro(null)
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setSemVoz(true); return }
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (ev: any) => {
      let finais = ''
      let meio = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) finais += r[0].transcript
        else meio += r[0].transcript
      }
      if (finais) setTexto((t) => `${t} ${finais}`.trim())
      setParcial(meio)
    }
    rec.onerror = (ev: any) => {
      setErro(ev?.error === 'not-allowed'
        ? 'Libere o microfone pro portal (cadeado ao lado do endereço).'
        : 'Não consegui ouvir — tente de novo ou escreva abaixo.')
    }
    rec.onend = () => { setOuvindo(false); setParcial('') }
    recRef.current = rec
    rec.start()
    setOuvindo(true)
  }

  function pararDeOuvir() {
    try { recRef.current?.stop() } catch {}
    setOuvindo(false)
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErro(null)
    try {
      if (f.type === 'application/pdf') {
        if (f.size > MAX_PDF) { setErro('PDF acima de 3 MB — mande uma foto da página do comprovante.'); return }
        setArquivo({ base64: await lerComoBase64(f), mime: 'application/pdf', nome: f.name })
      } else if (f.type.startsWith('image/')) {
        const r = await reduzirImagem(f)
        setArquivo({ ...r, nome: f.name })
      } else {
        setErro('Use foto ou PDF.')
      }
    } catch (err: any) {
      setErro(`Não consegui usar esse arquivo: ${err?.message || err}`)
    }
  }

  async function preencher() {
    pararDeOuvir()
    const t = `${texto} ${parcial}`.trim()
    if (!t && !arquivo) { setErro('Fale, escreva ou anexe o comprovante.'); return }
    setLendo(true); setErro(null)
    try {
      const resp = await fetch('/api/financeiro/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: t, arquivo: arquivo ? { base64: arquivo.base64, mime: arquivo.mime } : undefined }),
      })
      const j = await resp.json().catch(() => ({}))
      if (!resp.ok || !j.dados) { setErro(j.erro || 'Não consegui interpretar — preencha à mão.'); return }
      onResultado({ dados: j.dados, comprovante: j.comprovante || null, avisos: j.avisos || [] })
      setTexto(''); setParcial(''); setArquivo(null)
      if (compacto) setAberto(false)
    } catch {
      setErro('Sem conexão com o servidor — tente de novo.')
    } finally { setLendo(false) }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs text-sol hover:underline">
        ⚡ Preencher por voz ou foto
      </button>
    )
  }

  const btn = 'px-3 py-2 rounded-lg text-sm font-bold transition disabled:opacity-40'
  return (
    <div className="rounded-xl border border-sol/30 bg-sol/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white">⚡ Preencher por voz ou foto</p>
        {compacto && (
          <button type="button" onClick={() => setAberto(false)} className="text-white/50 hover:text-white text-xs">fechar</button>
        )}
      </div>
      <p className="text-[11px] text-white/55">
        Diga algo como <em>“Paguei 180 reais de combustível hoje no PIX, visita do projeto do Paulo”</em> ou
        tire foto da nota/comprovante. Dá pra usar os dois juntos. Você confere antes de registrar.
      </p>

      <div className="flex flex-wrap gap-2">
        {ouvindo ? (
          <button type="button" onClick={pararDeOuvir} className={`${btn} bg-coral text-white flex items-center gap-2`}>
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" /> Parar
          </button>
        ) : (
          <button type="button" onClick={ouvir} disabled={lendo} className={`${btn} bg-white/10 border border-white/20 text-white hover:bg-white/15`}>
            🎤 Falar
          </button>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={lendo}
          className={`${btn} bg-white/10 border border-white/20 text-white hover:bg-white/15`}>
          📷 Foto ou PDF
        </button>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={escolherArquivo} />
      </div>

      {(ouvindo || texto || parcial || semVoz) && (
        <div>
          {semVoz && <p className="text-[11px] text-sol mb-1">Este navegador não ouve — escreva como falaria (no celular, o 🎤 do teclado também funciona).</p>}
          <textarea
            value={`${texto}${parcial ? ` ${parcial}` : ''}`}
            onChange={(e) => { setTexto(e.target.value); setParcial('') }}
            rows={2}
            placeholder={ouvindo ? 'Ouvindo…' : 'O que foi pago, quanto, quando, de qual projeto…'}
            className="w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
          />
        </div>
      )}

      {arquivo && (
        <div className="flex items-center gap-2 text-xs text-white/75">
          {arquivo.previa
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={arquivo.previa} alt="" className="w-12 h-12 object-cover rounded border border-white/15" />
            : <span className="w-12 h-12 rounded border border-white/15 flex items-center justify-center text-lg">📄</span>}
          <span className="truncate flex-1">{arquivo.nome}</span>
          <button type="button" onClick={() => setArquivo(null)} className="text-white/50 hover:text-coral">✕</button>
        </div>
      )}

      {erro && <p className="text-xs text-coral">⚠ {erro}</p>}

      {(texto || parcial || arquivo) && (
        <button type="button" onClick={preencher} disabled={lendo} className={`${btn} w-full bg-sol text-noite hover:bg-sol/90`}>
          {lendo ? '⏳ Lendo e preenchendo…' : '⚡ Preencher o lançamento'}
        </button>
      )}
    </div>
  )
}
