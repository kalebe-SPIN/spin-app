'use client'

import { UsinasDoContato } from '@/components/usina/UsinasDoContato'
import { useEffect, useRef, useState } from 'react'
import {
  carregarPerfilAction, salvarSecaoPerfilAction, vincularMidiaPerfilAction,
  enviarArquivoPerfilAction, removerArquivoPerfilAction, resolverPendenciaAction,
} from '@/app/inbox/perfil-actions'
import {
  SECOES, TIPOS_TELHADO, MATERIAIS_ESTRUTURA, QTD_AGUAS, TIPOS_REDE, DISJUNTORES_COMUNS,
  CATEGORIAS_IMAGEM, CATEGORIAS_ARQUIVO, PERFIL_VAZIO, progressoSecao,
  type ArquivoPerfil, type PerfilLead, type Secao, type SecaoDados,
} from '@/lib/spinzap/perfil'
import { fmtKwp, formatarMoedaBRL } from '@/lib/formatters'
import { INFO_CATEGORIA, type CategoriaProposta } from '@/lib/propostas/categorias'

/**
 * Kalebe 2026-10-10: linha do perfil do lead no Spinzap — cada sessão de
 * dados com acesso rápido e formulário próprio (Contato, Infra civil, Infra
 * elétrica, Peculiaridades, Imagens, Arquivos) + pendências.
 */

type Dados = Awaited<ReturnType<typeof carregarPerfilAction>>
type Carregado = Exclude<Dados, { erro: string }>

const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'
const aZ = <T extends { rotulo: string }>(l: T[]) => [...l].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

/**
 * Kalebe 2026-10-13: as sessões saíram da linha do cabeçalho e abrem pelo
 * menu flutuante da conversa — aqui ficam os dados (com o progresso de cada
 * sessão) e a janela de cada uma.
 */
export function usePerfilLead(conversaId: string | null) {
  const [dados, setDados] = useState<Carregado | null>(null)
  async function recarregar() {
    if (!conversaId) { setDados(null); return }
    const r = await carregarPerfilAction(conversaId)
    setDados('erro' in r ? null : r)
  }
  useEffect(() => { setDados(null); recarregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conversaId])
  const perfil = dados?.perfil || PERFIL_VAZIO
  const arquivos = dados?.arquivos || []
  const progresso = Object.fromEntries(SECOES.map((s) => [s.chave, progressoSecao(s.chave, perfil, arquivos)])) as Record<Secao, { feitos: number; total: number }>
  const pendentes = perfil.pendencias.filter((p) => !p.resolvida_em).length
  return { dados, recarregar, progresso, pendentes }
}

export type SecaoPerfilAberta = Secao | 'pendencias'

/** Kalebe 2026-10-16: a partir da proposta enviada — editar (reabre o formulário) ou fechar a venda */
type AcoesProposta = { onEditarProposta?: (categoria: string) => void; onFecharVenda?: (projetoId: string) => void }

export function ModalPerfil({ secao, conversaId, dados, onFechar, onSalvo, onEditarProposta, onFecharVenda }: {
  secao: SecaoPerfilAberta
  conversaId: string
  dados: Carregado
  onFechar: () => void
  onSalvo: () => Promise<void>
} & AcoesProposta) {
  return <ModalSecao secao={secao} conversaId={conversaId} dados={dados} onFechar={onFechar} onSalvo={onSalvo} onEditarProposta={onEditarProposta} onFecharVenda={onFecharVenda} />
}

