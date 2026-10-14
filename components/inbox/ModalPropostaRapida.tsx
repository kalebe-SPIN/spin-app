'use client'

import { Fragment, useEffect, useState } from 'react'
import {
  dadosPropostaRapidaAction, calcularPropostaRapidaAction, gerarPdfPropostaRapidaAction, enviarPdfPropostaRapidaAction,
  opcoesKitPropostaAction, type EntradaPropostaRapida,
} from '@/app/inbox/proposta-actions'
import { TIPOS_SISTEMA_FV, type OrcamentoLead, type TipoSistemaFv } from '@/lib/spinzap/orcamento-lead'
import type { Auditoria } from '@/lib/spinzap/auditor-orcamento'
import { TIPOS_REDE } from '@/lib/spinzap/perfil'
import { fmtKwp, formatarMoedaBRL } from '@/lib/formatters'
import { rotuloSecao, type FaixaSecao, type SecaoProposta } from '@/lib/propostas/secoes'
import { SecoesProposta } from '@/components/propostas/SecoesProposta'

/**
 * "Montar proposta" direto da conversa (Kalebe 2026-10-13): escolhe a base
 * (consumo, valor da conta ou placas), calcula com o motor de preço da Spin,
 * mostra a auditoria e gera o PDF pra ver ou enviar no WhatsApp — sem sair
 * da conversa. A proposta completa (lista CA, visita) segue no projeto.
 */

type Modo = EntradaPropostaRapida['modo']
const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none'
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0

