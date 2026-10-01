'use client'

import { useEffect, useRef, useState } from 'react'
import { enviarTextoAction, enviarArquivoAction, iniciarChamadaAction, janelaAbertaAction } from '@/app/inbox/actions'
import { ModalAgendaBianca } from './ModalAgendaBianca'
import {
  IconeClipe, IconeAgenda, IconeTelefone, IconeVideo, IconeMicrofone, IconeEnviar, IconeLixeira, IconeCarregando,
} from './IconesChat'

/**
 * Caixa de mensagem no estilo WhatsApp (Kalebe 2026-09-29), usada no inbox
 * e na caixa de conversa do projeto:
 *   clipe · agenda da Bianca · texto · ligação · vídeo · microfone/enviar
 * Áudio gravado em Ogg/Opus (formato de mensagem de voz do WhatsApp) com
 * opus-recorder — o Chrome só grava WebM, que a Meta recusa.
 * `obterConversaId` devolve a conversa (a caixa do projeto cria o canal no
 * 1º envio).
 */

const LIMITE_ARQUIVO = 4 * 1024 * 1024       // teto do corpo da requisição na Vercel

export const MSG_JANELA_FECHADA =
  'Não enviado: o cliente não mandou mensagem pro número da Spin nas últimas 24h, e aí o WhatsApp não entrega o que sai do sistema. ' +
  'Mande a primeira mensagem pelo WhatsApp Business do celular ou do computador (ela aparece aqui) — quando o cliente responder, o inbox volta a enviar por 24h.'
const LIMITE_AUDIO_S = 5 * 60

