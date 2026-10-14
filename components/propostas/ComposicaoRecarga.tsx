'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatarMoedaBRL, fmtNum } from '@/lib/formatters'
import {
  respostasPadrao, rotuloFases,
  type EntradaRecarga, type EquipamentoRecarga, type PropostaRecarga, type RespostasRecarga, type TipoEquipamentoRecarga,
} from '@/lib/estacao-ve/proposta-recarga'
import type { DadosRecarga, EquipamentoCatalogoRecarga } from '@/lib/estacao-ve/proposta-recarga-servidor'
import type { FasesRede } from '@/lib/estacao-ve/montar-lista-ca'
import type { SecaoProposta } from '@/lib/propostas/secoes'
import { CampoNumero, inputCls } from './CampoNumero'
import { SecoesProposta } from './SecoesProposta'

/**
 * Composição da proposta de estação de recarga (Kalebe 2026-10-14) — a mesma
 * no Spinzap (modal da conversa) e na tela do projeto. Ordem: equipamentos →
 * projeto → execução; as respostas (distância, eletroduto externo, alvenaria,
 * infraestrutura embutida, aterramento) recalculam na hora, no servidor.
 * Margem, comissão e imposto só aparecem pro admin (dupla visão).
 */

export type ApiRecarga = {
  carregar: () => Promise<DadosRecarga | { erro: string }>
  calcular: (e: EntradaRecarga) => Promise<{ proposta: PropostaRecarga; mostra_interno: boolean } | { erro: string }>
  cadastrar: (i: { tipo: TipoEquipamentoRecarga; modelo: string; fabricante?: string | null; potencia_kw?: number | null; preco: number }) =>
    Promise<{ equipamento: EquipamentoCatalogoRecarga } | { erro: string }>
  gerarPdf: (e: EntradaRecarga) => Promise<{ url_pdf: string; projeto_id: string; proposta: PropostaRecarga } | { erro: string }>
  enviar?: (projeto_id: string, url_pdf: string, legenda: string) => Promise<{ sucesso: true } | { erro: string }>
}

const reais = formatarMoedaBRL

function Opcao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`px-3 py-2 rounded-xl text-xs font-bold text-start border ${ativo ? 'bg-weg-azul border-weg-azul text-white' : 'border-white/15 text-white/70 hover:text-white'}`}>
      {ativo ? '✓ ' : ''}{children}
    </button>
  )
}

function Bloco({ n, titulo, valor, children }: { n: string; titulo: string; valor?: string | null; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-black text-white">{n}. {titulo}</h3>
        {valor && <span className="text-xs font-bold text-white/70 tabular-nums">{valor}</span>}
      </div>
      {children}
    </section>
  )
}

