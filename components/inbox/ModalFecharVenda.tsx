'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  dadosFechamentoAction, gerarPdfFinalServidorAction, prepararPdfFinalFvAction, registrarPdfFinalFvAction, fecharVendaConversaAction,
  type DadosFechamento,
} from '@/app/inbox/fechamento-actions'
import type { DadosPdfOficial } from '@/app/inbox/proposta-actions'
import { CONDICOES_VENDA, normalizarFechamento, type ClienteVenda, type FechamentoVenda } from '@/lib/propostas/fechamento'
import { INFO_CATEGORIA } from '@/lib/propostas/categorias'
import { formatarCpfCnpj, formatarMoedaBRL, fmtNum } from '@/lib/formatters'
import { PropostaPDFTemplate } from '@/components/PropostaPDFTemplate'
import { esperarImagens, pdfDoTemplate, subirPdfProposta } from '@/lib/propostas/pdf-oficial-cliente'
import type { PropostaCalculada } from '@/lib/precificacao/calcular'
import { CampoNumero } from '@/components/propostas/CampoNumero'

/**
 * Fechar a venda pela conversa (Kalebe 2026-10-16): desconto negociado, forma
 * de pagamento e dados do cliente → proposta final atualizada pro cliente →
 * negócio fechado (vendido: dashboard, CRM e fluxo de caixa).
 */

const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none'
const reais = formatarMoedaBRL
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
/** "12× no cartão" → 12 */
const parcelasDaCondicao = (c: string) => Number((c.match(/(\d+)\s*×/) || [])[1]) || null

function Campo({ rotulo, children, className = '' }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold text-white/60 mb-1">{rotulo}</span>
      {children}
    </label>
  )
}