function ModalSecao({ secao, conversaId, dados, onFechar, onSalvo, onEditarProposta, onFecharVenda }: {
  secao: Secao | 'pendencias'
  conversaId: string
  dados: Carregado
  onFechar: () => void
  onSalvo: () => Promise<void>
} & AcoesProposta) {
  const info = SECOES.find((s) => s.chave === secao)
  const titulo = secao === 'pendencias' ? '⚠ Pendências' : `${info?.emoji} ${info?.rotulo}`
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-noite/85 backdrop-blur-2xl border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{titulo}</h2>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-sm">✕</button>
        </div>
        {secao === 'pendencias' && <Pendencias conversaId={conversaId} perfil={dados.perfil} onSalvo={onSalvo} />}
        {(secao === 'contato' || secao === 'infra_civil' || secao === 'infra_eletrica' || secao === 'peculiaridades') && (
          <FormDados secao={secao} conversaId={conversaId} perfil={dados.perfil} onSalvo={async () => { await onSalvo(); onFechar() }} />
        )}
        {(secao === 'imagens' || secao === 'arquivos') && (
          <Arquivos secao={secao} conversaId={conversaId} dados={dados} onSalvo={onSalvo} onEditarProposta={onEditarProposta} onFecharVenda={onFecharVenda} />
        )}
      </div>
    </div>
  )
}

function SimNao({ valor, onChange }: { valor: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-1.5">
      {[true, false].map((v) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={`px-4 py-1.5 rounded-lg border text-sm font-semibold ${valor === v ? 'border-sol/60 text-white bg-white/[0.06]' : 'border-white/15 text-white/60 hover:text-white'}`}>
          {v ? 'Sim' : 'Não'}
        </button>
      ))}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-white/60 mb-1">{rotulo}</span>
      {children}
    </label>
  )
}

