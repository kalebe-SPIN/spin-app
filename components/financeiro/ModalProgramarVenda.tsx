'use client'

import { useEffect, useMemo, useState } from 'react'
import { programarVendaAction, type LinhaProgramada } from '@/app/financeiro/fluxo-caixa/actions'
import {
  FORMAS_PAGAMENTO, GRUPOS, addMeses, arred, brl, dataBR, dividirEmParcelas, lerValor, mesDe, vencimentoDas,
  type Grupo, type VendaPendente,
} from '@/lib/financeiro/fluxo'
import { Campo, InputValor, Selecao, Modal, Aviso, Botoes, classeInput } from './ui'

/**
 * Venda fechada no sistema → recebimentos PREVISTOS pela condição acordada
 * + custos PREVISTOS do orçamento (Kalebe 2026-09-29). Na hora de pagar ou
 * receber de fato, cada linha é efetivada com o valor real.
 */

type Modelo = 'avista' | 'entrada_saldo' | 'parcelado' | 'financiamento' | 'livre'
type Linha = LinhaProgramada & { chave: string; valorTxt: string }

const MODELOS: Array<{ valor: Modelo; rotulo: string }> = [
  { valor: 'avista', rotulo: 'À vista' },
  { valor: 'entrada_saldo', rotulo: 'Entrada + saldo parcelado' },
  { valor: 'financiamento', rotulo: 'Financiamento bancário (liberação única)' },
  { valor: 'livre', rotulo: 'Livre (montar parcela a parcela)' },
  { valor: 'parcelado', rotulo: 'Parcelado (cartão / boleto)' },
]

/** Lê a condição que o vendedor escolheu no "Fechar venda". */
function modeloDoVendedor(cond: string | null, parcelas: number | null): { modelo: Modelo; n: number; forma: string } {
  const c = (cond || '').toLowerCase()
  const cartao = c.match(/(\d+)\s*[×x]\s*no cart/)
  if (cartao) return { modelo: 'parcelado', n: Number(cartao[1]), forma: 'Cartão de crédito' }
  if (c.includes('financiamento')) return { modelo: 'financiamento', n: 1, forma: 'Financiamento bancário' }
  if (c.includes('entrada')) return { modelo: 'entrada_saldo', n: Math.max(1, (parcelas || 2) - 1), forma: 'PIX' }
  if (c.includes('vista')) return { modelo: 'avista', n: 1, forma: 'PIX' }
  return { modelo: 'livre', n: Math.max(1, parcelas || 1), forma: '' }
}

let seq = 0
const nova = (l: LinhaProgramada): Linha => ({ ...l, chave: `l${++seq}`, valorTxt: String(arred(l.valor)).replace('.', ',') })