export function ComposicaoRecarga({ api, nomeCliente, onEnviada }: {
  api: ApiRecarga
  nomeCliente: string
  onEnviada?: () => void
}) {
  const [dados, setDados] = useState<DadosRecarga | null>(null)
  const [catalogo, setCatalogo] = useState<EquipamentoCatalogoRecarga[]>([])
  const [equipamentos, setEquipamentos] = useState<EquipamentoRecarga[]>([])
  const [respostas, setRespostas] = useState<RespostasRecarga | null>(null)
  const [margem, setMargem] = useState<number | null>(null)
  const [comissao, setComissao] = useState<number | null>(null)
  const [secoes, setSecoes] = useState<SecaoProposta[]>([])
  const [escolhido, setEscolhido] = useState('')
  const [qtdNova, setQtdNova] = useState(1)
  const [novo, setNovo] = useState<null | { tipo: TipoEquipamentoRecarga; modelo: string; fabricante: string; potencia: number; preco: number }>(null)
  const [calc, setCalc] = useState<{ proposta: PropostaRecarga; mostra_interno: boolean } | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [pdf, setPdf] = useState<{ url_pdf: string; projeto_id: string } | null>(null)
  const [legenda, setLegenda] = useState(`Oi${nomeCliente ? `, ${nomeCliente.split(' ')[0]}` : ''}! Segue a proposta da sua estação de recarga ⚡ Qualquer dúvida, é só me chamar por aqui.`)
  const [ocupado, setOcupado] = useState<null | 'cadastrando' | 'gerando' | 'enviando'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)

  useEffect(() => {
    api.carregar().then((r) => {
      if ('erro' in r) { setErro(r.erro); return }
      setDados(r); setCatalogo(r.equipamentos); setSecoes(r.secoes || [])
      if (r.url_pdf && r.projeto_id) setPdf({ url_pdf: r.url_pdf, projeto_id: r.projeto_id })
      if (r.salva) {
        setEquipamentos(r.salva.equipamentos || [])
        setRespostas({ ...respostasPadrao({ distancia_padrao_m: r.distancia_padrao_m }, r.km_deslocamento), ...r.salva.respostas })
        setMargem(r.salva.margem_pct ?? r.margem_padrao_pct); setComissao(r.salva.comissao_pct ?? r.comissao_padrao_pct)
      } else {
        setRespostas(respostasPadrao({ distancia_padrao_m: r.distancia_padrao_m }, r.km_deslocamento))
        setMargem(r.margem_padrao_pct); setComissao(r.comissao_padrao_pct)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entrada = useMemo<EntradaRecarga | null>(() => respostas && ({
    equipamentos, respostas, secoes,
    margem_pct: dados?.eh_admin ? margem : null,
    comissao_pct: dados?.eh_admin ? comissao : null,
  }), [equipamentos, respostas, secoes, margem, comissao, dados?.eh_admin])

  // Recalcula no servidor a cada mudança (com folga pra digitação)
  const pedido = useRef(0)
  const primeira = useRef(true)
  useEffect(() => {
    if (!entrada) return
    if (primeira.current) primeira.current = false
    else setPdf(null)
    if (!entrada.equipamentos.length) { setCalc(null); return }
    const n = ++pedido.current
    setCalculando(true)
    const t = setTimeout(async () => {
      const r = await api.calcular(entrada)
      if (n !== pedido.current) return
      setCalculando(false)
      if ('erro' in r) setErro(r.erro)
      else { setErro(null); setCalc(r) }
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada])

  const carregadores = catalogo.filter((c) => c.tipo === 'carregador')
  const opcionais = catalogo.filter((c) => c.tipo === 'opcional')
  const rotuloCat = (c: EquipamentoCatalogoRecarga) =>
    `${c.modelo}${c.potencia_kw ? ` · ${fmtNum(c.potencia_kw, c.potencia_kw % 1 ? 1 : 0)} kW` : ''}${c.preco ? ` · ${reais(c.preco)}` : ' · sob cotação'}`

  function adicionar(c: EquipamentoCatalogoRecarga, qtd: number) {
    setEquipamentos((xs) => {
      const ja = xs.find((x) => x.produto_id === c.id)
      if (ja) return xs.map((x) => (x.produto_id === c.id ? { ...x, qtd: x.qtd + qtd } : x))
      return [...xs, { produto_id: c.id, modelo: c.modelo, tipo: c.tipo, potencia_kw: c.potencia_kw, qtd, preco_unitario: c.preco }]
    })
  }
  function adicionarEscolhido() {
    const c = catalogo.find((x) => x.id === escolhido)
    if (!c || !(qtdNova > 0)) return
    adicionar(c, Math.round(qtdNova))
    setEscolhido(''); setQtdNova(1)
  }
  const mudar = (i: number, patch: Partial<EquipamentoRecarga>) =>
    setEquipamentos((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const responder = (patch: Partial<RespostasRecarga>) => setRespostas((r) => (r ? { ...r, ...patch } : r))

  async function cadastrarNovo() {
    if (!novo) return
    setErro(null); setOcupado('cadastrando')
    try {
      const r = await api.cadastrar({ tipo: novo.tipo, modelo: novo.modelo, fabricante: novo.fabricante || null, potencia_kw: novo.potencia || null, preco: novo.preco })
      if ('erro' in r) { setErro(r.erro); return }
      setCatalogo((cs) => [...cs, r.equipamento].sort((a, b) => a.modelo.localeCompare(b.modelo, 'pt-BR')))
      adicionar(r.equipamento, 1)
      setNovo(null)
    } finally { setOcupado(null) }
  }

  async function gerar(): Promise<{ url_pdf: string; projeto_id: string } | null> {
    if (pdf) return pdf
    if (!entrada) return null
    setErro(null); setOcupado('gerando')
    try {
      const r = await api.gerarPdf(entrada)
      if ('erro' in r) { setErro(r.erro); return null }
      setPdf({ url_pdf: r.url_pdf, projeto_id: r.projeto_id })
      setCalc((c) => (c ? { ...c, proposta: r.proposta } : c))
      return r
    } finally { setOcupado(null) }
  }
  async function verPdf() {
    const aba = window.open('', '_blank')
    const r = await gerar()
    if (r && aba) aba.location.href = r.url_pdf
    else aba?.close()
  }
  async function enviar() {
    if (!api.enviar) return
    const r = pdf || (await gerar())
    if (!r) return
    setOcupado('enviando'); setErro(null)
    try {
      const e = await api.enviar(r.projeto_id, r.url_pdf, legenda)
      if ('erro' in e) setErro(e.erro)
      else { setEnviada(true); onEnviada?.() }
    } finally { setOcupado(null) }
  }

  if (!dados || !respostas) {
    return erro ? <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>
      : <p className="text-sm text-white/50">Carregando catálogo e parâmetros…</p>
  }
  if (enviada) {
    return (
      <div className="rounded-2xl border border-verde/45 p-4 space-y-1">
        <p className="text-sm font-bold text-white">✅ Proposta enviada no WhatsApp</p>
        <p className="text-xs text-white/60">O PDF ficou nos arquivos do contato e no projeto{dados.projeto_codigo ? ` ${dados.projeto_codigo}` : ''}.</p>
      </div>
    )
  }

  const p = calc?.proposta
  const interno = !!calc?.mostra_interno

  return (
    <div className="space-y-3">
      {/* 1. Equipamentos */}
      <Bloco n="1" titulo="Equipamentos" valor={p ? reais(p.subtotal_equipamentos) : null}>
        <div className="grid grid-cols-[1fr_64px_auto] gap-2">
          <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={inputCls}>
            <option value="" className="bg-noite">Escolha um carregador ou opcional…</option>
            <optgroup label="Carregadores" className="bg-noite">
              {carregadores.map((c) => <option key={c.id} value={c.id} className="bg-noite">{rotuloCat(c)}</option>)}
            </optgroup>
            <optgroup label="Opcionais e extras" className="bg-noite">
              {opcionais.map((c) => <option key={c.id} value={c.id} className="bg-noite">{rotuloCat(c)}</option>)}
            </optgroup>
          </select>
          <CampoNumero valor={qtdNova} onChange={setQtdNova} aria-label="Quantidade" />
          <button type="button" onClick={adicionarEscolhido} disabled={!escolhido}
            className="px-4 py-2 rounded-xl bg-weg-azul text-white text-sm font-bold disabled:opacity-40">Adicionar</button>
        </div>

        {!novo ? (
          <button type="button" onClick={() => setNovo({ tipo: 'carregador', modelo: '', fabricante: '', potencia: 0, preco: 0 })}
            className="text-xs font-bold text-white/70 hover:text-white">+ Cadastrar novo (carregador, totem, suporte…)</button>
        ) : (
          <div className="rounded-xl border border-sol/40 p-3 space-y-2">
            <div className="flex gap-2">
              <Opcao ativo={novo.tipo === 'carregador'} onClick={() => setNovo({ ...novo, tipo: 'carregador' })}>Carregador</Opcao>
              <Opcao ativo={novo.tipo === 'opcional'} onClick={() => setNovo({ ...novo, tipo: 'opcional', potencia: 0 })}>Opcional / extra</Opcao>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={novo.modelo} onChange={(e) => setNovo({ ...novo, modelo: e.target.value })} placeholder="Nome / modelo" className={inputCls} />
              <input value={novo.fabricante} onChange={(e) => setNovo({ ...novo, fabricante: e.target.value })} placeholder="Fabricante (opcional)" className={inputCls} />
              {novo.tipo === 'carregador' && (
                <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Potência (kW)</span>
                  <CampoNumero valor={novo.potencia} onChange={(n) => setNovo({ ...novo, potencia: n })} casas={1} placeholder="Ex.: 7,4" /></label>
              )}
              <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Custo (R$)</span>
                <CampoNumero valor={novo.preco} onChange={(n) => setNovo({ ...novo, preco: n })} casas={2} placeholder="Ex.: 4.500,00" /></label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNovo(null)} className="px-3 py-2 rounded-xl border border-white/15 text-white/70 text-xs font-bold">Cancelar</button>
              <button type="button" onClick={cadastrarNovo} disabled={ocupado === 'cadastrando' || !novo.modelo.trim() || !(novo.preco > 0) || (novo.tipo === 'carregador' && !(novo.potencia > 0))}
                className="px-3 py-2 rounded-xl bg-verde text-white text-xs font-bold disabled:opacity-40">
                {ocupado === 'cadastrando' ? 'Cadastrando…' : 'Cadastrar e adicionar'}
              </button>
            </div>
          </div>
        )}

        {equipamentos.length > 0 && (
          <ul className="space-y-1.5">
            {equipamentos.map((x, i) => (
              <li key={`${x.produto_id}-${i}`} className="rounded-xl border border-white/10 p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-white truncate">{x.tipo === 'carregador' ? '⚡' : '📦'} {x.modelo}</span>
                  <button type="button" onClick={() => setEquipamentos((xs) => xs.filter((_, j) => j !== i))} aria-label="Tirar"
                    className="w-6 h-6 rounded-full bg-white/[0.06] text-white/60 hover:text-white shrink-0">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block"><span className="block text-[10px] text-white/50">Qtd</span>
                    <CampoNumero valor={x.qtd} onChange={(n) => mudar(i, { qtd: Math.max(1, Math.round(n)) })} /></label>
                  {x.tipo === 'carregador' ? (
                    <label className="block"><span className="block text-[10px] text-white/50">Potência (kW)</span>
                      <CampoNumero valor={x.potencia_kw} onChange={(n) => mudar(i, { potencia_kw: n })} casas={1}
                        className={`${inputCls} ${x.potencia_kw > 0 ? '' : 'border-coral/60'}`} /></label>
                  ) : <span />}
                  <label className="block"><span className="block text-[10px] text-white/50">Custo un. (R$)</span>
                    <CampoNumero valor={x.preco_unitario} onChange={(n) => mudar(i, { preco_unitario: n })} casas={2}
                      className={`${inputCls} ${x.preco_unitario > 0 ? '' : 'border-coral/60'}`} placeholder="sob cotação" /></label>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      {/* 2. Projeto */}
      <Bloco n="2" titulo="Projeto" valor={p ? reais(p.subtotal_projeto) : null}>
        <ul className="text-[12px] text-white/75 space-y-0.5">
          {(p?.projeto || [{ chave: 'u', descricao: 'Diagrama unifilar', detalhe: '', valor: 0 }, { chave: 't', descricao: 'Diagrama trifilar', detalhe: '', valor: 0 }]).map((s) => (
            <li key={s.chave} className="flex justify-between gap-2"><span>{s.descricao}</span>{p && <span className="tabular-nums">{reais(s.valor)}</span>}</li>
          ))}
        </ul>
      </Bloco>

      {/* 3. Execução */}
      <Bloco n="3" titulo="Execução" valor={p ? reais(p.subtotal_execucao) : null}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Até o ponto de conexão (m)</span>
            <CampoNumero valor={respostas.distancia_m} onChange={(n) => responder({ distancia_m: n })} /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Rede</span>
            {/* Mono → bi → tri: a ordem carrega sentido */}
            <select value={respostas.fases || ''} onChange={(e) => responder({ fases: (e.target.value || null) as FasesRede | null })} className={inputCls}>
              <option value="" className="bg-noite">Automático{p ? ` (${rotuloFases(p.fases)})` : ''}</option>
              {(['monofasico', 'bifasico', 'trifasico'] as FasesRede[]).map((f) => <option key={f} value={f} className="bg-noite">{rotuloFases(f)[0].toUpperCase() + rotuloFases(f).slice(1)}</option>)}
            </select></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Deslocamento (km de ida)</span>
            <CampoNumero valor={respostas.km_deslocamento} onChange={(n) => responder({ km_deslocamento: n })} placeholder={dados.cidade ? '0' : 'cidade sem cadastro'} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Opcao ativo={respostas.eletroduto_externo} onClick={() => responder({ eletroduto_externo: !respostas.eletroduto_externo })}>Eletroduto externo</Opcao>
          <Opcao ativo={respostas.alvenaria} onClick={() => responder({ alvenaria: !respostas.alvenaria })}>Intervenção na alvenaria</Opcao>
          <Opcao ativo={respostas.infra_embutida} onClick={() => responder({ infra_embutida: !respostas.infra_embutida })}>Infraestrutura embutida</Opcao>
          <Opcao ativo={respostas.aterramento} onClick={() => responder({ aterramento: !respostas.aterramento })}>Aterramento</Opcao>
        </div>
        {dados.cidade && <p className="text-[11px] text-white/45">📍 {dados.cidade}{dados.km_deslocamento ? ` · ${fmtNum(dados.km_deslocamento, 0)} km da Spin (cadastro de cidades)` : ' · cidade sem km cadastrado'}</p>}
        {p && (
          <>
            <ul className="text-[12px] text-white/75 space-y-0.5">
              {p.execucao.map((s) => (
                <li key={s.chave} className="flex justify-between gap-2"><span>{s.descricao} <span className="text-white/45">· {s.detalhe}</span></span><span className="tabular-nums shrink-0">{reais(s.valor)}</span></li>
              ))}
              <li className="flex justify-between gap-2"><span>Materiais elétricos <span className="text-white/45">· {p.materiais.length} itens</span></span><span className="tabular-nums shrink-0">{reais(p.subtotal_materiais)}</span></li>
            </ul>
            {p.materiais.length > 0 && (
              <details className="rounded-xl border border-white/10 px-3 py-2">
                <summary className="text-[11px] font-bold text-white/70 cursor-pointer">Ver materiais (proteção, cabos, infraestrutura e aterramento)</summary>
                <ul className="mt-2 space-y-1">
                  {p.materiais.map((m, i) => (
                    <li key={i} className="text-[11px] text-white/70 flex justify-between gap-2">
                      <span>{m.descricao}{m.origem === 'referencia' ? <span className="text-white/35"> · ref.</span> : null}</span>
                      <span className="tabular-nums shrink-0">{fmtNum(m.qtd, 0)} {m.unidade} · {reais(m.qtd * m.preco_unitario)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Bloco>

      {/* 4. Seções incorporadas (aluguel, alvenaria, elétrica predial…) */}
      <Bloco n="4" titulo="Serviços adicionais" valor={secoes.length ? reais(secoes.reduce((s, x) => s + (x.valor > 0 ? x.valor : 0), 0)) : null}>
        <SecoesProposta faixas={dados.faixas || []} secoes={secoes} onChange={setSecoes} />
      </Bloco>

      {/* Preço */}
      <section className="rounded-2xl border border-sol/40 p-3 space-y-2">
        {interno && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Margem (%)</span>
              <CampoNumero valor={margem ?? 0} onChange={setMargem} casas={1} /></label>
            <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Comissão (%)</span>
              <CampoNumero valor={comissao ?? 0} onChange={setComissao} casas={1} /></label>
          </div>
        )}
        {p ? (
          <>
            {interno && (
              <div className="text-[11px] text-white/55 space-y-0.5">
                <p className="flex justify-between"><span>Custo (equipamentos + projeto + execução)</span><span className="tabular-nums">{reais(p.custo_total)}</span></p>
                <p className="flex justify-between"><span>Margem {fmtNum(p.margem_pct, 1)}%</span><span className="tabular-nums">{reais(p.margem)}</span></p>
                <p className="flex justify-between"><span>Comissão {fmtNum(p.comissao_pct, 1)}%</span><span className="tabular-nums">{reais(p.comissao)}</span></p>
                <p className="flex justify-between"><span>Imposto {fmtNum(p.imposto_pct, 1)}% (nota Spin, sem equipamentos)</span><span className="tabular-nums">{reais(p.imposto)}</span></p>
                <p className="flex justify-between"><span>Desconto máximo na negociação</span><span className="tabular-nums">{reais(p.desconto_max)}</span></p>
              </div>
            )}
            {p.total_secoes > 0 && (
              <div className="text-[11px] text-white/60 space-y-0.5">
                <p className="flex justify-between"><span>Estação de recarga</span><span className="tabular-nums">{reais(p.pv_total)}</span></p>
                <p className="flex justify-between"><span>Serviços adicionais</span><span className="tabular-nums">{reais(p.total_secoes)}</span></p>
              </div>
            )}
            <div className="flex items-end justify-between gap-2 pt-1">
              <span className="text-[11px] font-bold text-white/60 uppercase">Total ao cliente</span>
              <span className="text-2xl font-black text-white tabular-nums">{reais(p.total_geral)}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-white/50">{equipamentos.length ? (calculando ? 'Calculando…' : '—') : 'Adicione um equipamento pra calcular.'}</p>
        )}
        {calculando && p && <p className="text-[10px] text-white/40">Recalculando…</p>}
        {p && p.avisos.length > 0 && (
          <ul className="rounded-xl border border-coral/45 p-2 space-y-0.5">
            {p.avisos.map((a, i) => <li key={i} className="text-[11px] text-white/80">⚠ {a}</li>)}
          </ul>
        )}
      </section>

      {api.enviar && (
        <label className="block">
          <span className="block text-[11px] font-bold text-white/60 mb-1">Mensagem junto do PDF</span>
          <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </label>
      )}
      <div className={`grid gap-2 ${api.enviar ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button type="button" onClick={verPdf} disabled={!!ocupado || !p || !(p.pv_total > 0)}
          className="py-3 rounded-xl bg-weg-azul text-white font-bold text-sm disabled:opacity-40">
          {ocupado === 'gerando' ? 'Gerando PDF…' : pdf ? '📄 Abrir PDF' : '📄 Gerar PDF'}
        </button>
        {api.enviar && (
          <button type="button" onClick={enviar} disabled={!!ocupado || !p || !(p.pv_total > 0)}
            className="py-3 rounded-xl bg-verde text-white font-bold text-sm disabled:opacity-40">
            {ocupado === 'enviando' ? 'Enviando…' : '📲 Enviar no WhatsApp'}
          </button>
        )}
      </div>
      {pdf && <p className="text-[11px] text-white/50 text-center">PDF salvo nos arquivos do contato e no projeto.</p>}
      {erro && <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>}
    </div>
  )
}