function FormDados({ secao, conversaId, perfil, onSalvo }: {
  secao: SecaoDados
  conversaId: string
  perfil: PerfilLead
  onSalvo: () => Promise<void>
}) {
  const [v, setV] = useState<any>(structuredClone(perfil[secao] || {}))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const set = (k: string, x: any) => setV((o: any) => ({ ...o, [k]: x }))
  const setEnd = (k: string, x: any) => setV((o: any) => ({ ...o, endereco: { ...(o.endereco || {}), [k]: x } }))

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await salvarSecaoPerfilAction(conversaId, secao, v)
      if ('erro' in r) setErro(r.erro)
      else await onSalvo()
    } finally { setSalvando(false) }
  }

  const e = v.endereco || {}
  return (
    <div className="space-y-3">
      {secao === 'contato' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Campo rotulo="Primeiro nome"><input className={inputCls} value={v.primeiro_nome || ''} onChange={(x) => set('primeiro_nome', x.target.value)} /></Campo>
            <Campo rotulo="E-mail"><input className={inputCls} type="email" value={v.email || ''} onChange={(x) => set('email', x.target.value)} /></Campo>
          </div>
          <p className="text-[11px] font-bold text-white/60 pt-1">Endereço da instalação</p>
          <div className="grid grid-cols-[110px_1fr_90px] gap-2">
            <Campo rotulo="CEP"><input className={inputCls} value={e.cep || ''} onChange={(x) => setEnd('cep', x.target.value)} inputMode="numeric" /></Campo>
            <Campo rotulo="Rua"><input className={inputCls} value={e.rua || ''} onChange={(x) => setEnd('rua', x.target.value)} /></Campo>
            <Campo rotulo="Número"><input className={inputCls} value={e.numero || ''} onChange={(x) => setEnd('numero', x.target.value)} /></Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Campo rotulo="Complemento"><input className={inputCls} value={e.complemento || ''} onChange={(x) => setEnd('complemento', x.target.value)} /></Campo>
            <Campo rotulo="Bairro"><input className={inputCls} value={e.bairro || ''} onChange={(x) => setEnd('bairro', x.target.value)} /></Campo>
          </div>
          <div className="grid grid-cols-[1fr_70px] gap-2">
            <Campo rotulo="Cidade"><input className={inputCls} value={e.cidade || ''} onChange={(x) => setEnd('cidade', x.target.value)} /></Campo>
            <Campo rotulo="UF"><input className={`${inputCls} uppercase`} value={e.uf || ''} onChange={(x) => setEnd('uf', x.target.value.toUpperCase().slice(0, 2))} /></Campo>
          </div>
        </>
      )}

      {secao === 'infra_civil' && (
        <>
          <Campo rotulo="Imóvel com laje?"><SimNao valor={v.laje} onChange={(x) => set('laje', x)} /></Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Campo rotulo="Tipo de telhado">
              <select className={inputCls} value={v.tipo_telhado || ''} onChange={(x) => set('tipo_telhado', x.target.value || null)}>
                <option value="" className="bg-noite">—</option>
                {aZ(TIPOS_TELHADO).map((o) => <option key={o.valor} value={o.valor} className="bg-noite">{o.rotulo}</option>)}
              </select>
            </Campo>
            {/* Quantidade em ordem crescente (a ordem carrega sentido) */}
            <Campo rotulo="Quantas águas tem o telhado">
              <select className={inputCls} value={v.aguas ?? ''} onChange={(x) => set('aguas', x.target.value ? Number(x.target.value) : null)}>
                <option value="" className="bg-noite">—</option>
                {QTD_AGUAS.map((o) => <option key={o.valor} value={o.valor} className="bg-noite">{o.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Material da estrutura do telhado">
              <select className={inputCls} value={v.material_estrutura || ''} onChange={(x) => set('material_estrutura', x.target.value || null)}>
                <option value="" className="bg-noite">—</option>
                {aZ(MATERIAIS_ESTRUTURA).map((o) => <option key={o.valor} value={o.valor} className="bg-noite">{o.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Área total do imóvel (m²)">
              <input className={inputCls} inputMode="decimal" value={v.area_m2 ?? ''} onChange={(x) => set('area_m2', x.target.value)} />
            </Campo>
          </div>
        </>
      )}

      {secao === 'infra_eletrica' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Mono → bi → tri: a ordem carrega sentido */}
          <Campo rotulo="Tipo de rede">
            <select className={inputCls} value={v.tipo_rede || ''} onChange={(x) => set('tipo_rede', x.target.value || null)}>
              <option value="" className="bg-noite">—</option>
              {TIPOS_REDE.map((o) => <option key={o.valor} value={o.valor} className="bg-noite">{o.rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Disjuntor geral do padrão (A)">
            <input className={inputCls} inputMode="numeric" list="disjuntores-comuns" value={v.disjuntor_a ?? ''} onChange={(x) => set('disjuntor_a', x.target.value)} />
            <datalist id="disjuntores-comuns">{DISJUNTORES_COMUNS.map((d) => <option key={d} value={d} />)}</datalist>
          </Campo>
        </div>
      )}

      {secao === 'peculiaridades' && (
        <>
          <Campo rotulo="O projeto será no nome do titular da fatura?"><SimNao valor={v.titular_fatura} onChange={(x) => set('titular_fatura', x)} /></Campo>
          {v.titular_fatura === false && (
            <Campo rotulo="Em nome de quem?"><input className={inputCls} value={v.titular_nome || ''} onChange={(x) => set('titular_nome', x.target.value)} /></Campo>
          )}
          <Campo rotulo="Tem sombreamento que incide no telhado?"><SimNao valor={v.sombreamento} onChange={(x) => set('sombreamento', x)} /></Campo>
          {v.sombreamento && (
            <Campo rotulo="De onde vem e em que horário">
              <textarea className={`${inputCls} resize-none`} rows={2} value={v.sombreamento_descricao || ''} onChange={(x) => set('sombreamento_descricao', x.target.value)}
                placeholder="Ex.: árvore do vizinho, à tarde" />
            </Campo>
          )}
        </>
      )}

      {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
      <div className="flex justify-end">
        <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-verde text-white font-bold text-sm rounded-lg disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

function Arquivos({ secao, conversaId, dados, onSalvo, onEditarProposta, onFecharVenda }: {
  secao: 'imagens' | 'arquivos'
  conversaId: string
  dados: Carregado
  onSalvo: () => Promise<void>
} & AcoesProposta) {
  const categorias = secao === 'imagens' ? CATEGORIAS_IMAGEM : CATEGORIAS_ARQUIVO
  const [escolhendo, setEscolhendo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [categoriaUpload, setCategoriaUpload] = useState<string>('')

  const ehImagem = (mime: string | null) => !!mime && mime.startsWith('image/')
  const midiasDaConversa = dados.midias.filter((m) => (secao === 'imagens' ? ehImagem(m.mime) || m.tipo === 'image' : !ehImagem(m.mime) && m.tipo !== 'image'))

  async function agir(fn: () => Promise<{ sucesso: true } | { erro: string }>) {
    setOcupado(true); setErro(null)
    try {
      const r = await fn()
      if ('erro' in r) setErro(r.erro)
      else { setEscolhendo(null); await onSalvo() }
    } finally { setOcupado(false) }
  }

  async function enviar(f: File | undefined) {
    if (!f || !categoriaUpload) return
    const fd = new FormData()
    fd.set('conversa_id', conversaId); fd.set('categoria', categoriaUpload); fd.set('arquivo', f)
    await agir(() => enviarArquivoPerfilAction(fd))
    if (upload.current) upload.current.value = ''
  }

  return (
    <div className="space-y-3">
      <input ref={upload} type="file" className="hidden" accept={secao === 'imagens' ? 'image/*' : undefined} onChange={(e) => enviar(e.target.files?.[0])} />
      {categorias.map((c) => {
        const itens: ArquivoPerfil[] = dados.arquivos.filter((a) => a.categoria === c.valor)
        return (
          <div key={c.valor} className="rounded-lg border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">{c.rotulo}</p>
              <div className="flex gap-1.5">
                <button onClick={() => setEscolhendo(escolhendo === c.valor ? null : c.valor)} disabled={ocupado}
                  className="px-2.5 py-1 rounded border border-white/15 text-[11px] text-white/75 hover:text-white">Da conversa</button>
                <button onClick={() => { setCategoriaUpload(c.valor); setTimeout(() => upload.current?.click(), 0) }} disabled={ocupado}
                  className="px-2.5 py-1 rounded border border-white/15 text-[11px] text-white/75 hover:text-white">Enviar</button>
              </div>
            </div>
            {itens.length === 0 ? <p className="text-[11px] text-white/40">Nada ainda.</p> : (
              <div className="flex flex-wrap gap-2">
                {itens.map((a) => (
                  <div key={a.id} className="relative group">
                    <a href={a.url} target="_blank" rel="noreferrer" title={a.nome || ''}
                      className="block rounded border border-white/15 overflow-hidden hover:border-white/40">
                      {ehImagem(a.mime)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={a.url} alt={a.nome || c.rotulo} className="w-20 h-20 object-cover" />
                        : <span className="block px-2.5 py-2 text-[11px] text-white/80 max-w-[200px] truncate">📄 {a.nome || 'arquivo'}</span>}
                    </a>
                    <button onClick={() => agir(() => removerArquivoPerfilAction(conversaId, a.id))} title="Tirar do perfil"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-noite border border-white/20 text-[10px] text-white/70 hidden group-hover:flex items-center justify-center">✕</button>
                  </div>
                ))}
              </div>
            )}
            {escolhendo === c.valor && (
              midiasDaConversa.length === 0 ? <p className="text-[11px] text-white/40">Nenhum{secao === 'imagens' ? 'a foto' : ' arquivo'} na conversa.</p> : (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
                  {midiasDaConversa.slice(0, 30).map((m) => (
                    <button key={m.id} onClick={() => agir(() => vincularMidiaPerfilAction(conversaId, m.id, c.valor))} disabled={ocupado}
                      title={`${m.direcao === 'inbound' ? 'Cliente' : 'Equipe'} · ${new Date(m.criada_em).toLocaleDateString('pt-BR')}`}
                      className="rounded border border-white/15 overflow-hidden hover:border-sol/60">
                      {ehImagem(m.mime) || m.tipo === 'image'
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={m.url} alt="" className="w-16 h-16 object-cover" />
                        : <span className="block px-2 py-1.5 text-[11px] text-white/75 max-w-[180px] truncate">📄 {m.texto || 'arquivo'}</span>}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )
      })}

      {secao === 'arquivos' && (
        <>
          {/* Kalebe 2026-10-22: usina do cliente (potências, equipamentos, login e senha do monitoramento) */}
          <UsinasDoContato conversaId={conversaId} />
          <div className="rounded-lg border border-white/10 p-3 space-y-1.5">
            <p className="text-sm font-semibold text-white">Orçamentos gerados</p>
            {dados.propostas.length === 0 ? <p className="text-[11px] text-white/40">Nenhuma proposta gerada ainda.</p> : dados.propostas.map((p) => {
              const cat = p.categoria ? INFO_CATEGORIA[p.categoria as CategoriaProposta] : null
              return (
                <div key={p.id} className={`space-y-1 ${p.ultima_do_projeto ? 'rounded-lg border border-white/10 p-2' : 'pl-2'}`}>
                  <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 text-[12px] text-white/80 hover:text-white">
                    <span className="truncate">
                      📄 {new Date(p.criada_em).toLocaleDateString('pt-BR')}
                      {cat ? ` · ${cat.emoji} ${cat.rotulo}` : ''}{p.potencia_cc_kwp ? ` · ${fmtKwp(p.potencia_cc_kwp)}` : ''}
                      {p.final && <span data-etiqueta className="ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded border border-verde/60 text-white/80">final</span>}
                    </span>
                    {p.pv_total != null && <span className="font-mono text-white/60 shrink-0">{formatarMoedaBRL(p.pv_total)}</span>}
                  </a>
                  {/* Só na versão mais recente de cada projeto */}
                  {p.ultima_do_projeto && (p.vendido ? (
                    <p className="text-[11px] text-white/70">✅ Venda fechada{p.projeto_codigo ? ` · ${p.projeto_codigo}` : ''}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {onEditarProposta && p.categoria && (
                        <button type="button" onClick={() => onEditarProposta(p.categoria!)}
                          className="px-2.5 py-1 rounded-lg bg-weg-azul text-white text-[11px] font-bold">✏ Editar proposta</button>
                      )}
                      {onFecharVenda && (
                        <button type="button" onClick={() => onFecharVenda(p.projeto_id)}
                          className="px-2.5 py-1 rounded-lg bg-verde text-white text-[11px] font-bold">🤝 Fechar venda</button>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="rounded-lg border border-white/10 p-3 space-y-1.5">
            <p className="text-sm font-semibold text-white">Tudo que passou pela conversa</p>
            {dados.midias.length === 0 ? <p className="text-[11px] text-white/40">Nenhum arquivo ainda.</p> : dados.midias.slice(0, 40).map((m) => (
              <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 text-[12px] text-white/75 hover:text-white">
                <span className="truncate">{ehImagem(m.mime) || m.tipo === 'image' ? '🖼️' : m.tipo === 'audio' ? '🎙️' : m.tipo === 'video' ? '🎬' : '📄'} {m.texto || m.tipo}</span>
                <span className="shrink-0 text-white/40 text-[11px]">{m.direcao === 'inbound' ? 'cliente' : 'equipe'} · {new Date(m.criada_em).toLocaleDateString('pt-BR')}</span>
              </a>
            ))}
          </div>
        </>
      )}
      {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
    </div>
  )
}

function Pendencias({ conversaId, perfil, onSalvo }: { conversaId: string; perfil: PerfilLead; onSalvo: () => Promise<void> }) {
  const [erro, setErro] = useState<string | null>(null)
  const abertas = perfil.pendencias.filter((p) => !p.resolvida_em)
  return (
    <div className="space-y-2">
      {abertas.length === 0 && <p className="text-sm text-white/60">Nenhuma pendência aberta.</p>}
      {abertas.map((p) => (
        <div key={p.id} className="rounded-lg border border-coral/40 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-white">{p.texto}</p>
            <p className="text-[11px] text-white/45">{p.origem ? `${p.origem} · ` : ''}{new Date(p.criada_em).toLocaleString('pt-BR')}</p>
          </div>
          <button
            onClick={async () => { const r = await resolverPendenciaAction(conversaId, p.id); if ('erro' in r) setErro(r.erro); else await onSalvo() }}
            className="px-3 py-1.5 rounded bg-verde text-white text-xs font-bold shrink-0">
            Resolvida
          </button>
        </div>
      ))}
      {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
    </div>
  )
}