export function ModalProgramarVenda({ venda, regimeImposto, onFechar, onSalvo }: {
  venda: VendaPendente
  regimeImposto: 'competencia' | 'caixa'
  onFechar: () => void
  onSalvo: (msg: string) => void
}) {
  const inicial = modeloDoVendedor(venda.condicao_vendedor, venda.parcelas_vendedor)
  const temKit = venda.custos.kit > 0
  const [kitPassa, setKitPassa] = useState<boolean | null>(temKit ? null : false)
  const [valorVenda, setValorVenda] = useState(String(arred(venda.valor_venda)).replace('.', ','))
  const [modelo, setModelo] = useState<Modelo>(inicial.modelo)
  const [data1, setData1] = useState(venda.data_venda)
  const [entrada, setEntrada] = useState('')
  const [n, setN] = useState(String(inicial.n))
  const [dataSaldo, setDataSaldo] = useState(addMeses(venda.data_venda, 1))
  const [forma, setForma] = useState(inicial.forma)
  const [regime, setRegime] = useState(regimeImposto)

  const [receb, setReceb] = useState<Linha[]>([])
  const [custos, setCustos] = useState<Linha[]>([])
  const [mexeu, setMexeu] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const venda$ = lerValor(valorVenda)
  const kitFora = kitPassa === false ? venda.custos.kit : 0
  const baseReceber = arred(Math.max(venda$ - kitFora, 0))
  const nNum = Math.max(1, Math.floor(Number(n) || 1))
  const cli = venda.cliente

  // ─── Gera recebimentos pela condição ──────────────────────────────────────
  function gerarRecebimentos(): Linha[] {
    const f = forma || null
    if (modelo === 'avista' || modelo === 'financiamento') {
      return [nova({ direcao: 'entrada', grupo: 'receita_vendas', descricao: `${modelo === 'financiamento' ? 'Liberação do financiamento' : 'Recebimento à vista'} — ${cli}`, valor: baseReceber, data: data1, forma_pagamento: modelo === 'financiamento' ? 'Financiamento bancário' : f })]
    }
    if (modelo === 'entrada_saldo') {
      const ent = entrada ? Math.min(lerValor(entrada), baseReceber) : arred(baseReceber / 2)
      const saldo = dividirEmParcelas(baseReceber - ent, nNum)
      return [
        nova({ direcao: 'entrada', grupo: 'receita_vendas', descricao: `Entrada — ${cli}`, valor: ent, data: data1, forma_pagamento: f }),
        ...saldo.map((v, i) => nova({ direcao: 'entrada', grupo: 'receita_vendas', descricao: `Saldo ${i + 1}/${saldo.length} — ${cli}`, valor: v, data: addMeses(dataSaldo, i), forma_pagamento: f, parcela_num: i + 1, parcelas_total: saldo.length })),
      ]
    }
    if (modelo === 'parcelado') {
      return dividirEmParcelas(baseReceber, nNum).map((v, i) => nova({
        direcao: 'entrada', grupo: 'receita_vendas', descricao: `Parcela ${i + 1}/${nNum} — ${cli}`, valor: v, data: addMeses(data1, i), forma_pagamento: f, parcela_num: i + 1, parcelas_total: nNum,
      }))
    }
    return [nova({ direcao: 'entrada', grupo: 'receita_vendas', descricao: `Recebimento — ${cli}`, valor: baseReceber, data: data1, forma_pagamento: f })]
  }

  // ─── Custos do orçamento como PREVISTO ────────────────────────────────────
  function gerarCustos(rec: Linha[]): Linha[] {
    const c = venda.custos
    const out: Linha[] = []
    const saida = (grupo: Grupo, descricao: string, valor: number, data: string, detalhes?: Record<string, any>) => {
      if (valor > 0.004) out.push(nova({ direcao: 'saida', grupo, descricao, valor: arred(valor), data, detalhes }))
    }
    if (kitPassa) saida('fornecedores', `Kit fotovoltaico (distribuidor) — ${cli}`, c.kit, data1)
    saida('comissoes', `Comissão${venda.vendedor_nome ? ` ${venda.vendedor_nome}` : ''} — ${cli}`, c.comissao, data1,
      venda.vendedor_nome ? { vendedor: venda.vendedor_nome } : undefined)
    saida('custos_projeto', `Instalação / mão de obra — ${cli}`, c.instalacao, data1)
    saida('custos_projeto', `Frete — ${cli}`, c.frete, data1)
    saida('custos_projeto', `Projeto e ART — ${cli}`, c.projeto_art, data1)
    saida('custos_projeto', `Custo da venda — ${cli}`, c.custo_estimado, data1)
    // Imposto: competência = tudo no DAS do mês seguinte à nota; caixa = proporcional a cada recebimento
    if (c.imposto > 0.004) {
      if (regime === 'competencia') {
        saida('impostos', `DAS (Simples) sobre a venda — ${cli}`, c.imposto, vencimentoDas(data1),
          { tipo_imposto: 'DAS — Simples Nacional', competencia: mesDe(data1) })
      } else {
        const total = rec.reduce((s, r) => s + lerValor(r.valorTxt), 0) || 1
        const porMes = new Map<string, number>()
        for (const r of rec) porMes.set(mesDe(r.data), (porMes.get(mesDe(r.data)) || 0) + c.imposto * lerValor(r.valorTxt) / total)
        for (const [mes, v] of Array.from(porMes.entries()).sort()) {
          saida('impostos', `DAS (Simples) ${mes.split('-').reverse().join('/')} — ${cli}`, v, vencimentoDas(mes + '-01'),
            { tipo_imposto: 'DAS — Simples Nacional', competencia: mes })
        }
      }
    }
    return out
  }

  // Regera enquanto o admin não mexer nas linhas à mão
  useEffect(() => {
    if (mexeu) return
    const r = gerarRecebimentos()
    setReceb(r)
    setCustos(gerarCustos(r))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo, data1, entrada, n, dataSaldo, forma, valorVenda, kitPassa, regime, mexeu])

  function editar(lista: 'r' | 'c', chave: string, patch: Partial<Linha>) {
    setMexeu(true)
    const f = (ls: Linha[]) => ls.map((l) => (l.chave === chave ? { ...l, ...patch } : l))
    if (lista === 'r') setReceb(f); else setCustos(f)
  }
  function remover(lista: 'r' | 'c', chave: string) {
    setMexeu(true)
    if (lista === 'r') setReceb((ls) => ls.filter((l) => l.chave !== chave))
    else setCustos((ls) => ls.filter((l) => l.chave !== chave))
  }
  function adicionar(lista: 'r' | 'c') {
    setMexeu(true)
    if (lista === 'r') setReceb((ls) => [...ls, nova({ direcao: 'entrada', grupo: 'receita_vendas', descricao: `Recebimento — ${cli}`, valor: 0, data: data1, forma_pagamento: forma || null })])
    else setCustos((ls) => [...ls, nova({ direcao: 'saida', grupo: 'custos_projeto', descricao: `Custo — ${cli}`, valor: 0, data: data1 })])
  }

  const totRec = useMemo(() => arred(receb.reduce((s, l) => s + lerValor(l.valorTxt), 0)), [receb])
  const totCus = useMemo(() => arred(custos.reduce((s, l) => s + lerValor(l.valorTxt), 0)), [custos])
  const diferenca = arred(totRec - baseReceber)

  async function salvar() {
    setErro(null)
    if (temKit && kitPassa === null) { setErro('Informe se o kit passa pelo caixa da Spin ou é faturado direto ao cliente'); return }
    setSalvando(true)
    try {
      const linhas: LinhaProgramada[] = [...receb, ...custos].map(({ chave, valorTxt, ...l }) => ({ ...l, valor: lerValor(valorTxt) }))
      const r = await programarVendaAction({
        origem: venda.origem, origem_id: venda.origem_id, projeto_id: venda.projeto_id,
        kit_passa_caixa: temKit ? kitPassa : null, valor_venda: venda$,
        condicao: {
          modelo, data_1: data1, entrada: entrada ? lerValor(entrada) : null, parcelas: nNum, forma, regime_imposto: regime,
          condicao_vendedor: venda.condicao_vendedor, observacoes_vendedor: venda.observacoes_vendedor,
        },
        linhas,
      })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(`${cli}: ${r.criados} lançamentos previstos no fluxo`)
    } finally { setSalvando(false) }
  }

  // Função (não componente): componente declarado aqui remontaria e perderia o foco a cada tecla
  const tabelaLinhas = (lista: 'r' | 'c', linhas: Linha[]) => (
    <div className="space-y-1.5">
      {linhas.map((l) => (
        <div key={l.chave} className="grid grid-cols-[1fr_auto] sm:grid-cols-[auto_1fr_140px_140px_auto] gap-1.5 items-center">
          <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 whitespace-nowrap">{GRUPOS[l.grupo].emoji} {GRUPOS[l.grupo].rotulo}</span>
          <input className={`${classeInput} text-xs py-1.5`} value={l.descricao} onChange={(e) => editar(lista, l.chave, { descricao: e.target.value })} />
          <button onClick={() => remover(lista, l.chave)} className="sm:order-last text-white/40 hover:text-coral px-1" title="Remover">✕</button>
          <input type="date" className={`${classeInput} text-xs py-1.5`} value={l.data} onChange={(e) => editar(lista, l.chave, { data: e.target.value })} />
          <input inputMode="decimal" className={`${classeInput} text-xs py-1.5 font-mono text-right`} value={l.valorTxt}
            onChange={(e) => editar(lista, l.chave, { valorTxt: e.target.value.replace(/[^\d.,]/g, '') })} />
        </div>
      ))}
      <button onClick={() => adicionar(lista)} className="text-xs text-white/55 hover:text-white">+ {lista === 'r' ? 'recebimento' : 'custo'}</button>
    </div>
  )

  return (
    <Modal titulo={`📥 Programar recebimento — ${cli}`} largura="max-w-4xl"
      subtitulo={`Venda de ${dataBR(venda.data_venda)}${venda.vendedor_nome ? ` · ${venda.vendedor_nome}` : ''} · tudo entra como PREVISTO; você efetiva com o valor real depois.`}
      onFechar={onFechar}>

      {(venda.condicao_vendedor || venda.observacoes_vendedor) && (
        <Aviso tipo="info">
          <strong>Condição informada no fechamento:</strong> {venda.condicao_vendedor || '—'}
          {venda.parcelas_vendedor ? ` · ${venda.parcelas_vendedor} parcela(s)` : ''}
          {venda.observacoes_vendedor && <><br />“{venda.observacoes_vendedor}”</>}
        </Aviso>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo rotulo="Valor da venda"><InputValor valor={valorVenda} onChange={setValorVenda} /></Campo>
        {temKit && (
          <Campo rotulo="Kit (equipamentos) *" className="sm:col-span-2"
            dica={`Kit do orçamento: ${brl(venda.custos.kit)}`}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, t: 'Faturado direto ao cliente', d: 'não passa pelo caixa' },
                { v: true, t: 'Passa pelo caixa da Spin', d: 'entra e sai como fornecedor' },
              ].map((o) => (
                <button key={String(o.v)} type="button" onClick={() => setKitPassa(o.v)}
                  className={`p-2 rounded border text-left text-xs ${kitPassa === o.v ? 'border-sol bg-sol/10 text-sol' : 'border-white/15 text-white/70 hover:border-white/30'}`}>
                  <span className="font-bold block">{o.t}</span><span className="text-[10px] opacity-70">{o.d}</span>
                </button>
              ))}
            </div>
          </Campo>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo rotulo="Condição de recebimento"><Selecao valor={modelo} onChange={(v) => { setModelo(v as Modelo); setMexeu(false) }} opcoes={MODELOS.map((m) => ({ valor: m.valor, rotulo: m.rotulo }))} /></Campo>
        <Campo rotulo={modelo === 'entrada_saldo' ? 'Data da entrada' : modelo === 'parcelado' ? '1ª parcela' : 'Data do recebimento'}>
          <input type="date" className={classeInput} value={data1} onChange={(e) => setData1(e.target.value)} />
        </Campo>
        <Campo rotulo="Forma"><Selecao valor={forma} onChange={setForma} vazio="—" opcoes={FORMAS_PAGAMENTO.map((f) => ({ valor: f, rotulo: f }))} /></Campo>
        {modelo === 'entrada_saldo' && (
          <>
            <Campo rotulo="Valor da entrada" dica="Vazio = 50%"><InputValor valor={entrada} onChange={setEntrada} placeholder={String(arred(baseReceber / 2)).replace('.', ',')} /></Campo>
            <Campo rotulo="Parcelas do saldo"><input type="number" min={1} max={120} className={classeInput} value={n} onChange={(e) => setN(e.target.value)} /></Campo>
            <Campo rotulo="1º vencimento do saldo"><input type="date" className={classeInput} value={dataSaldo} onChange={(e) => setDataSaldo(e.target.value)} /></Campo>
          </>
        )}
        {modelo === 'parcelado' && (
          <Campo rotulo="Nº de parcelas"><input type="number" min={1} max={120} className={classeInput} value={n} onChange={(e) => setN(e.target.value)} /></Campo>
        )}
        {venda.custos.imposto > 0 && (
          <Campo rotulo="Imposto (DAS)" className={modelo === 'parcelado' ? 'sm:col-span-2' : ''}>
            <Selecao valor={regime} onChange={(v) => setRegime(v as any)} opcoes={[
              { valor: 'competencia', rotulo: 'Na emissão da nota (competência)' },
              { valor: 'caixa', rotulo: 'A cada recebimento (regime de caixa)' },
            ]} />
          </Campo>
        )}
      </div>

      {mexeu && (
        <button onClick={() => setMexeu(false)} className="text-xs text-sol hover:underline">↻ Regerar tudo pela condição (descarta ajustes manuais)</button>
      )}

      <div className="space-y-3">
        <div>
          <p className="text-[11px] uppercase font-bold text-verde/80 tracking-wider mb-1.5">
            ↑ Recebimentos previstos · {brl(totRec)}
            {Math.abs(diferenca) > 0.01 && <span className="text-coral normal-case font-normal ml-2">⚠ {diferenca > 0 ? 'sobram' : 'faltam'} {brl(Math.abs(diferenca))} em relação a {brl(baseReceber)}</span>}
          </p>
          {tabelaLinhas('r', receb)}
        </div>
        <div>
          <p className="text-[11px] uppercase font-bold text-coral/80 tracking-wider mb-1.5">↓ Custos previstos (do orçamento) · {brl(totCus)}</p>
          {tabelaLinhas('c', custos)}
          {venda.origem === 'projeto' && (
            <p className="text-[10px] text-white/40 mt-1">
              Valores do orçamento ajustados ao preço fechado. Quando comprar/pagar de verdade, clique em “Efetivar” e informe o valor efetivamente pago.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-sm flex flex-wrap gap-x-5 gap-y-1">
        <span className="text-white/60">Entradas <strong className="text-verde">{brl(totRec)}</strong></span>
        <span className="text-white/60">Saídas <strong className="text-coral">{brl(totCus)}</strong></span>
        <span className="text-white/60">Resultado de caixa previsto <strong className={totRec - totCus >= 0 ? 'text-sol' : 'text-coral'}>{brl(totRec - totCus)}</strong></span>
      </div>

      {erro && <Aviso tipo="erro">⚠️ {erro}</Aviso>}
      <Botoes onCancelar={onFechar} onConfirmar={salvar} processando={salvando} rotulo="Lançar no fluxo como previsto" />
    </Modal>
  )
}