export function ModalFecharVenda({ conversaId, projetoId, nomeCliente, onFechar, onConcluida, onEditarProposta }: {
  conversaId: string
  projetoId: string
  nomeCliente: string
  onFechar: () => void
  onConcluida: () => void
  onEditarProposta?: (categoria: string) => void
}) {
  const [d, setD] = useState<DadosFechamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modoDesc, setModoDesc] = useState<'valor' | 'pct'>('valor')
  const [desconto, setDesconto] = useState(0)
  const [condicao, setCondicao] = useState<string>(CONDICOES_VENDA[0])
  const [parcelasSaldo, setParcelasSaldo] = useState(1)
  const [entradaValor, setEntradaValor] = useState(0)
  const [dataVenda, setDataVenda] = useState(hoje())
  const [dataPagamento, setDataPagamento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [cliente, setCliente] = useState<ClienteVenda | null>(null)
  const [enviar, setEnviar] = useState(true)
  // Texto ao cliente — Kalebe aprova (regra da casa pra textos novos)
  const [legenda, setLegenda] = useState(`Oi${nomeCliente ? `, ${nomeCliente.split(' ')[0]}` : ''}! Segue a proposta final com as condições que combinamos. Obrigado pela confiança! ☀️`)
  const [pdf, setPdf] = useState<{ url: string; nome_arquivo: string } | null>(null)
  const [ocupado, setOcupado] = useState<null | 'gerando' | 'fechando'>(null)
  const [concluido, setConcluido] = useState<null | { enviado: boolean }>(null)
  // FV: modelo oficial desenhado no navegador
  const [oficial, setOficial] = useState<{ dados: DadosPdfOficial; condicao: { titulo: string; valor: string; sub?: string } } | null>(null)
  const templateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dadosFechamentoAction(conversaId, projetoId).then((r) => {
      if ('erro' in r) { setErro(r.erro); return }
      setD(r); setCliente(r.cliente)
    })
  }, [conversaId, projetoId])

  const valorProposta = d?.proposta?.valor || 0
  const descontoReais = Math.round((modoDesc === 'pct' ? valorProposta * desconto / 100 : desconto) * 100) / 100
  const fechamento: FechamentoVenda = useMemo(() => normalizarFechamento({
    valor_proposta: valorProposta,
    desconto: descontoReais,
    valor_final: valorProposta - descontoReais,
    condicao_pagamento: condicao,
    parcelas: /cart/i.test(condicao) ? parcelasDaCondicao(condicao) : /entrada/i.test(condicao) ? parcelasSaldo + 1 : null,
    entrada_valor: /entrada/i.test(condicao) ? entradaValor || null : null,
    data_venda: dataVenda,
    data_pagamento: dataPagamento || null,
    observacoes: observacoes || null,
  }), [valorProposta, descontoReais, condicao, parcelasSaldo, entradaValor, dataVenda, dataPagamento, observacoes])
  // Mudou qualquer condição ou dado do cliente: a proposta final precisa sair de novo
  useEffect(() => { setPdf(null) }, [fechamento, cliente])

  const acimaDoLimite = !!d && !d.eh_admin && descontoReais > 0 && (d.desconto_max == null || descontoReais > d.desconto_max + 0.01)
  const mudarCliente = (patch: Partial<ClienteVenda>) => setCliente((c) => (c ? { ...c, ...patch } : c))
  const mudarEndereco = (patch: Partial<ClienteVenda['endereco']>) => setCliente((c) => (c ? { ...c, endereco: { ...c.endereco, ...patch } } : c))

  async function gerarFinal(): Promise<{ url: string; nome_arquivo: string } | null> {
    if (pdf) return pdf
    if (!d || !cliente) return null
    setErro(null); setOcupado('gerando')
    try {
      if (d.projeto.categoria === 'fotovoltaico') {
        const r = await prepararPdfFinalFvAction(conversaId, projetoId, fechamento, cliente)
        if ('erro' in r) { setErro(r.erro); return null }
        flushSync(() => setOficial({ dados: r.dados, condicao: r.condicao }))
        const el = templateRef.current
        if (!el) { setErro('Não consegui montar o PDF'); return null }
        await esperarImagens(el)
        const blob = await pdfDoTemplate(el)
        const url = await subirPdfProposta(projetoId, blob, 'proposta-final')
        if (typeof url !== 'string') { setErro(url.erro); return null }
        const reg = await registrarPdfFinalFvAction(conversaId, projetoId, url, fechamento)
        if ('erro' in reg) { setErro(reg.erro); return null }
        const x = { url, nome_arquivo: r.nome_arquivo }
        setPdf(x); return x
      }
      const r = await gerarPdfFinalServidorAction(conversaId, projetoId, fechamento)
      if ('erro' in r) { setErro(r.erro); return null }
      const x = { url: r.url_pdf, nome_arquivo: 'Proposta-final-Spin-Solar.pdf' }
      setPdf(x); return x
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar a proposta final')
      return null
    } finally { setOcupado(null); setOficial(null) }
  }

  async function verFinal() {
    const aba = window.open('', '_blank')
    const r = await gerarFinal()
    if (r && aba) aba.location.href = r.url
    else aba?.close()
  }

  async function fechar() {
    if (!d || !cliente) return
    if (!confirm(`Fechar a venda de ${reais(fechamento.valor_final)} (${fechamento.condicao_pagamento})${enviar ? ' e enviar a proposta final ao cliente' : ''}?`)) return
    let url: string | null = null
    let nome: string | undefined
    if (d.pode_gerar_final) {
      const r = await gerarFinal()
      if (!r) return
      url = r.url; nome = r.nome_arquivo
    } else {
      // Sem proposta final por aqui (ex.: venda de equipamento): vai a última proposta
      url = d.proposta?.url_pdf || null
    }
    setOcupado('fechando'); setErro(null)
    try {
      const r = await fecharVendaConversaAction({
        conversa_id: conversaId, projeto_id: projetoId, fechamento, cliente,
        url_pdf_final: url, enviar: enviar && !!url, legenda, nome_arquivo: nome,
      })
      if ('erro' in r) { setErro(r.erro); return }
      setConcluido({ enviado: r.enviado }); onConcluida()
    } finally { setOcupado(null) }
  }

  const cat = d?.projeto.categoria ? INFO_CATEGORIA[d.projeto.categoria] : null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div className="relative w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-noite/85 backdrop-blur-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">🤝 Fechar venda</h2>
            <p className="text-[11px] text-white/50">{nomeCliente}{cat ? ` · ${cat.emoji} ${cat.rotulo}` : ''}{d?.projeto.codigo ? ` · ${d.projeto.codigo}` : ''}</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/70 hover:text-white flex items-center justify-center">✕</button>
        </div>

        {!d || !cliente ? (
          erro ? <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p> : <p className="text-sm text-white/50">Carregando a proposta…</p>
        ) : concluido ? (
          <div className="rounded-2xl border border-verde/45 p-4 space-y-2">
            <p className="text-sm font-bold text-white">✅ Negócio fechado — {reais(fechamento.valor_final)}</p>
            <p className="text-xs text-white/60">
              {concluido.enviado ? 'A proposta final foi enviada no WhatsApp. ' : ''}O projeto foi pra vendido: entra nas vendas do mês do dashboard, no CRM e no fluxo de caixa. A conversa foi pra “Fechado”.
            </p>
            <div className="flex justify-end"><button onClick={onFechar} className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-white/80 text-sm">Fechar</button></div>
          </div>
        ) : d.projeto.vendido ? (
          <div className="rounded-2xl border border-verde/45 p-4 space-y-1">
            <p className="text-sm font-bold text-white">✅ Esta venda já está fechada</p>
            {d.venda_atual && <p className="text-xs text-white/60">{reais(d.venda_atual.preco_final)} · {d.venda_atual.condicao_pagamento}{d.venda_atual.data_venda ? ` · ${new Date(`${d.venda_atual.data_venda}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}</p>}
            <p className="text-[11px] text-white/45">Ajustes numa venda fechada: pela tela do projeto (só admin).</p>
          </div>
        ) : !d.proposta ? (
          <p className="text-xs text-white/80 rounded-xl border border-coral/40 p-3">Gere e envie a proposta antes de fechar a venda.</p>
        ) : (
          <>
            {/* 1. A proposta enviada */}
            <section className="rounded-2xl border border-white/10 p-3 space-y-2">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] text-white/50">Proposta enviada em {new Date(d.proposta.gerado_em).toLocaleDateString('pt-BR')}</p>
                  <p className="text-xl font-black text-white tabular-nums">{reais(valorProposta)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {d.proposta.url_pdf && <a href={d.proposta.url_pdf} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg border border-white/15 text-white/80 text-[11px] font-bold">📄 Ver</a>}
                  {onEditarProposta && d.projeto.categoria && (
                    <button type="button" onClick={() => onEditarProposta(d.projeto.categoria!)} className="px-2.5 py-1.5 rounded-lg bg-weg-azul text-white text-[11px] font-bold">✏ Editar proposta</button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-white/45">Precisa mudar item, quantidade ou valor? Edite a proposta, gere o PDF de novo e volte aqui — o fechamento usa a versão mais recente.</p>
            </section>

            {/* 2. Negociação */}
            <section className="rounded-2xl border border-white/10 p-3 space-y-2">
              <h3 className="text-sm font-black text-white">Desconto negociado</h3>
              <div className="grid grid-cols-[auto_1fr] gap-2 items-end">
                <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                  {(['valor', 'pct'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => { setModoDesc(m); setDesconto(0) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${modoDesc === m ? 'bg-weg-azul text-white' : 'text-white/60'}`}>{m === 'valor' ? 'R$' : '%'}</button>
                  ))}
                </div>
                <CampoNumero valor={desconto} onChange={(n) => setDesconto(Math.max(0, n))} casas={2} aria-label="Desconto"
                  className={`${inputCls} ${acimaDoLimite ? 'border-coral/70' : ''}`} />
              </div>
              <p className="text-[11px] text-white/55">
                {d.eh_admin
                  ? d.desconto_max != null ? `Referência do motor: desconto máximo de ${reais(d.desconto_max)} (margem mínima).` : 'Sem limite calculado para esta proposta.'
                  : d.desconto_max != null ? `Você pode dar até ${reais(d.desconto_max)}; acima disso, só o admin.` : 'Desconto nesta proposta só com o admin.'}
              </p>
              <div className="flex items-end justify-between gap-2 pt-1">
                <span className="text-[11px] font-bold text-white/60 uppercase">Valor final</span>
                <span className="text-2xl font-black text-white tabular-nums">{reais(fechamento.valor_final)}</span>
              </div>
              {descontoReais > 0 && <p className="text-[11px] text-white/55 text-end">− {reais(descontoReais)} ({fmtNum(valorProposta > 0 ? (descontoReais / valorProposta) * 100 : 0, 1)}%)</p>}
            </section>

            {/* 3. Pagamento */}
            <section className="rounded-2xl border border-white/10 p-3 space-y-2">
              <h3 className="text-sm font-black text-white">Forma de pagamento</h3>
              {/* Ordem das condições do "Fechar venda" do projeto (o fluxo de caixa lê esse texto) */}
              <select value={condicao} onChange={(e) => setCondicao(e.target.value)} className={inputCls}>
                {CONDICOES_VENDA.map((c) => <option key={c} value={c} className="bg-noite">{c}</option>)}
              </select>
              {/entrada/i.test(condicao) && (
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Entrada (R$, vazio = 50%)"><CampoNumero valor={entradaValor} onChange={(n) => setEntradaValor(Math.max(0, n))} casas={2} className={inputCls} /></Campo>
                  <Campo rotulo="Saldo em quantas parcelas"><CampoNumero valor={parcelasSaldo} onChange={(n) => setParcelasSaldo(Math.max(1, Math.round(n)))} className={inputCls} /></Campo>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Data da venda"><input type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} className={inputCls} /></Campo>
                <Campo rotulo="1º pagamento (opcional)"><input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className={inputCls} /></Campo>
              </div>
              <Campo rotulo={/^outra/i.test(condicao) ? 'Como vai ser o pagamento (obrigatório)' : 'Observações (opcional)'}>
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
              </Campo>
            </section>

            {/* 4. Dados do cliente (cadastro; no PDF vai só nome e CPF/CNPJ) */}
            <section className="rounded-2xl border border-white/10 p-3 space-y-2">
              <h3 className="text-sm font-black text-white">Dados do cliente</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Campo rotulo="Nome / razão social" className="sm:col-span-2"><input value={cliente.nome} onChange={(e) => mudarCliente({ nome: e.target.value })} className={inputCls} /></Campo>
                <Campo rotulo="CPF / CNPJ"><input value={formatarCpfCnpj(cliente.cpf_cnpj)} onChange={(e) => mudarCliente({ cpf_cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) })} inputMode="numeric" className={inputCls} /></Campo>
                <Campo rotulo="Telefone"><input value={cliente.telefone} onChange={(e) => mudarCliente({ telefone: e.target.value })} inputMode="tel" className={inputCls} /></Campo>
                <Campo rotulo="E-mail" className="sm:col-span-2"><input value={cliente.email} onChange={(e) => mudarCliente({ email: e.target.value })} inputMode="email" className={inputCls} /></Campo>
                <Campo rotulo="CEP"><input value={cliente.endereco.cep} onChange={(e) => mudarEndereco({ cep: e.target.value })} inputMode="numeric" className={inputCls} /></Campo>
                <Campo rotulo="Rua"><input value={cliente.endereco.rua} onChange={(e) => mudarEndereco({ rua: e.target.value })} className={inputCls} /></Campo>
                <Campo rotulo="Número"><input value={cliente.endereco.numero} onChange={(e) => mudarEndereco({ numero: e.target.value })} className={inputCls} /></Campo>
                <Campo rotulo="Complemento"><input value={cliente.endereco.complemento} onChange={(e) => mudarEndereco({ complemento: e.target.value })} className={inputCls} /></Campo>
                <Campo rotulo="Bairro"><input value={cliente.endereco.bairro} onChange={(e) => mudarEndereco({ bairro: e.target.value })} className={inputCls} /></Campo>
                <div className="grid grid-cols-[1fr_64px] gap-2">
                  <Campo rotulo="Cidade"><input value={cliente.endereco.cidade} onChange={(e) => mudarEndereco({ cidade: e.target.value })} className={inputCls} /></Campo>
                  <Campo rotulo="UF"><input value={cliente.endereco.uf} onChange={(e) => mudarEndereco({ uf: e.target.value.toUpperCase().slice(0, 2) })} className={inputCls} /></Campo>
                </div>
              </div>
            </section>

            {/* 5. Proposta final e envio */}
            <section className="rounded-2xl border border-sol/40 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-white/85">
                <input type="checkbox" checked={enviar} onChange={(e) => setEnviar(e.target.checked)} />
                {d.pode_gerar_final ? 'Enviar a proposta final atualizada no WhatsApp' : 'Enviar a proposta no WhatsApp'}
              </label>
              {enviar && (
                <Campo rotulo="Mensagem junto do PDF">
                  <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
                </Campo>
              )}
              {!d.pode_gerar_final && d.aviso_final && <p className="text-[11px] text-white/70 rounded-lg border border-sol/40 px-2 py-1.5">{d.aviso_final}</p>}
              <div className={`grid gap-2 ${d.pode_gerar_final ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {d.pode_gerar_final && (
                  <button type="button" onClick={verFinal} disabled={!!ocupado || acimaDoLimite}
                    className="py-3 rounded-xl bg-weg-azul text-white font-bold text-sm disabled:opacity-40">
                    {ocupado === 'gerando' ? 'Gerando…' : pdf ? '📄 Abrir proposta final' : '📄 Ver proposta final'}
                  </button>
                )}
                <button type="button" onClick={fechar} disabled={!!ocupado || acimaDoLimite || !(fechamento.valor_final > 0)}
                  className="py-3 rounded-xl bg-verde text-white font-bold text-sm disabled:opacity-40">
                  {ocupado === 'fechando' ? 'Fechando…' : enviar ? '✅ Fechar venda e enviar' : '✅ Fechar venda'}
                </button>
              </div>
            </section>

            {erro && <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>}
          </>
        )}
      </div>
      {/* FV: modelo oficial fora da tela, só enquanto gera o PDF */}
      {oficial && (
        <div className="tema-fixo" style={{ position: 'absolute', left: '-99999px', top: 0, zIndex: -1 }} aria-hidden>
          <PropostaPDFTemplate ref={templateRef} projeto={oficial.dados.projeto} proposta={{ pv_total: oficial.dados.pv_total } as PropostaCalculada}
            configEmpresa={oficial.dados.config_empresa} listaCa={[]} campanhaAplicada={oficial.dados.campanha} condicaoAcordada={oficial.condicao} />
        </div>
      )}
    </div>
  )
}
