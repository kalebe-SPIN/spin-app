'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { criarDisparoAction, disparosRecentesAction, cancelarDisparoAction, type DisparoRecente } from '@/app/inbox/disparo-actions'
import { LIMITE_DISPARO, LIMITE_MB_MIDIA, tipoDoMime } from '@/lib/spinzap/disparo-comum'

/**
 * Disparo em massa (Kalebe 2026-10-22): os contatos da lista filtrada recebem
 * mensagem, criativo ou gravação de voz — agora ou programado — enviado pela
 * Laís ou pela Bianca. Janela de 24h fechada: vai antes o modelo de retomada
 * (cobrado pela Meta) e o conteúdo sai quando o cliente responder.
 */

export type ContatoDisparo = { id: string; nome: string; telefone: string | null; janela_aberta: boolean; marcado: boolean }

type Tipo = 'texto' | 'midia' | 'audio'
const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sol/50'

function amanhaAs9(): string {
  const d = new Date(Date.now() + 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`
}

function Opcao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`px-3 py-2 rounded-xl text-xs font-bold text-start border ${ativo ? 'bg-weg-azul border-weg-azul text-white' : 'border-white/15 text-white/70 hover:text-white'}`}>
      {ativo ? '✓ ' : ''}{children}
    </button>
  )
}

export function ModalDisparo({ contatos, resumoFiltros, onFechar }: {
  contatos: ContatoDisparo[]
  resumoFiltros: string
  onFechar: () => void
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(contatos.filter((c) => c.marcado).slice(0, LIMITE_DISPARO).map((c) => c.id)))
  const [verLista, setVerLista] = useState(false)
  const [agente, setAgente] = useState<'lais' | 'bianca'>('bianca')
  const [tipo, setTipo] = useState<Tipo>('texto')
  const [texto, setTexto] = useState('')
  const [midia, setMidia] = useState<{ url: string; mime: string; nome: string } | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [quando, setQuando] = useState<'agora' | 'agendar'>('agora')
  const [dataHora, setDataHora] = useState(amanhaAs9())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [recentes, setRecentes] = useState<DisparoRecente[]>([])
  // Gravação de voz (mesmo gravador do composer: ogg/opus = nota de voz do WhatsApp)
  const gravadorRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)

  const carregarRecentes = () => disparosRecentesAction().then((r) => { if (!('erro' in r)) setRecentes(r.disparos) })
  useEffect(() => { carregarRecentes() }, [])
  useEffect(() => () => { clearInterval(timerRef.current); gravadorRef.current?.stop?.().catch?.(() => {}) }, [])

  const selecionados = contatos.filter((c) => marcados.has(c.id))
  const abertas = selecionados.filter((c) => c.janela_aberta).length
  const fechadas = selecionados.length - abertas

  function alternar(id: string) {
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else if (n.size < LIMITE_DISPARO) n.add(id)
      return n
    })
  }

  async function subir(arquivo: File) {
    const t = tipoDoMime(arquivo.type || '')
    if (arquivo.size > LIMITE_MB_MIDIA[t] * 1024 * 1024) { setErro(`Arquivo acima de ${LIMITE_MB_MIDIA[t]} MB — limite do WhatsApp pra ${t === 'image' ? 'imagem' : t === 'video' ? 'vídeo' : t === 'audio' ? 'áudio' : 'documento'}`); return }
    setErro(null); setSubindo(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      const nomeSeguro = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-80)
      const caminho = `${user?.id || 'anon'}/${Date.now()}-${nomeSeguro}`
      const { error } = await sb.storage.from('wa-disparos').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false })
      if (error) { setErro(/bucket|not found/i.test(error.message) ? 'Falta rodar a migration 159 (disparo em massa) no Supabase.' : `Falha ao enviar o arquivo: ${error.message}`); return }
      const url = sb.storage.from('wa-disparos').getPublicUrl(caminho).data.publicUrl
      setMidia({ url, mime: arquivo.type || 'application/octet-stream', nome: arquivo.name })
    } finally { setSubindo(false) }
  }

  async function iniciarGravacao() {
    setErro(null)
    try {
      const Recorder = (await import('opus-recorder')).default
      if (!Recorder.isRecordingSupported()) { setErro('Este navegador não grava áudio.'); return }
      const rec = new Recorder({ encoderPath: '/opus/encoderWorker.min.js', encoderSampleRate: 48000, encoderApplication: 2048, numberOfChannels: 1, streamPages: false })
      await rec.start()
      gravadorRef.current = rec
      setGravando(true); setSegundos(0); setMidia(null)
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    } catch (e: any) {
      setErro(e?.name === 'NotAllowedError' ? 'Libere o microfone pro portal no navegador (cadeado ao lado do endereço).' : `Não consegui gravar: ${e?.message || e}`)
    }
  }
  async function pararGravacao(guardar: boolean) {
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
      if (!guardar) return
      if (!dados?.length) { setErro('Áudio vazio'); return }
      await subir(new File([new Uint8Array(dados)], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' }))
    } catch (e: any) { setErro(`Falha no áudio: ${e?.message || e}`) }
  }

  async function disparar() {
    setErro(null); setOk(null)
    if (!selecionados.length) { setErro('Selecione pelo menos um contato'); return }
    if (tipo === 'texto' && !texto.trim()) { setErro('Escreva a mensagem'); return }
    if (tipo !== 'texto' && !midia) { setErro(tipo === 'audio' ? 'Grave o áudio primeiro' : 'Envie o criativo primeiro'); return }
    const resumo = `${quando === 'agora' ? 'Disparar agora' : `Programar pra ${new Date(dataHora).toLocaleString('pt-BR')}`} para ${selecionados.length} contato${selecionados.length === 1 ? '' : 's'}?` +
      (fechadas ? `\n\n${fechadas} com a janela de 24h fechada recebem antes o modelo de retomada (cobrado pela Meta); o conteúdo sai quando responderem.` : '')
    if (!confirm(resumo)) return
    setEnviando(true)
    try {
      const r = await criarDisparoAction({
        conversa_ids: selecionados.map((c) => c.id), agente, tipo, texto,
        midia: tipo === 'texto' ? null : midia, quando: quando === 'agendar' ? new Date(dataHora).toISOString() : null,
        filtros: { resumo: resumoFiltros },
      })
      if ('erro' in r) { setErro(r.erro); return }
      setOk(quando === 'agora'
        ? `Disparo iniciado: ${r.total} contato${r.total === 1 ? '' : 's'}. ${r.enviados_agora ? `${r.enviados_agora} já saíram; ` : ''}o resto sai em lotes nos próximos minutos.`
        : `Disparo programado: ${r.total} contato${r.total === 1 ? '' : 's'} em ${new Date(dataHora).toLocaleString('pt-BR')}.`)
      setTexto(''); setMidia(null)
      carregarRecentes()
    } finally { setEnviando(false) }
  }

  async function cancelar(id: string) {
    if (!confirm('Cancelar o que ainda não saiu desse disparo?')) return
    const r = await cancelarDisparoAction(id)
    if ('erro' in r) setErro(r.erro)
    else { setOk(`${r.cancelados} envio${r.cancelados === 1 ? '' : 's'} cancelado${r.cancelados === 1 ? '' : 's'}.`); carregarRecentes() }
  }

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
  const tipoMidia = midia ? tipoDoMime(midia.mime) : null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onFechar}>
      <div className="bg-noite border border-white/15 rounded-2xl w-full max-w-xl p-4 sm:p-5 space-y-4 my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white">📣 Disparo pros contatos filtrados</h3>
            <p className="text-[11px] text-white/50">{resumoFiltros || 'Sem filtro'} · até {LIMITE_DISPARO} por disparo</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/60 hover:text-white">✕</button>
        </div>

        {/* Contatos */}
        <div className="rounded-xl border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white">{selecionados.length} de {contatos.length} selecionado{selecionados.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => setVerLista((v) => !v)} className="text-[11px] font-bold text-white/70 hover:text-white">{verLista ? 'esconder lista ▾' : 'ver e ajustar ▸'}</button>
          </div>
          <p className="text-[11px] text-white/60">
            {abertas} com a janela de 24h aberta (recebem direto)
            {fechadas > 0 && <> · {fechadas} com a janela fechada (modelo de retomada antes, cobrado pela Meta — o conteúdo sai quando responderem)</>}
          </p>
          {verLista && (
            <div className="space-y-1">
              <div className="flex gap-2">
                <button type="button" onClick={() => setMarcados(new Set(contatos.slice(0, LIMITE_DISPARO).map((c) => c.id)))} className="text-[11px] font-bold text-white/70 hover:text-white">marcar todos</button>
                <button type="button" onClick={() => setMarcados(new Set())} className="text-[11px] font-bold text-white/70 hover:text-white">desmarcar todos</button>
              </div>
              <ul className="max-h-48 overflow-y-auto space-y-0.5">
                {contatos.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2 px-1 py-1 rounded hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
                      <span className="text-[12px] text-white/85 truncate flex-1">{c.nome}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${c.janela_aberta ? 'border-verde/50' : 'border-white/20'} text-white/60`}>{c.janela_aberta ? 'janela aberta' : 'janela fechada'}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {contatos.length > LIMITE_DISPARO && <p className="text-[10px] text-white/45">Lista com mais de {LIMITE_DISPARO}: marque no máximo {LIMITE_DISPARO} e faça outro disparo com o resto.</p>}
            </div>
          )}
        </div>

        {/* Quem envia */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-bold text-white/60">Quem envia</span>
          <div className="flex gap-2">
            <Opcao ativo={agente === 'bianca'} onClick={() => setAgente('bianca')}>Bianca</Opcao>
            <Opcao ativo={agente === 'lais'} onClick={() => setAgente('lais')}>Laís</Opcao>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="space-y-2">
          <span className="block text-[11px] font-bold text-white/60">O que enviar</span>
          <div className="flex flex-wrap gap-2">
            <Opcao ativo={tipo === 'texto'} onClick={() => { setTipo('texto'); setMidia(null) }}>💬 Mensagem</Opcao>
            <Opcao ativo={tipo === 'midia'} onClick={() => { setTipo('midia'); setMidia(null) }}>🖼️ Criativo (imagem, vídeo, PDF)</Opcao>
            <Opcao ativo={tipo === 'audio'} onClick={() => { setTipo('audio'); setMidia(null) }}>🎙️ Gravar áudio</Opcao>
          </div>
          {tipo === 'midia' && (
            <div className="space-y-1.5">
              <input type="file" accept="image/jpeg,image/png,video/mp4,application/pdf" disabled={subindo}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(f) }}
                className="block w-full text-[12px] text-white/70 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-weg-azul file:text-white file:text-xs file:font-bold" />
              {subindo && <p className="text-[11px] text-white/50">Enviando o arquivo…</p>}
              {midia && tipoMidia === 'image' && <img src={midia.url} alt="Criativo" className="max-h-40 rounded-lg border border-white/10" />}
              {midia && tipoMidia === 'video' && <video src={midia.url} controls className="max-h-40 rounded-lg border border-white/10" />}
              {midia && tipoMidia === 'document' && <p className="text-[12px] text-white/80">📄 {midia.nome}</p>}
              <p className="text-[10px] text-white/45">Imagem até 5 MB; vídeo (MP4) e PDF até 16 MB.</p>
            </div>
          )}
          {tipo === 'audio' && (
            <div className="space-y-1.5">
              {!gravando ? (
                <button type="button" onClick={iniciarGravacao} disabled={subindo}
                  className="px-3 py-2 rounded-xl bg-weg-azul text-white text-xs font-bold text-start disabled:opacity-40">{midia ? '🎙️ Gravar de novo' : '🎙️ Começar a gravar'}</button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white tabular-nums">🔴 {mmss}</span>
                  <button type="button" onClick={() => pararGravacao(true)} className="px-3 py-2 rounded-xl bg-verde text-white text-xs font-bold text-start">✓ Concluir</button>
                  <button type="button" onClick={() => pararGravacao(false)} className="px-3 py-2 rounded-xl border border-white/15 text-white/70 text-xs font-bold">Descartar</button>
                </div>
              )}
              {subindo && <p className="text-[11px] text-white/50">Guardando o áudio…</p>}
              {midia && tipoMidia === 'audio' && <audio src={midia.url} controls className="w-full h-9" />}
            </div>
          )}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} className={`${inputCls} resize-y`}
            placeholder={tipo === 'texto' ? 'Mensagem — use {nome} pro primeiro nome do cliente' : tipo === 'audio' ? 'Texto antes do áudio (opcional) — {nome} = primeiro nome' : 'Legenda do criativo (opcional) — {nome} = primeiro nome'} />
        </div>

        {/* Quando */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-bold text-white/60">Quando</span>
          <div className="flex flex-wrap items-center gap-2">
            <Opcao ativo={quando === 'agora'} onClick={() => setQuando('agora')}>Agora</Opcao>
            <Opcao ativo={quando === 'agendar'} onClick={() => setQuando('agendar')}>Programar</Opcao>
            {quando === 'agendar' && (
              <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} className={`${inputCls} w-auto`} />
            )}
          </div>
        </div>

        {erro && <p className="text-[12px] text-white/85 border border-coral/50 rounded-lg px-3 py-2">⚠ {erro}</p>}
        {ok && <p className="text-[12px] text-white/85 border border-verde/50 rounded-lg px-3 py-2">✓ {ok}</p>}

        <button type="button" onClick={disparar} disabled={enviando || subindo || gravando || !selecionados.length}
          className="w-full py-3 rounded-xl bg-verde text-white font-bold text-sm text-start px-4 disabled:opacity-40">
          {enviando ? 'Disparando…' : quando === 'agora' ? `📣 Disparar agora para ${selecionados.length}` : `🗓 Programar para ${selecionados.length}`}
        </button>

        {/* Andamento dos últimos disparos */}
        {recentes.length > 0 && (
          <div className="rounded-xl border border-white/10 p-3 space-y-2">
            <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Últimos disparos</p>
            {recentes.map((d) => {
              const c = d.contagem
              const pendentes = c.agendado + c.aguardando_cliente
              return (
                <div key={d.id} className="text-[11px] text-white/75 border-t border-white/5 pt-1.5 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {d.tipo === 'audio' ? '🎙️' : d.tipo === 'midia' ? '🖼️' : '💬'} {new Date(d.executar_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{d.agente === 'lais' ? 'Laís' : 'Bianca'}{d.autor ? ` · por ${d.autor}` : ''}{d.status === 'cancelado' ? ' · cancelado' : ''}
                    </span>
                    {pendentes > 0 && d.status !== 'cancelado' && (
                      <button type="button" onClick={() => cancelar(d.id)} className="text-[11px] font-bold text-white/70 hover:text-white shrink-0">cancelar</button>
                    )}
                  </div>
                  <p className="text-white/55">
                    {c.enviado} enviados · {c.agendado} na fila · {c.aguardando_cliente} esperando o cliente responder
                    {c.aguardando_humano + c.falhou > 0 ? ` · ${c.aguardando_humano + c.falhou} sem envio` : ''} (de {d.total})
                  </p>
                  {d.texto && <p className="text-white/45 truncate">“{d.texto}”</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