export function ComposerWhatsApp({
  obterConversaId,
  placeholder,
  onEnviado,
  onErro,
}: {
  obterConversaId: () => Promise<string | null>
  placeholder: string
  onEnviado: () => void
  onErro: (msg: string | null) => void
}) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState<null | 'texto' | 'arquivo' | 'voz' | 'video' | 'audio' | 'agenda'>(null)
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [agendaConversa, setAgendaConversa] = useState<string | null>(null)
  // Kalebe 2026-10-01: janela de 24h fechada → em vez de só o erro, oferece
  // mandar pelo app WhatsApp Business do número Spin com o texto já pronto
  const [janelaFechada, setJanelaFechada] = useState<{ telefone: string | null; tipo: string } | null>(null)
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const gravadorRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => { clearInterval(timerRef.current); gravadorRef.current?.close?.().catch(() => {}) }, [])

  // Teto de 5 min: para e envia sozinho
  useEffect(() => {
    if (gravando && segundos >= LIMITE_AUDIO_S) finalizarGravacao(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravando, segundos])

  // textarea cresce com o texto (até 5 linhas), como no WhatsApp
  useEffect(() => {
    const t = textareaRef.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`
  }, [texto])

  async function comConversa<T>(tipo: NonNullable<typeof ocupado>, fn: (id: string) => Promise<T>) {
    onErro(null); setOcupado(tipo); setJanelaFechada(null)
    try {
      const id = await obterConversaId()
      if (!id) return
      // Kalebe 2026-09-29: fora da janela de 24h a Meta aceita e recusa depois
      // ("Re-engagement message") — confere antes e explica o que fazer.
      const janela = await janelaAbertaAction(id)
      if ('erro' in janela) { onErro(janela.erro); return }
      if (!janela.aberta) {
        if (janela.telefone) setJanelaFechada({ telefone: janela.telefone, tipo })
        else onErro(MSG_JANELA_FECHADA)
        return
      }
      await fn(id)
    } catch (e: any) {
      onErro(e?.message || 'Falha no envio')
    } finally { setOcupado(null) }
  }

  function enviarTexto() {
    const t = texto.trim()
    if (!t || ocupado) return
    comConversa('texto', async (id) => {
      const r = await enviarTextoAction({ conversa_id: id, texto: t })
      if ('erro' in r) { onErro(r.erro); return }
      setTexto('')
      onEnviado()
    })
  }

  async function enviarArquivoFile(arquivo: File, legenda: string, tipo: 'arquivo' | 'audio') {
    await comConversa(tipo, async (id) => {
      const fd = new FormData()
      fd.append('conversa_id', id)
      fd.append('arquivo', arquivo)
      if (legenda) fd.append('legenda', legenda)
      const r = await enviarArquivoAction(fd)
      if ('erro' in r) { onErro(r.erro); return }
      onEnviado()
    })
  }

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > LIMITE_ARQUIVO) {
      onErro('Arquivo acima de 4 MB: envie pelo WhatsApp do celular ou do computador — ele aparece aqui no histórico do mesmo jeito.')
      return
    }
    const legenda = window.prompt('Legenda (opcional):') || ''
    enviarArquivoFile(f, legenda, 'arquivo')
  }

  function chamada(tipo: 'voz' | 'video') {
    comConversa(tipo, async (id) => {
      const r = await iniciarChamadaAction({ conversa_id: id, tipo })
      if ('erro' in r) { onErro(r.erro); return }
      window.open(r.url_sala, '_blank', 'noopener')
      onEnviado()
    })
  }

  async function abrirAgenda() {
    onErro(null); setOcupado('agenda')
    try {
      const id = await obterConversaId()
      if (id) setAgendaConversa(id)
    } finally { setOcupado(null) }
  }

  // ─── Áudio ────────────────────────────────────────────────────────────
  async function iniciarGravacao() {
    onErro(null)
    try {
      const Recorder = (await import('opus-recorder')).default
      if (!Recorder.isRecordingSupported()) { onErro('Este navegador não grava áudio.'); return }
      const rec = new Recorder({
        encoderPath: '/opus/encoderWorker.min.js',
        encoderSampleRate: 48000,
        encoderApplication: 2048,      // otimizado pra voz
        numberOfChannels: 1,
        streamPages: false,
      })
      await rec.start()
      gravadorRef.current = rec
      setGravando(true)
      setSegundos(0)
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    } catch (e: any) {
      onErro(e?.name === 'NotAllowedError'
        ? 'Libere o microfone pro portal no navegador (cadeado ao lado do endereço).'
        : `Não consegui gravar: ${e?.message || e}`)
    }
  }

  async function finalizarGravacao(enviar: boolean) {
    clearInterval(timerRef.current)
    const rec = gravadorRef.current
    gravadorRef.current = null
    setGravando(false)
    if (!rec) return
    try {
      const dados: Uint8Array = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('o gravador não respondeu')), 15000)
        rec.ondataavailable = (d: Uint8Array) => { clearTimeout(t); resolve(d) }
        rec.stop().catch(reject)
      })
      rec.close?.().catch(() => {})
      if (!enviar) return
      if (!dados?.length) { onErro('Áudio vazio'); return }
      const arquivo = new File([new Uint8Array(dados)], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' })
      await enviarArquivoFile(arquivo, '', 'audio')
    } catch (e: any) {
      onErro(`Falha no áudio: ${e?.message || e}`)
    }
  }

  // App WhatsApp Business do número Spin (coexistência): sem a trava de 24h da
  // API, e o que sai por ele volta pra esta conversa pelo eco
  function enviarPeloApp() {
    if (!janelaFechada?.telefone) return
    let tel = janelaFechada.telefone.replace(/\D/g, '')
    if (tel.length === 10 || tel.length === 11) tel = '55' + tel
    const t = janelaFechada.tipo === 'texto' ? texto.trim() : ''
    const celular = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    const q = t ? `text=${encodeURIComponent(t)}` : ''
    window.location.href = celular
      ? `https://wa.me/${tel}${q ? `?${q}` : ''}`
      : `whatsapp://send?phone=${tel}${q ? `&${q}` : ''}`
    if (t) setTexto('')
    setJanelaFechada(null)
  }

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
  const botao = 'w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition'

  return (
    <>
      {janelaFechada && (
        <div className="mb-2 rounded-xl bg-sol/10 border border-sol/30 p-2.5 text-xs text-white/80 space-y-2">
          <p>
            🔒 <strong className="text-sol">Janela de 24h fechada</strong> — o cliente não escreveu pro número da Spin
            nas últimas 24h e o WhatsApp não entrega o que sai do sistema.{' '}
            <span className="text-white/60">Pelo app WhatsApp Business do número Spin não tem essa trava — e a mensagem aparece aqui.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={enviarPeloApp}
              className="px-3 py-1.5 rounded-lg bg-verde text-noite font-bold hover:bg-verde/90">
              📱 {janelaFechada.tipo === 'texto' && texto.trim() ? 'Enviar pelo WhatsApp Business (mensagem pronta)' : 'Abrir no WhatsApp Business'}
            </button>
            <button type="button" onClick={() => setJanelaFechada(null)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-white/70 hover:bg-white/10">
              Fechar
            </button>
          </div>
        </div>
      )}
      {gravando ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => finalizarGravacao(false)} className={botao} title="Descartar áudio">
            <IconeLixeira />
          </button>
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.04] border border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-coral animate-pulse" />
            <span className="text-sm text-white font-mono">{mmss}</span>
            <span className="text-xs text-white/40">gravando…</span>
          </div>
          <button type="button" onClick={() => finalizarGravacao(true)}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-verde text-noite hover:bg-verde/90" title="Enviar áudio">
            <IconeEnviar size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          <button type="button" onClick={() => inputArquivoRef.current?.click()} disabled={!!ocupado} className={botao} title="Anexar arquivo, foto ou documento">
            {ocupado === 'arquivo' ? <IconeCarregando /> : <IconeClipe />}
          </button>
          <button type="button" onClick={abrirAgenda} disabled={!!ocupado} className={botao} title="Agendar follow-up, tarefa ou evento com a Bianca">
            {ocupado === 'agenda' ? <IconeCarregando /> : <IconeAgenda />}
          </button>
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto() } }}
            placeholder={placeholder}
            rows={1}
            className="flex-1 min-w-0 px-4 py-2 bg-white/[0.05] border border-white/10 focus:border-white/25 rounded-2xl text-sm text-white resize-none focus:outline-none leading-5"
          />
          <button type="button" onClick={() => chamada('voz')} disabled={!!ocupado} className={botao} title="Ligação (sala no navegador)">
            {ocupado === 'voz' ? <IconeCarregando /> : <IconeTelefone />}
          </button>
          <button type="button" onClick={() => chamada('video')} disabled={!!ocupado} className={botao} title="Videochamada (sala no navegador)">
            {ocupado === 'video' ? <IconeCarregando /> : <IconeVideo />}
          </button>
          {texto.trim() ? (
            <button type="button" onClick={enviarTexto} disabled={!!ocupado}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-verde text-noite hover:bg-verde/90 disabled:opacity-50" title="Enviar">
              {ocupado === 'texto' ? <IconeCarregando size={18} /> : <IconeEnviar size={18} />}
            </button>
          ) : (
            <button type="button" onClick={iniciarGravacao} disabled={!!ocupado}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-verde text-noite hover:bg-verde/90 disabled:opacity-50" title="Gravar áudio">
              {ocupado === 'audio' ? <IconeCarregando size={18} /> : <IconeMicrofone size={18} />}
            </button>
          )}
          <input
            ref={inputArquivoRef}
            type="file"
            className="hidden"
            onChange={escolherArquivo}
            accept="image/*,application/pdf,audio/*,video/*,.doc,.docx,.xls,.xlsx"
          />
        </div>
      )}

      {agendaConversa && <ModalAgendaBianca conversaId={agendaConversa} onFechar={() => setAgendaConversa(null)} />}
    </>
  )
}
