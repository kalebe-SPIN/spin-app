'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  enviarLevantamentoAction, excluirLevantamentoAction, registrarArquivoLevantamentoAction,
  removerArquivoLevantamentoAction, salvarLevantamentoAction,
} from '@/app/levantamentos/actions'
import { BUCKET_LEVANTAMENTOS, itensCarga, numeroBR, numeroParaCampo } from '@/lib/levantamentos/comum'
import { ListaCargas } from './ListaCargas'
import { prepararArquivo } from '@/lib/levantamentos/imagem'
import { calcularProgresso, preenchido } from '@/lib/levantamentos/progresso'
import { numeroLevantamento, type CampoModelo, type FotoModelo, type Respostas } from '@/lib/levantamentos/types'
import type { ArquivoTela, LevantamentoTela } from '@/lib/levantamentos/tela'
import { BarraProgresso, EtiquetaStatus, Historico, cardCls, inputCls, type EventoTela } from './ui'

const LIMITE_BYTES = 20 * 1024 * 1024
const horaBR = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

/**
 * Formulário do levantamento, desenhado a partir do modelo (JSON validado).
 * Mobile-first; salva sozinho (1,2 s depois da última mudança, uma gravação
 * por vez, e grava o pendente ao sair da tela).
 */
export function FormularioLevantamento({ lev, arquivosIniciais, eventos, podeExcluir }: {
  lev: LevantamentoTela
  arquivosIniciais: ArquivoTela[]
  eventos: EventoTela[]
  podeExcluir: boolean
}) {
  const router = useRouter()
  const modelo = lev.modelo
  const [respostas, setRespostas] = useState<Respostas>(lev.respostas)
  const [textos, setTextos] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {}
    for (const s of modelo.secoes) for (const c of s.campos) if (c.tipo === 'number') t[c.id] = numeroParaCampo(lev.respostas[c.id])
    return t
  })
  const [auto, setAuto] = useState<Set<string>>(() => new Set(lev.preenchidosAuto))
  const [arquivos, setArquivos] = useState<ArquivoTela[]>(arquivosIniciais.filter((a) => a.tipo === 'foto' || a.tipo === 'documento'))
  const [msg, setMsg] = useState(lev.preenchidosAuto.length ? 'Trazendo o que já foi preenchido antes…' : `Última alteração ${new Date(lev.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  const [enviandoSlot, setEnviandoSlot] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // ── salvamento automático ───────────────────────────────────────────
  const ultimo = useRef(respostas)
  const arquivosRef = useRef(arquivos)
  arquivosRef.current = arquivos
  const pendente = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fila = useRef<Promise<void>>(Promise.resolve())
  const parado = useRef(false)

  const salvar = useCallback((): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!pendente.current || parado.current) return fila.current
    pendente.current = false
    const corpo = ultimo.current
    const pct = calcularProgresso(modelo, corpo, arquivosRef.current).pct
    fila.current = fila.current.then(async () => {
      try {
        const r = await salvarLevantamentoAction(lev.id, corpo, pct)
        if ('erro' in r) { parado.current = true; setMsg(r.erro); return }
        if (!pendente.current) setMsg(`Salvo às ${horaBR()}`)
      } catch {
        pendente.current = true
        setMsg('Falha ao salvar (sem internet?). Tentando de novo em instantes…')
        timer.current = setTimeout(() => { salvar() }, 4000)
      }
    })
    return fila.current
  }, [lev.id, modelo])

  const agendar = useCallback((novas: Respostas) => {
    ultimo.current = novas
    pendente.current = true
    setMsg('Alterações não salvas…')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { salvar() }, 1200)
  }, [salvar])

  useEffect(() => {
    if (lev.preenchidosAuto.length) agendar(ultimo.current)
    const aoEsconder = () => { if (document.visibilityState === 'hidden') salvar() }
    const aoSair = () => { salvar() }
    document.addEventListener('visibilitychange', aoEsconder)
    window.addEventListener('pagehide', aoSair)
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder)
      window.removeEventListener('pagehide', aoSair)
      salvar()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function mudar(id: string, v: Respostas[string]) {
    const novas = { ...ultimo.current }
    if (v == null || (Array.isArray(v) && !v.length) || v === '') delete novas[id]
    else novas[id] = v
    setRespostas(novas)
    if (auto.has(id)) setAuto((a) => { const n = new Set(a); n.delete(id); return n })
    agendar(novas)
  }

  // ── progresso e pendências ──────────────────────────────────────────
  const prog = useMemo(() => calcularProgresso(modelo, respostas, arquivos), [modelo, respostas, arquivos])
  const pendProjetista = useMemo(() => {
    const m = new Map<string, string[]>()
    if (lev.status === 'com_pendencia') {
      for (const p of lev.pendencias) if (p.origem === 'projetista') m.set(p.campo, [...(m.get(p.campo) || []), p.mensagem])
    }
    return m
  }, [lev.pendencias, lev.status])

  // ── fotos ───────────────────────────────────────────────────────────
  async function enviarArquivos(slot: string, lista: FileList | null) {
    if (!lista?.length) return
    setEnviandoSlot(slot); setErro(null)
    const supabase = createClient()
    const falhas: string[] = []
    for (const file of Array.from(lista)) {
      try {
        const { blob, mime, ext } = await prepararArquivo(file)
        if (blob.size > LIMITE_BYTES) throw new Error('Arquivo muito grande (máx. 20 MB).')
        const caminho = `${lev.id}/fotos/${slot}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from(BUCKET_LEVANTAMENTOS).upload(caminho, blob, { contentType: mime, upsert: false })
        if (up.error) throw new Error(/row-level|security|403/i.test(up.error.message) ? 'Sem permissão para enviar foto neste levantamento.' : 'Falha no envio. Tente de novo.')
        const r = await registrarArquivoLevantamentoAction(lev.id, { slot, caminho, mime, nome: file.name || 'arquivo', tamanho: blob.size })
        if ('erro' in r) throw new Error(r.erro)
        setArquivos((a) => [...a, {
          id: r.id, tipo: mime === 'application/pdf' ? 'documento' : 'foto', slot, mime, nome: file.name || null,
          url: r.url || URL.createObjectURL(blob), versao_prancha: null, created_at: new Date().toISOString(),
        }])
      } catch (e) {
        falhas.push(`${file.name || 'arquivo'}: ${(e as Error).message}`)
      }
    }
    setEnviandoSlot(null)
    if (falhas.length) setErro(falhas.join(' · '))
    agendar(ultimo.current) // progresso muda com a foto
  }

  async function removerArquivo(a: ArquivoTela) {
    setConfirmar(null)
    const r = await removerArquivoLevantamentoAction(a.id)
    if ('erro' in r) { setErro(r.erro); return }
    setArquivos((lista) => lista.filter((x) => x.id !== a.id))
    agendar(ultimo.current)
  }

  // ── envio e exclusão ────────────────────────────────────────────────
  async function enviar() {
    setOcupado(true); setErro(null)
    pendente.current = true
    await salvar()
    const r = await enviarLevantamentoAction(lev.id, ultimo.current)
    setOcupado(false)
    if ('erro' in r) { setErro(r.erro); return }
    parado.current = true
    router.refresh()
  }

  async function excluir() {
    setOcupado(true); setErro(null)
    parado.current = true
    const r = await excluirLevantamentoAction(lev.id)
    if ('erro' in r) { setOcupado(false); parado.current = false; setErro(r.erro); return }
    router.push('/levantamentos')
  }

  const temCampoCarga = modelo.secoes.some((s) => s.campos.some((c) => c.id === 'carga' && c.tipo === 'number'))
  const irPara = (id: string) => document.getElementById(`lev-${id.replace(':', '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const reenviar = lev.status === 'com_pendencia'

  return (
    <div className="space-y-4 pb-10">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-white/45">Checklist · {numeroLevantamento(lev.numero)}{!lev.ehAutor && lev.consultor_nome ? ` · de ${lev.consultor_nome}` : ''}</p>
        <h1 className="text-2xl font-black text-white">{modelo.nome}</h1>
        <p className="text-sm text-white/60">{modelo.descricao}</p>
      </header>

      <div className="sticky top-14 z-20 rounded-xl border border-white/10 bg-noite/95 backdrop-blur p-3 space-y-2 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <strong className="text-white min-w-0 truncate">{String(respostas.cliente || '') || 'Novo levantamento'}</strong>
          <span className="text-sm text-white/80 tabular-nums shrink-0">{prog.ok}/{prog.total} · {prog.pct}%</span>
        </div>
        <BarraProgresso pct={prog.pct} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-white/50 min-w-0 truncate">{msg}</span>
          <EtiquetaStatus status={lev.status} />
        </div>
      </div>

      {pendProjetista.size > 0 && (
        <div className="rounded-xl border border-sol/60 bg-white/[0.03] p-4 space-y-2">
          <p className="text-sm font-bold text-white">O projeto devolveu com pendências — corrija e reenvie</p>
          <ul className="space-y-1">
            {lev.pendencias.filter((p) => p.origem === 'projetista').map((p, i) => (
              <li key={i}>
                <button type="button" onClick={() => irPara(p.campo)} className="text-start text-sm text-white/85 underline decoration-sol/60 underline-offset-2">
                  {p.mensagem}
                </button>
              </li>
            ))}
          </ul>
          {lev.observacao_projetista && <p className="text-xs text-white/60">Projetista: {lev.observacao_projetista}</p>}
        </div>
      )}

      {lev.preenchidosAuto.length > 0 && auto.size > 0 && (
        <p className="text-xs text-white/60 rounded-lg border border-white/10 px-3 py-2">
          ↺ {auto.size} campo{auto.size > 1 ? 's vieram' : ' veio'} do que já estava preenchido no projeto ou em outro levantamento. Confira antes de enviar.
        </p>
      )}

      {modelo.secoes.map((s) => {
        const obrig = s.campos.filter((c) => c.obrigatorio)
        const ok = obrig.filter((c) => preenchido(respostas[c.id])).length
        return (
          <details key={s.id} open className={cardCls}>
            <summary className="cursor-pointer flex items-center justify-between gap-3 list-none">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">{s.titulo}</h2>
              <span className={`text-xs tabular-nums ${ok === obrig.length ? 'text-white/85' : 'text-white/50'}`}>{ok === obrig.length ? '✓ ' : ''}{ok}/{obrig.length}</span>
            </summary>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {s.campos.map((c) => (
                <Campo key={c.id} c={c} valor={respostas[c.id]} texto={textos[c.id] ?? ''}
                  doCadastro={auto.has(c.id)} pendencias={pendProjetista.get(c.id) || []}
                  onTexto={(t) => { setTextos((x) => ({ ...x, [c.id]: t })); mudar(c.id, numeroBR(t)) }}
                  onValor={(v) => mudar(c.id, v)}
                  onUsarSoma={c.tipo === 'cargas' && temCampoCarga ? (kw) => {
                    setTextos((x) => ({ ...x, carga: numeroParaCampo(kw) })); mudar('carga', kw)
                  } : undefined} />
              ))}
            </div>
          </details>
        )
      })}

      <details open className={cardCls}>
        <summary className="cursor-pointer flex items-center justify-between gap-3 list-none">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Fotos e documentos</h2>
          {(() => {
            const obrig = modelo.fotos.filter((f) => f.obrigatorio)
            const ok = obrig.filter((f) => arquivos.some((a) => a.slot === f.id)).length
            return <span className={`text-xs tabular-nums ${ok === obrig.length ? 'text-white/85' : 'text-white/50'}`}>{ok === obrig.length ? '✓ ' : ''}{ok}/{obrig.length}</span>
          })()}
        </summary>
        <div className="mt-4 space-y-3">
          {modelo.fotos.map((f) => (
            <SlotFoto key={f.id} f={f} arquivos={arquivos.filter((a) => a.slot === f.id)}
              enviando={enviandoSlot === f.id} confirmar={confirmar} pendencias={pendProjetista.get(`foto:${f.id}`) || []}
              onArquivos={(l) => enviarArquivos(f.id, l)} onConfirmar={setConfirmar} onRemover={removerArquivo} />
          ))}
        </div>
      </details>

      {prog.faltando.length > 0 && (
        <div className="rounded-xl border border-white/10 p-4 text-sm text-white/80">
          <b className="text-white">Faltam {prog.faltando.length} {prog.faltando.length > 1 ? 'itens' : 'item'}:</b>{' '}
          {prog.faltando.map((p, i) => (
            <span key={p.campo}>
              {i > 0 && ' · '}
              <button type="button" onClick={() => irPara(p.campo)} className="underline decoration-white/30 underline-offset-2">{p.mensagem}</button>
            </span>
          ))}
        </div>
      )}

      {erro && <p className="text-sm text-coral">⚠ {erro}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={enviar} disabled={ocupado || !!enviandoSlot} className="px-5 py-3 bg-sol text-noite font-bold rounded-lg disabled:opacity-50">
          {ocupado ? 'Enviando…' : reenviar ? 'Reenviar ao projeto' : 'Enviar ao projeto'}
        </button>
        {!podeExcluir ? null : confirmar === 'excluir' ? (
          <>
            <button type="button" onClick={excluir} disabled={ocupado} className="px-4 py-3 bg-coral text-white font-bold rounded-lg disabled:opacity-50">Confirmar exclusão</button>
            <button type="button" onClick={() => setConfirmar(null)} className="px-4 py-3 text-white/60 text-sm">Cancelar</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmar('excluir')} disabled={ocupado} className="px-4 py-3 border border-coral/50 text-white/80 text-sm rounded-lg">Excluir levantamento</button>
        )}
      </div>
      <p className="text-xs text-white/50">
        {prog.faltando.length
          ? 'Pode enviar com pendências; elas aparecem como “A PREENCHER” no projeto.'
          : 'Tudo preenchido.'}
      </p>

      <Historico eventos={eventos} />
    </div>
  )
}

function Campo({ c, valor, texto, doCadastro, pendencias, onTexto, onValor, onUsarSoma }: {
  c: CampoModelo
  valor: Respostas[string] | undefined
  texto: string
  doCadastro: boolean
  pendencias: string[]
  onTexto: (t: string) => void
  onValor: (v: Respostas[string]) => void
  onUsarSoma?: (kw: number) => void
}) {
  const falta = c.obrigatorio && !preenchido(valor)
  const borda = pendencias.length ? 'border-coral/70' : falta ? 'border-sol/70' : 'border-white/10 focus:border-sol/50'
  let avisos = pendencias
  const largo = c.largura === 'inteira' || c.tipo === 'textarea' || c.tipo === 'radio' || c.tipo === 'checks' || c.tipo === 'cargas'
  const idHtml = `lev-${c.id}`
  const rotulo = (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
      {c.rotulo}{c.obrigatorio && <span className="text-coral ml-0.5">*</span>}
    </span>
  )
  let entrada: React.ReactNode
  if (c.tipo === 'cargas') {
    entrada = (
      <div id={idHtml}>
        <ListaCargas itens={itensCarga(valor)} onChange={(l) => onValor(l)} onUsarSoma={onUsarSoma}
          borda={pendencias.length ? 'border-coral/70' : falta ? 'border-sol/70' : 'border-white/10'} />
      </div>
    )
  } else if (c.tipo === 'select') {
    entrada = (
      <select id={idHtml} value={typeof valor === 'string' ? valor : ''} onChange={(e) => onValor(e.target.value || null)} className={`${inputCls} ${borda}`}>
        <option value="">Selecione…</option>
        {(c.opcoes || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  } else if (c.tipo === 'radio' || c.tipo === 'checks') {
    const marcados: string[] = c.tipo === 'checks' ? (Array.isArray(valor) ? valor.filter((x): x is string => typeof x === 'string') : []) : typeof valor === 'string' ? [valor] : []
    entrada = (
      <div id={idHtml} role={c.tipo === 'radio' ? 'radiogroup' : 'group'} className="flex flex-wrap gap-2">
        {(c.opcoes || []).map((o) => {
          const on = marcados.includes(o)
          return (
            <button key={o} type="button" aria-pressed={on}
              onClick={() => onValor(c.tipo === 'radio' ? (on ? null : o) : on ? marcados.filter((x) => x !== o) : [...marcados, o])}
              className={`px-3 py-2 rounded-lg border text-sm ${on ? 'border-sol bg-white/5 text-white font-semibold' : `${falta || pendencias.length ? borda : 'border-white/15'} text-white/70`}`}>
              {o}
            </button>
          )
        })}
      </div>
    )
  } else if (c.tipo === 'textarea') {
    entrada = <textarea id={idHtml} rows={3} value={typeof valor === 'string' ? valor : ''} onChange={(e) => onValor(e.target.value)} className={`${inputCls} ${borda} resize-y`} />
  } else if (c.tipo === 'number') {
    const invalido = texto.trim() !== '' && numeroBR(texto) == null
    entrada = (
      <div className="flex items-center gap-2">
        <input id={idHtml} type="text" inputMode="decimal" value={texto} onChange={(e) => onTexto(e.target.value)} className={`${inputCls} ${invalido ? 'border-coral/70' : borda}`} />
        {c.unidade && <span className="text-sm text-white/55 shrink-0">{c.unidade}</span>}
      </div>
    )
    if (invalido) avisos = [...pendencias, 'Use só números (vírgula para decimais).']
  } else {
    entrada = (
      <input id={idHtml} type={c.tipo === 'tel' ? 'tel' : c.tipo === 'date' ? 'date' : 'text'} value={typeof valor === 'string' ? valor : valor == null ? '' : String(valor)}
        onChange={(e) => onValor(e.target.value)} className={`${inputCls} ${borda}`} />
    )
  }
  return (
    <div className={`grid gap-1.5 min-w-0 ${largo ? 'sm:col-span-2' : ''}`}>
      {c.tipo === 'radio' || c.tipo === 'checks' || c.tipo === 'cargas' ? rotulo : <label htmlFor={idHtml}>{rotulo}</label>}
      {entrada}
      {c.ajuda && <span className="text-xs text-white/50">{c.ajuda}</span>}
      {doCadastro && <span className="text-[11px] text-white/45">↺ veio do que já estava preenchido — confira</span>}
      {avisos.map((p, i) => <span key={i} className="text-xs text-coral">⚠ {p}</span>)}
    </div>
  )
}

function SlotFoto({ f, arquivos, enviando, confirmar, pendencias, onArquivos, onConfirmar, onRemover }: {
  f: FotoModelo
  arquivos: ArquivoTela[]
  enviando: boolean
  confirmar: string | null
  pendencias: string[]
  onArquivos: (l: FileList | null) => void
  onConfirmar: (id: string | null) => void
  onRemover: (a: ArquivoTela) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const falta = f.obrigatorio && !arquivos.length
  return (
    <div id={`lev-foto-${f.id}`} className={`rounded-lg border p-3 space-y-2 ${pendencias.length ? 'border-coral/70' : falta ? 'border-sol/70' : 'border-white/10'}`}>
      <div>
        <p className="font-bold text-white text-sm">{f.titulo}{f.obrigatorio && <span className="text-coral ml-0.5">*</span>}</p>
        <p className="text-xs text-white/55">{f.instrucao}</p>
        {pendencias.map((p, i) => <p key={i} className="text-xs text-coral mt-1">⚠ {p}</p>)}
      </div>
      {arquivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {arquivos.map((a) => (
            <div key={a.id} className="w-24 space-y-1">
              <a href={a.url} target="_blank" rel="noreferrer" className="block">
                {a.mime === 'application/pdf'
                  ? <span className="w-24 h-[72px] rounded border border-white/15 bg-white/5 flex items-center justify-center text-xs text-white/70">PDF</span>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={a.url} alt={f.titulo} loading="lazy" className="w-24 h-[72px] object-cover rounded border border-white/15" />}
              </a>
              {confirmar === a.id
                ? <button type="button" onClick={() => onRemover(a)} className="w-full px-1 py-1 bg-coral text-white text-[11px] font-bold rounded">Confirmar</button>
                : <button type="button" onClick={() => onConfirmar(a.id)} className="w-full px-1 py-1 border border-white/15 text-white/60 text-[11px] rounded">Remover</button>}
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => ref.current?.click()} disabled={enviando}
        className="px-3 py-2 border border-dashed border-sol/60 text-white/85 text-sm font-semibold rounded-lg disabled:opacity-50">
        {enviando ? 'Enviando…' : 'Adicionar foto ou arquivo'}
      </button>
      <input ref={ref} type="file" accept={f.aceita.join(',')} multiple hidden
        onChange={(e) => { onArquivos(e.target.files); e.target.value = '' }} />
    </div>
  )
}
