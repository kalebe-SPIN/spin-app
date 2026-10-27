'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { devolverComPendenciaAction, mudarStatusLevantamentoAction } from '@/app/levantamentos/actions'
import { gerarArquivosDoLevantamentoAction } from '@/app/projetos/[id]/diagrama/actions'
import { valorExibido } from '@/lib/levantamentos/comum'
import { calcularProgresso } from '@/lib/levantamentos/progresso'
import { numeroLevantamento } from '@/lib/levantamentos/types'
import type { ArquivoTela, DiagramaTela, LevantamentoTela } from '@/lib/levantamentos/tela'
import { AtualizaAoMudar, BarraProgresso, EtiquetaStatus, Historico, cardCls, dataHoraBR, inputCls, type EventoTela } from './ui'

const PRANCHA: Record<string, string> = { prancha_pdf: 'PDF', prancha_dxf: 'DXF', prancha_svg: 'SVG', preview: 'Prévia' }

const FOLHA: Record<string, string> = {
  unifilar_ongrid: 'Unifilar on-grid', unifilar_hibrido: 'Unifilar híbrido',
  padrao_entrada: 'Padrão de entrada', layout_instalacao: 'Layout de instalação',
}

/** Levantamento em modo leitura + ações da equipe de projeto (admin). */
export function DetalheLevantamento({ lev, arquivos, eventos, ehEquipe, diagramas }: {
  lev: LevantamentoTela
  arquivos: ArquivoTela[]
  eventos: EventoTela[]
  ehEquipe: boolean
  diagramas: DiagramaTela[]
}) {
  const router = useRouter()
  const modelo = lev.modelo
  const fotos = arquivos.filter((a) => a.tipo === 'foto' || a.tipo === 'documento')
  const prog = calcularProgresso(modelo, lev.respostas, fotos)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [devolvendo, setDevolvendo] = useState(false)

  // pranchas por versão (a mais nova primeiro)
  const versoes = useMemo(() => {
    const m = new Map<number, ArquivoTela[]>()
    for (const a of arquivos) if (a.tipo !== 'foto' && a.tipo !== 'documento') {
      const v = a.versao_prancha || 1
      m.set(v, [...(m.get(v) || []), a])
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0])
  }, [arquivos])

  async function passo(p: 'desfazer_envio' | 'assumir' | 'aprovar' | 'refazer' | 'cancelar') {
    setOcupado(true); setErro(null); setConfirmar(null)
    const r = await mudarStatusLevantamentoAction(lev.id, p)
    setOcupado(false)
    if ('erro' in r) { setErro(r.erro); return }
    router.refresh()
  }

  async function gerarArquivos() {
    setOcupado(true); setErro(null); setConfirmar(null)
    const r = await gerarArquivosDoLevantamentoAction(lev.id)
    setOcupado(false)
    if (!r.sucesso) { setErro(r.erro); return }
    router.refresh()
  }
  const gerando = diagramas.some((d) => d.status === 'gerando')
  const podeGerar = ehEquipe && !!lev.projeto_id && !gerando && ['enviado', 'em_projeto', 'aguardando_aprovacao'].includes(lev.status)

  const pendProjetista = lev.pendencias.filter((p) => p.origem === 'projetista')
  const pendApp = lev.pendencias.filter((p) => p.origem === 'app')

  const situacao: Record<string, string> = {
    enviado: `Enviado ao projeto em ${dataHoraBR(lev.enviado_em)}. O admin segue com a geração dos diagramas e arquivos.`,
    em_projeto: gerando ? 'Em projeto: o robô está gerando os arquivos (alguns minutos).' : 'Em projeto: os arquivos estão sendo preparados.',
    aguardando_aprovacao: `Arquivos gerados${lev.processado_em ? ` em ${dataHoraBR(lev.processado_em)}` : ''}. Aguardando a aprovação do responsável técnico.`,
    aprovado: `Aprovado em ${dataHoraBR(lev.aprovado_em)} — liberado para a CELESC.`,
    com_pendencia: 'Devolvido ao consultor com pendências para corrigir.',
    cancelado: 'Levantamento cancelado.',
    rascunho: 'Rascunho: ainda está sendo preenchido.',
  }

  return (
    <div className="space-y-4 pb-10">
      <AtualizaAoMudar id={lev.id} />
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-white/45">
          {numeroLevantamento(lev.numero)}{lev.consultor_nome ? ` · ${lev.consultor_nome}` : ''}
        </p>
        <h1 className="text-2xl font-black text-white">{String(lev.respostas.cliente || '') || 'Sem nome'}</h1>
        <p className="text-sm text-white/60">{modelo.nome}</p>
      </header>

      <div className={`${cardCls} space-y-2`}>
        <div className="flex items-center justify-between gap-3">
          <EtiquetaStatus status={lev.status} />
          <span className="text-sm text-white/80 tabular-nums">{prog.ok}/{prog.total} · {prog.pct}%</span>
        </div>
        <BarraProgresso pct={prog.pct} />
        <p className="text-sm text-white/75">{situacao[lev.status]}</p>
        {lev.observacao_projetista && <p className="text-sm text-white/70">Projetista: {lev.observacao_projetista}</p>}
        {pendProjetista.length > 0 && (
          <ul className="text-sm text-white/80 space-y-0.5">
            {pendProjetista.map((p, i) => <li key={i}>⚠ {p.mensagem}</li>)}
          </ul>
        )}
        {lev.status === 'enviado' && (
          <button type="button" disabled={ocupado} onClick={() => passo('desfazer_envio')} className="px-3 py-2 border border-white/15 text-white/80 text-sm rounded-lg">
            Desfazer envio (voltar a editar)
          </button>
        )}
      </div>

      {ehEquipe && lev.status !== 'cancelado' && (
        <section className="rounded-xl border border-sol/40 bg-white/[0.03] p-4 space-y-3">
          <h2 className="text-sm font-bold text-white">Equipe de projeto</h2>
          <div className="flex flex-wrap gap-2">
            {podeGerar && (
              <button type="button" disabled={ocupado} onClick={gerarArquivos} className="px-4 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-50">
                {ocupado ? 'Disparando…' : diagramas.length ? 'Gerar os arquivos de novo' : 'Gerar os arquivos'}
              </button>
            )}
            {lev.status === 'enviado' && (
              <button type="button" disabled={ocupado} onClick={() => passo('assumir')} className="px-4 py-2.5 border border-white/15 text-white/80 text-sm rounded-lg">Assumir</button>
            )}
            {lev.status === 'aguardando_aprovacao' && (
              confirmar === 'aprovar'
                ? <button type="button" disabled={ocupado} onClick={() => passo('aprovar')} className="px-4 py-2.5 bg-verde text-white font-bold text-sm rounded-lg">Confirmar aprovação</button>
                : <button type="button" disabled={ocupado} onClick={() => setConfirmar('aprovar')} className="px-4 py-2.5 bg-verde text-white font-bold text-sm rounded-lg">Aprovar</button>
            )}
            {['enviado', 'em_projeto', 'aguardando_aprovacao'].includes(lev.status) && !devolvendo && (
              <button type="button" disabled={ocupado} onClick={() => setDevolvendo(true)} className="px-4 py-2.5 border border-sol/60 text-white text-sm font-semibold rounded-lg">Devolver com pendência</button>
            )}
            {lev.status === 'aguardando_aprovacao' && (
              <button type="button" disabled={ocupado} onClick={() => passo('refazer')} className="px-4 py-2.5 border border-white/15 text-white/80 text-sm rounded-lg">Refazer pranchas</button>
            )}
            {confirmar === 'cancelar'
              ? <button type="button" disabled={ocupado} onClick={() => passo('cancelar')} className="px-4 py-2.5 bg-coral text-white font-bold text-sm rounded-lg">Confirmar cancelamento</button>
              : <button type="button" disabled={ocupado} onClick={() => setConfirmar('cancelar')} className="px-4 py-2.5 border border-coral/50 text-white/70 text-sm rounded-lg">Cancelar levantamento</button>}
          </div>
          {lev.status === 'aguardando_aprovacao' && !versoes.length && confirmar === 'aprovar' && (
            <p className="text-xs text-white/70">⚠ Nenhuma prancha anexada a este levantamento.</p>
          )}
          {lev.projeto_id ? (
            <p className="text-xs text-white/60">
              {lev.modelo.codigo === 'fv' ? 'Gera o unifilar' : 'Gera o padrão de entrada'} pelo robô, com as respostas e as fotos deste levantamento no relatório; quando termina, o levantamento vem para aprovação.{' '}
              <Link href={`/projetos/${lev.projeto_id}/diagrama`} className="underline decoration-sol/60 underline-offset-2 text-white/85">Abrir gerador do projeto →</Link>
            </p>
          ) : (
            <p className="text-xs text-white/60">Sem projeto ligado: o robô de diagramas precisa do projeto. Fica na fila para o projetista.</p>
          )}
          {diagramas.length > 0 && (
            <ul className="space-y-2">
              {diagramas.map((d) => (
                <li key={d.id} className="rounded-lg border border-white/10 p-2.5 space-y-1">
                  <p className="text-sm text-white">
                    {FOLHA[d.tipo_desenho] || d.tipo_desenho} v{d.versao}{' '}
                    <span className="text-white/50 text-xs">· {d.status === 'gerando' ? 'gerando…' : d.status === 'pronto' ? 'pronto' : 'não concluiu'} · {dataHoraBR(d.created_at)}</span>
                  </p>
                  {d.status === 'pronto' && (
                    <div className="flex flex-wrap gap-2">
                      {d.url_pdf && <a href={d.url_pdf} target="_blank" rel="noreferrer" className="px-2.5 py-1 border border-white/15 rounded text-xs text-white/85">PDF</a>}
                      {d.url_dxf && <a href={d.url_dxf} target="_blank" rel="noreferrer" className="px-2.5 py-1 border border-white/15 rounded text-xs text-white/85">DXF</a>}
                      {d.url_svg && <a href={d.url_svg} target="_blank" rel="noreferrer" className="px-2.5 py-1 border border-white/15 rounded text-xs text-white/85">SVG</a>}
                    </div>
                  )}
                  {d.avisos.length > 0 && <p className="text-xs text-white/60">A confirmar: {d.avisos.join(' · ')}</p>}
                  {d.erro && <p className="text-xs text-coral">{d.erro}</p>}
                </li>
              ))}
            </ul>
          )}
          {devolvendo && (
            <FormDevolver lev={lev} onCancelar={() => setDevolvendo(false)} onDevolvido={() => { setDevolvendo(false); router.refresh() }} />
          )}
        </section>
      )}

      {erro && <p className="text-sm text-coral">⚠ {erro}</p>}

      {versoes.length > 0 && (
        <section className={`${cardCls} space-y-3`}>
          <h2 className="text-sm font-bold text-white">Pranchas</h2>
          {versoes.map(([v, lista], i) => {
            const pdf = lista.find((a) => a.tipo === 'prancha_pdf')
            return (
              <div key={v} className="space-y-2">
                <p className="text-xs text-white/60">Versão {v}{i === 0 ? ' (mais recente)' : ''} · {dataHoraBR(lista[0].created_at)}</p>
                <div className="flex flex-wrap gap-2">
                  {lista.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer" download={a.tipo !== 'prancha_pdf' ? a.nome || undefined : undefined}
                      className="px-3 py-1.5 border border-white/15 rounded-lg text-sm text-white/85 hover:border-sol/50">
                      {PRANCHA[a.tipo] || a.tipo}{a.nome ? ` · ${a.nome}` : ''}
                    </a>
                  ))}
                </div>
                {i === 0 && pdf?.url && (
                  <iframe src={pdf.url} title={`Prancha versão ${v}`} className="tema-fixo w-full h-[70vh] rounded-lg border border-white/10 bg-white" />
                )}
              </div>
            )
          })}
        </section>
      )}

      {modelo.secoes.map((s) => (
        <section key={s.id} className={`${cardCls} space-y-2`}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{s.titulo}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {s.campos.map((c) => {
              const v = valorExibido(c, lev.respostas[c.id])
              if (!v && !c.obrigatorio) return null
              return (
                <div key={c.id} className={`min-w-0 ${c.largura === 'inteira' || c.tipo === 'textarea' || c.tipo === 'cargas' ? 'sm:col-span-2' : ''}`}>
                  <dt className="text-[11px] uppercase tracking-wider text-white/50">{c.rotulo}</dt>
                  <dd className={`text-sm break-words whitespace-pre-wrap ${v ? 'text-white' : 'text-white/60'}`}>{v || '⚠ A PREENCHER'}</dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}

      <section className={`${cardCls} space-y-3`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Fotos e documentos</h2>
        {modelo.fotos.map((f) => {
          const doSlot = fotos.filter((a) => a.slot === f.id)
          if (!doSlot.length && !f.obrigatorio) return null
          return (
            <div key={f.id} className="space-y-1.5">
              <p className="text-sm text-white">{f.titulo}{!doSlot.length && <span className="text-white/60"> — ⚠ sem foto</span>}</p>
              {doSlot.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {doSlot.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                      {a.mime === 'application/pdf'
                        ? <span className="w-24 h-[72px] rounded border border-white/15 bg-white/5 flex items-center justify-center text-xs text-white/70">PDF</span>
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={a.url} alt={f.titulo} loading="lazy" className="w-24 h-[72px] object-cover rounded border border-white/15" />}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>

      {pendApp.length > 0 && lev.status !== 'rascunho' && (
        <p className="text-xs text-white/55 rounded-lg border border-white/10 px-3 py-2">
          Enviado com {pendApp.length} {pendApp.length > 1 ? 'itens' : 'item'} sem preencher: {pendApp.map((p) => p.mensagem).join(' · ')}
        </p>
      )}

      <Historico eventos={eventos} />
    </div>
  )
}

/** Pendências por item (campo ou foto do modelo) + observação geral. */
function FormDevolver({ lev, onCancelar, onDevolvido }: {
  lev: LevantamentoTela
  onCancelar: () => void
  onDevolvido: () => void
}) {
  const opcoes = useMemo(() => [
    { id: 'geral', rotulo: 'Geral' },
    ...lev.modelo.secoes.flatMap((s) => s.campos.map((c) => ({ id: c.id, rotulo: `${s.titulo} · ${c.rotulo}` }))),
    ...lev.modelo.fotos.map((f) => ({ id: `foto:${f.id}`, rotulo: `Foto · ${f.titulo}` })),
  ], [lev.modelo])
  const rotuloDe = (id: string) => opcoes.find((o) => o.id === id)?.rotulo.split(' · ').pop() || ''
  const [itens, setItens] = useState<{ campo: string; mensagem: string }[]>(() => {
    const doApp = lev.pendencias.filter((p) => p.origem === 'app').map((p) => ({ campo: p.campo, mensagem: `Preencher: ${p.mensagem.replace(/^Foto: /, '')}` }))
    return doApp.length ? doApp : [{ campo: 'geral', mensagem: '' }]
  })
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function devolver() {
    setSalvando(true); setErro(null)
    const r = await devolverComPendenciaAction(lev.id, itens, obs)
    setSalvando(false)
    if ('erro' in r) { setErro(r.erro); return }
    onDevolvido()
  }

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs text-white/60">Uma linha por item que o consultor precisa corrigir; o campo citado fica destacado para ele.</p>
      {itens.map((it, i) => (
        <div key={i} className="grid gap-1.5 rounded-lg border border-white/10 p-2.5">
          <select value={it.campo} onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, campo: e.target.value } : x)))}
            className={`${inputCls} border-white/10`}>
            {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>
          <input value={it.mensagem} placeholder={`O que corrigir${it.campo !== 'geral' ? ` em “${rotuloDe(it.campo)}”` : ''}`}
            onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, mensagem: e.target.value } : x)))}
            className={`${inputCls} border-white/10`} />
          {itens.length > 1 && (
            <button type="button" onClick={() => setItens((l) => l.filter((_, j) => j !== i))} className="justify-self-start text-xs text-white/50">Tirar esta linha</button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setItens((l) => [...l, { campo: 'geral', mensagem: '' }])} className="px-3 py-1.5 border border-white/15 text-white/80 text-sm rounded-lg">+ Outra pendência</button>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação geral (opcional)" className={`${inputCls} border-white/10`} />
      {erro && <p className="text-sm text-coral">⚠ {erro}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={devolver} disabled={salvando} className="px-4 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-50">
          {salvando ? 'Devolvendo…' : 'Devolver ao consultor'}
        </button>
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm text-white/60">Cancelar</button>
      </div>
    </div>
  )
}