export function ModalPropostaRapida({ conversaId, nomeCliente, onFechar, onEnviada }: {
  conversaId: string
  nomeCliente: string
  onFechar: () => void
  onEnviada: () => void
}) {
  const [carregando, setCarregando] = useState(true)
  const [modo, setModo] = useState<Modo>('consumo_kwh')
  const [valor, setValor] = useState('')
  const [inversorKw, setInversorKw] = useState('')
  const [rede, setRede] = useState<EntradaPropostaRapida['tipo_rede']>('monofasico')
  const [cidade, setCidade] = useState('')
  const [fatura, setFatura] = useState<{ consumo_kwh: number | null; tarifa_kwh: number | null; subsidio: string | null } | null>(null)
  const [tarifaBase, setTarifaBase] = useState<{ tarifa_kwh: number; amostras: number } | null>(null)
  const [projetoId, setProjetoId] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ orcamento: OrcamentoLead; auditoria: Auditoria; mostra_interno: boolean } | null>(null)
  const [pdf, setPdf] = useState<{ url_pdf: string; projeto_id: string } | null>(null)
  const [legenda, setLegenda] = useState(`Oi${nomeCliente ? `, ${nomeCliente.split(' ')[0]}` : ''}! Segue o seu orçamento de energia solar ☀️ Qualquer dúvida, é só me chamar por aqui.`)
  const [ocupado, setOcupado] = useState<null | 'calculando' | 'gerando' | 'enviando'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)
  // Kalebe 2026-10-13: sistema, modelos e itens extras
  type Opcoes = Exclude<Awaited<ReturnType<typeof opcoesKitPropostaAction>>, { erro: string }>
  const [catalogo, setCatalogo] = useState<Opcoes | null>(null)
  const [sistema, setSistema] = useState<TipoSistemaFv>('string')
  const [placaId, setPlacaId] = useState('')
  const [inversorId, setInversorId] = useState('')
  const [inversorQtd, setInversorQtd] = useState('')
  const [extras, setExtras] = useState<Array<{ produto_id: string; rotulo: string; qtd: number }>>([])
  const [catExtra, setCatExtra] = useState('')
  const [itemExtra, setItemExtra] = useState('')
  const [qtdExtra, setQtdExtra] = useState('1')
  // Seções incorporadas (aluguel, alvenaria, elétrica predial…) — Kalebe 2026-10-13
  const [faixas, setFaixas] = useState<FaixaSecao[]>([])
  const [secoes, setSecoes] = useState<SecaoProposta[]>([])

  useEffect(() => {
    dadosPropostaRapidaAction(conversaId).then((r) => {
      setCarregando(false)
      if ('erro' in r) { setErro(r.erro); return }
      setFaixas(r.faixas || []); setSecoes(r.secoes || [])
      if (r.tipo_rede && ['monofasico', 'bifasico', 'trifasico'].includes(r.tipo_rede)) setRede(r.tipo_rede as any)
      setCidade(r.cidade || '')
      setFatura(r.fatura); setTarifaBase(r.tarifa_base); setProjetoId(r.projeto_id)
      if (r.fatura?.consumo_kwh) { setModo('consumo_kwh'); setValor(String(Math.round(r.fatura.consumo_kwh))) }
    })
    opcoesKitPropostaAction().then((r) => { if (!('erro' in r)) setCatalogo(r) })
  }, [conversaId])

  // Qualquer mudança na entrada invalida o cálculo e o PDF
  useEffect(() => { setResultado(null); setPdf(null) }, [modo, valor, inversorKw, rede, cidade, sistema, placaId, inversorId, inversorQtd, extras, secoes])
  // Trocou o sistema: o modelo escolhido não vale mais
  useEffect(() => { setInversorId(''); setInversorQtd('') }, [sistema])

  // Inversores do sistema escolhido que servem na rede (bifásica usa monofásico; micro é sempre mono)
  const fasesRede = rede === 'trifasico' ? 'tri' : 'mono'
  const inversoresDoSistema = (catalogo?.inversores[sistema] || []).filter((i) => sistema === 'micro' || !i.fases || i.fases === fasesRede)
  const itensDaCategoria = catalogo?.extras.find((g) => g.categoria === catExtra)?.itens || []
  function adicionarExtra() {
    const it = itensDaCategoria.find((i) => i.id === itemExtra)
    const q = Math.round(num(qtdExtra))
    if (!it || !(q > 0)) return
    setExtras((xs) => {
      const ja = xs.find((x) => x.produto_id === it.id)
      return ja ? xs.map((x) => (x.produto_id === it.id ? { ...x, qtd: x.qtd + q } : x)) : [...xs, { produto_id: it.id, rotulo: it.rotulo, qtd: q }]
    })
    setItemExtra(''); setQtdExtra('1')
  }

  const entrada = (): EntradaPropostaRapida => ({
    modo, valor: num(valor), inversor_kw: num(inversorKw) || null, tipo_rede: rede, cidade,
    opcoes: {
      tipo_sistema: sistema,
      placa_id: placaId || null,
      inversor_id: inversorId || null,
      inversor_qtd: sistema !== 'micro' && num(inversorQtd) > 0 ? Math.round(num(inversorQtd)) : null,
      extras: extras.map((x) => ({ produto_id: x.produto_id, qtd: x.qtd })),
    },
    secoes,
  })

  async function calcular() {
    setErro(null); setOcupado('calculando')
    try {
      const r = await calcularPropostaRapidaAction(conversaId, entrada())
      if ('erro' in r) setErro(r.erro)
      else setResultado(r)
    } finally { setOcupado(null) }
  }
  async function gerarPdf(): Promise<{ url_pdf: string; projeto_id: string } | null> {
    if (pdf) return pdf
    setErro(null); setOcupado('gerando')
    try {
      const r = await gerarPdfPropostaRapidaAction(conversaId, entrada())
      if ('erro' in r) { setErro(r.erro); return null }
      setPdf(r); setProjetoId(r.projeto_id)
      return r
    } finally { setOcupado(null) }
  }
  async function verPdf() {
    const r = await gerarPdf()
    if (r) window.open(r.url_pdf, '_blank', 'noopener')
  }
  async function enviar() {
    const barrado = resultado && !resultado.auditoria.aprovado
    if (barrado && !confirm('O auditor apontou problema grave neste orçamento. Enviar mesmo assim?')) return
    const r = pdf || (await gerarPdf())
    if (!r) return
    setOcupado('enviando'); setErro(null)
    try {
      const e = await enviarPdfPropostaRapidaAction(conversaId, r.projeto_id, r.url_pdf, legenda)
      if ('erro' in e) setErro(e.erro)
      else { setEnviada(true); onEnviada() }
    } finally { setOcupado(null) }
  }

  const o = resultado?.orcamento
  const rotuloModo: Record<Modo, string> = { consumo_kwh: 'Consumo', valor_mensal: 'Valor da conta', qtd_placas: 'Placas' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div className="relative w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-noite/85 backdrop-blur-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">💰 Montar proposta</h2>
            <p className="text-[11px] text-white/50">{nomeCliente} · mesmo motor de preço da proposta da Spin</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/70 hover:text-white flex items-center justify-center shrink-0">✕</button>
        </div>

        {carregando ? <p className="text-sm text-white/50">Carregando o que já sabemos do cliente…</p> : enviada ? (
          <div className="rounded-2xl border border-verde/45 p-4 space-y-2">
            <p className="text-sm font-bold text-white">✅ Proposta enviada no WhatsApp</p>
            <p className="text-xs text-white/60">O projeto foi pra negociação no CRM e ficou um follow-up de 1 dia. O PDF está nos arquivos do perfil.</p>
            <div className="flex justify-end"><button onClick={onFechar} className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-white/80 text-sm">Fechar</button></div>
          </div>
        ) : (
          <>
            {(fatura || tarifaBase) && (
              <div className="text-[11px] text-white/65 rounded-xl border border-white/10 px-3 py-2 space-y-0.5">
                {fatura?.consumo_kwh && <p>📄 Fatura lida: {Math.round(fatura.consumo_kwh).toLocaleString('pt-BR')} kWh/mês{fatura.tarifa_kwh ? ` · tarifa R$ ${fatura.tarifa_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}/kWh` : ''}{fatura.subsidio && fatura.subsidio !== 'nenhum' ? ` · ${fatura.subsidio.replace('_', ' ')}` : ''}</p>}
                {!fatura?.tarifa_kwh && tarifaBase && <p>📊 Tarifa de referência: R$ {tarifaBase.tarifa_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}/kWh ({tarifaBase.amostras} faturas reais)</p>}
              </div>
            )}

            {/* Base do dimensionamento */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
              {(['consumo_kwh', 'valor_mensal', 'qtd_placas'] as Modo[]).map((m) => (
                <button key={m} onClick={() => setModo(m)}
                  className={`py-2 rounded-lg text-xs font-bold ${modo === m ? 'bg-sol text-white' : 'text-white/60 hover:text-white'}`}>
                  {rotuloModo[m]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">
                  {modo === 'consumo_kwh' ? 'Consumo médio (kWh/mês)' : modo === 'valor_mensal' ? 'Conta média (R$/mês)' : 'Quantidade de placas'}
                </span>
                <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={inputCls} autoFocus
                  placeholder={modo === 'consumo_kwh' ? 'Ex.: 480' : modo === 'valor_mensal' ? 'Ex.: 650' : 'Ex.: 10'} />
              </label>
              {modo === 'qtd_placas' ? (
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Inversor desejado (kW, opcional)</span>
                  <input value={inversorKw} onChange={(e) => setInversorKw(e.target.value)} inputMode="decimal" className={inputCls} placeholder="Ex.: 8" />
                </label>
              ) : (
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Cidade (irradiação)</span>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputCls} />
                </label>
              )}
              {/* Mono → bi → tri: a ordem carrega sentido */}
              <label className="block">
                <span className="block text-[11px] font-bold text-white/60 mb-1">Tipo de rede</span>
                <select value={rede} onChange={(e) => setRede(e.target.value as any)} className={inputCls}>
                  {TIPOS_REDE.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
                </select>
              </label>
              {modo === 'qtd_placas' && (
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Cidade (irradiação)</span>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputCls} />
                </label>
              )}
            </div>

            {/* Kalebe 2026-10-13: sistema, modelos e itens extras */}
            <div className="space-y-3 rounded-2xl border border-white/10 p-3">
              <div>
                <span className="block text-[11px] font-bold text-white/60 mb-1">Sistema</span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                  {TIPOS_SISTEMA_FV.map((t) => (
                    <button key={t.valor} onClick={() => setSistema(t.valor)}
                      className={`py-2 rounded-lg text-xs font-bold ${sistema === t.valor ? 'bg-weg-azul text-white' : 'text-white/60 hover:text-white'}`}>
                      {t.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Potência em ordem crescente (a ordem carrega sentido) */}
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Placa</span>
                  <select value={placaId} onChange={(e) => setPlacaId(e.target.value)} className={inputCls} disabled={!catalogo}>
                    <option value="" className="bg-noite">Automático (maior potência)</option>
                    {(catalogo?.placas || []).map((p) => <option key={p.id} value={p.id} className="bg-noite">{p.rotulo}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">{sistema === 'micro' ? 'Microinversor' : 'Inversor'}</span>
                  <select value={inversorId} onChange={(e) => setInversorId(e.target.value)} className={inputCls} disabled={!catalogo}>
                    <option value="" className="bg-noite">Automático (recomendado)</option>
                    {inversoresDoSistema.map((i) => <option key={i.id} value={i.id} className="bg-noite">{i.rotulo}</option>)}
                  </select>
                </label>
              </div>
              {sistema !== 'micro' && inversorId && (
                <label className="block max-w-[200px]">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Quantidade de inversores</span>
                  <input value={inversorQtd} onChange={(e) => setInversorQtd(e.target.value)} inputMode="numeric" placeholder="1" className={inputCls} />
                </label>
              )}
              {sistema === 'micro' && (
                <p className="text-[11px] text-white/45">A quantidade de microinversores sai das placas (placas por micro) e fica múltipla das fases da rede, balanceada.</p>
              )}
              {catalogo && inversoresDoSistema.length === 0 && (
                <p className="text-[11px] text-coral">Nenhum {sistema === 'micro' ? 'microinversor' : sistema === 'hibrido' ? 'inversor híbrido' : 'inversor string'} disponível pra essa rede no catálogo.</p>
              )}

              <div>
                <span className="block text-[11px] font-bold text-white/60 mb-1">Itens extras</span>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_64px_auto] gap-2">
                  <select value={catExtra} onChange={(e) => { setCatExtra(e.target.value); setItemExtra('') }} className={inputCls} disabled={!catalogo}>
                    <option value="" className="bg-noite">Categoria…</option>
                    {(catalogo?.extras || []).map((g) => <option key={g.categoria} value={g.categoria} className="bg-noite">{g.rotulo}</option>)}
                  </select>
                  <select value={itemExtra} onChange={(e) => setItemExtra(e.target.value)} className={inputCls} disabled={!catExtra}>
                    <option value="" className="bg-noite">{catExtra ? 'Item…' : 'Escolha a categoria'}</option>
                    {itensDaCategoria.map((i) => <option key={i.id} value={i.id} className="bg-noite">{i.rotulo}</option>)}
                  </select>
                  <input value={qtdExtra} onChange={(e) => setQtdExtra(e.target.value)} inputMode="numeric" aria-label="Quantidade" className={inputCls} />
                  <button onClick={adicionarExtra} disabled={!itemExtra} className="px-4 py-2.5 rounded-xl bg-weg-azul text-white text-sm font-bold disabled:opacity-40">Adicionar</button>
                </div>
                {extras.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {extras.map((x) => (
                      <li key={x.produto_id} className="flex items-center justify-between gap-2 text-[12px] text-white/80 border border-white/10 rounded-lg px-2.5 py-1.5">
                        <span className="truncate">{x.rotulo}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-white/60">{x.qtd} un.</span>
                          <button onClick={() => setExtras((xs) => xs.filter((y) => y.produto_id !== x.produto_id))} aria-label="Tirar"
                            className="w-6 h-6 rounded-full bg-white/[0.06] text-white/60 hover:text-white">✕</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 p-3">
              <span className="block text-[11px] font-bold text-white/60">Serviços adicionais</span>
              <SecoesProposta faixas={faixas} secoes={secoes} onChange={setSecoes} />
            </div>

            {!o && (
              <button onClick={calcular} disabled={!!ocupado || !(num(valor) > 0)}
                className="w-full py-3 rounded-xl bg-verde text-white font-bold text-sm disabled:opacity-40">
                {ocupado === 'calculando' ? 'Calculando…' : 'Calcular'}
              </button>
            )}

            {o && resultado && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 p-4 space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-white/50">Investimento</p>
                      <p className="text-2xl font-black text-white">{formatarMoedaBRL(o.pv_total)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-white/50">Sistema</p>
                      <p className="text-sm font-bold text-white">{fmtKwp(o.kwp)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                    <span className="text-white/50">Placas</span><span className="text-white/85 text-right">{o.qtd_placas} × {o.placa.modelo} ({o.placa.potencia_wp} Wp)</span>
                    <span className="text-white/50">{o.tipo_sistema === 'micro' ? 'Microinversores' : 'Inversor'}</span><span className="text-white/85 text-right">{o.inversor.qtd > 1 ? `${o.inversor.qtd} × ` : ''}{o.inversor.modelo} ({String(o.inversor.potencia_kw).replace('.', ',')} kW)</span>
                    {o.extras.map((x) => (
                      <Fragment key={x.produto_id}><span className="text-white/50 truncate">{x.descricao}</span><span className="text-white/85 text-right">{x.qtd} un.</span></Fragment>
                    ))}
                    {(o.secoes || []).length > 0 && (
                      <>
                        <span className="text-white/50">Sistema fotovoltaico</span><span className="text-white/85 text-right">{formatarMoedaBRL(o.pv_sistema || 0)}</span>
                        {(o.secoes || []).map((s, i) => (
                          <Fragment key={`sec-${i}`}><span className="text-white/50 truncate">{rotuloSecao(s).titulo}</span><span className="text-white/85 text-right">{formatarMoedaBRL(s.valor)}</span></Fragment>
                        ))}
                      </>
                    )}
                    <span className="text-white/50">Geração estimada</span><span className="text-white/85 text-right">{o.geracao_kwh_mes.toLocaleString('pt-BR')} kWh/mês</span>
                    {o.consumo_kwh_mes ? <><span className="text-white/50">Consumo considerado</span><span className="text-white/85 text-right">{Math.round(o.consumo_kwh_mes).toLocaleString('pt-BR')} kWh/mês</span></> : null}
                    <span className="text-white/50">PIX ({o.formas_pagamento.a_vista_pix.desconto_pct}% desc.)</span><span className="text-white/85 text-right">{formatarMoedaBRL(o.formas_pagamento.a_vista_pix.valor)}</span>
                    <span className="text-white/50">Cartão</span><span className="text-white/85 text-right">{o.formas_pagamento.parcelado_cartao.parcelas}× de {formatarMoedaBRL(o.formas_pagamento.parcelado_cartao.valor_parcela)}</span>
                  </div>
                  {resultado.mostra_interno && (
                    <p className="text-[10px] text-white/40">Interno: margem {o.interno.margem_pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% · desconto máx. {formatarMoedaBRL(o.interno.desconto_max_negociacao)}</p>
                  )}
                </div>

                <details className="rounded-2xl border border-white/10 px-4 py-3" open={!resultado.auditoria.aprovado}>
                  <summary className="text-xs font-bold text-white/80 cursor-pointer">
                    {resultado.auditoria.aprovado ? '✅ Auditor: tudo certo' : '⚠️ Auditor encontrou problema grave'} · {resultado.auditoria.itens.filter((i) => !i.ok).length} ponto(s) de atenção
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {resultado.auditoria.itens.map((i, n) => (
                      <li key={n} className="text-[12px] text-white/75 flex gap-2">
                        <span className="shrink-0">{i.ok ? '✓' : i.grave ? '✕' : '!'}</span>
                        <span className={!i.ok && i.grave ? 'text-coral' : ''}>{i.texto}</span>
                      </li>
                    ))}
                  </ul>
                </details>

                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Mensagem junto do PDF</span>
                  <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={verPdf} disabled={!!ocupado} className="py-3 rounded-xl bg-white/[0.06] border border-white/15 text-white font-bold text-sm disabled:opacity-40">
                    {ocupado === 'gerando' ? 'Gerando PDF…' : '📄 Ver PDF'}
                  </button>
                  <button onClick={enviar} disabled={!!ocupado} className="py-3 rounded-xl bg-verde text-white font-bold text-sm disabled:opacity-40">
                    {ocupado === 'enviando' ? 'Enviando…' : '📲 Enviar no WhatsApp'}
                  </button>
                </div>
              </div>
            )}

            {erro && <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>}

            {projetoId && (
              <a href={`/projetos/${projetoId}/orcamento`} target="_blank" rel="noreferrer" className="block text-center text-[11px] text-white/50 hover:text-white">
                Precisa de lista CA, visita ou ajuste fino? Abrir a proposta completa do projeto →
              </a>
            )}
          </>
        )}
      </div>
    </div>
  )
}
