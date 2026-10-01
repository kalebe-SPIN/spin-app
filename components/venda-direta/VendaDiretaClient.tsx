'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtNum, formatarCpfCnpj } from '@/lib/formatters'
import type { ParametrosVigentes } from '@/lib/precificacao/calcular'
import { calcularVendaDireta, custoDoItem, erroTravaCupom, type CupomAplicado, type ItemVendaDireta } from '@/lib/precificacao/venda-direta'
import { validarDadosVendaDireta, enderecoEntrega, type DadosVendaDireta, type ItemDadosVendaDireta } from '@/lib/venda-direta/tipos'
import { rotuloCategoria, rotuloSubcategoria, type ProdutoCatalogoVD } from '@/lib/venda-direta/preco'
import { FormDadosVendaDireta, inputCls } from './FormDadosVendaDireta'
import { PropostaVendaDiretaPDF } from './PropostaVendaDiretaPDF'
import { BotaoEnviarPropostaCanal } from '@/components/proposta/BotaoEnviarPropostaCanal'
import {
  salvarDadosVendaDiretaAction,
  salvarEquipamentosVendaDiretaAction,
  registrarPdfVendaDiretaAction,
  validarCupomVendaDiretaAction,
} from '@/app/venda-direta/actions'

const BUCKET_PROPOSTAS = 'propostas-pdf'
const brl = (v: number) => `R$ ${fmtNum(v, 2)}`
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const lerValorBR = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0
const semEmoji = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '')

/** Item com preço digitado ainda incompleto (sem valor ou sem dizer se é tabela/custo). */
function pendenciaPreco(it: ItemVendaDireta, ehAdmin: boolean): string | null {
  if (!it.preco_manual || it.qtd <= 0) return null
  if (!(it.preco_tabela > 0)) return ehAdmin ? `Informe o preço de "${it.modelo}"` : `"${it.modelo}" aguarda o admin informar o preço`
  if (ehAdmin && !it.base_preco) return `Diga se o preço de "${it.modelo}" é tabela WEG (com fator) ou custo (sem fator)`
  return null
}

export function VendaDiretaClient({
  projeto,
  dadosIniciais,
  catalogo,
  params,
  configEmpresa,
  ehAdmin,
}: {
  projeto: any
  dadosIniciais: ItemDadosVendaDireta
  catalogo: ProdutoCatalogoVD[]
  params: ParametrosVigentes
  configEmpresa: any
  ehAdmin: boolean
}) {
  const router = useRouter()
  const [dados, setDados] = useState<DadosVendaDireta>({ nf: dadosIniciais.nf, entrega: dadosIniciais.entrega })
  const [editandoDados, setEditandoDados] = useState(!!validarDadosVendaDireta({ nf: dadosIniciais.nf, entrega: dadosIniciais.entrega }))
  const [itens, setItens] = useState<ItemVendaDireta[]>(dadosIniciais.itens || [])
  const [frete, setFrete] = useState<string>(dadosIniciais.frete ? fmtNum(dadosIniciais.frete, 2) : '')
  const [busca, setBusca] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroSub, setFiltroSub] = useState('')
  const [precosTxt, setPrecosTxt] = useState<Record<string, string>>(() =>
    Object.fromEntries((dadosIniciais.itens || []).filter((i) => i.preco_manual && i.produto_id)
      .map((i) => [i.produto_id as string, i.preco_tabela ? fmtNum(i.preco_tabela, 2) : ''])))
  const [urlPdf, setUrlPdf] = useState<string | null>(dadosIniciais.url_pdf || projeto.url_pdf_proposta || null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [pending, startTransition] = useTransition()
  const templateRef = useRef<HTMLDivElement>(null)

  // Cupom (Kalebe 2026-09-30): só admin aplica; comissão e imposto sobre o valor com desconto
  const [cupom, setCupom] = useState<CupomAplicado | null>(dadosIniciais.cupom || null)
  const [cupomTxt, setCupomTxt] = useState(dadosIniciais.cupom?.codigo || '')
  const [cupomMexido, setCupomMexido] = useState(false)
  const [validandoCupom, setValidandoCupom] = useState(false)

  const freteNum = Number(String(frete).replace(/\./g, '').replace(',', '.')) || 0
  const calculo = useMemo(() => calcularVendaDireta({ itens, frete: freteNum, cupom }, params), [itens, freteNum, cupom, params])
  const travaCupom = erroTravaCupom(calculo, params)

  async function aplicarCupom() {
    setErro(null); setMsg(null)
    setValidandoCupom(true)
    try {
      const r = await validarCupomVendaDiretaAction(projeto.id, cupomTxt)
      if ('erro' in r) { setErro(r.erro); return }
      setCupom(r.cupom); setCupomTxt(r.cupom.codigo); setCupomMexido(true)
      setMsg(`Cupom ${r.cupom.codigo} aplicado — salve pra gravar na proposta`)
    } finally { setValidandoCupom(false) }
  }
  function removerCupom() {
    setCupom(null); setCupomTxt(''); setCupomMexido(true); setMsg(null)
  }

  // Filtros iguais ao /admin/catalogo: categoria (com contagem) → subcategoria, A→Z
  const categorias = useMemo(() => {
    const cont = new Map<string, number>()
    for (const p of catalogo) if (p.categoria) cont.set(p.categoria, (cont.get(p.categoria) || 0) + 1)
    return Array.from(cont.entries())
      .map(([c, n]) => ({ valor: c, rotulo: `${rotuloCategoria(c)} · ${n}` }))
      .sort((a, b) => semEmoji(a.rotulo).localeCompare(semEmoji(b.rotulo), 'pt-BR'))
  }, [catalogo])
  const subcategorias = useMemo(() => {
    if (!filtroCat) return []
    const cont = new Map<string, number>()
    for (const p of catalogo) if (p.categoria === filtroCat && p.subcategoria) cont.set(p.subcategoria, (cont.get(p.subcategoria) || 0) + 1)
    return Array.from(cont.entries())
      .map(([s, n]) => ({ valor: s, rotulo: `${rotuloSubcategoria(s)} · ${n}` }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  }, [catalogo, filtroCat])

  const filtrando = busca.trim().length >= 2 || !!filtroCat
  const resultados = useMemo(() => {
    if (!filtrando) return []
    const partes = normalizar(busca.trim()).split(/\s+/).filter((x) => x.length > 0)
    return catalogo.filter((p) => {
      if (filtroCat && p.categoria !== filtroCat) return false
      if (filtroSub && p.subcategoria !== filtroSub) return false
      if (!partes.length) return true
      const alvo = normalizar([
        p.modelo, p.fabricante, p.descricao, p.detalhe, p.categoria, rotuloCategoria(p.categoria),
        p.subcategoria, rotuloSubcategoria(p.subcategoria),
      ].filter(Boolean).join(' '))
      return partes.every((x) => alvo.includes(x))
    })
  }, [busca, filtroCat, filtroSub, catalogo, filtrando])

  function adicionar(p: ProdutoCatalogoVD) {
    setItens((atual) => {
      const i = atual.findIndex((x) => x.produto_id === p.id)
      if (i >= 0) return atual.map((x, j) => (j === i ? { ...x, qtd: x.qtd + 1 } : x))
      return [...atual, {
        produto_id: p.id, modelo: p.modelo, fabricante: p.fabricante, descricao: p.descricao,
        categoria: p.categoria, qtd: 1, preco_tabela: p.preco_tabela,
        ...(p.sem_preco ? { preco_manual: true } : {}),
      }]
    })
    setMsg(null)
  }

  function mudarPrecoManual(idx: number, produtoId: string | null, txt: string) {
    const limpo = txt.replace(/[^\d.,]/g, '')
    if (produtoId) setPrecosTxt((m) => ({ ...m, [produtoId]: limpo }))
    setItens((atual) => atual.map((x, j) => (j === idx ? { ...x, preco_tabela: lerValorBR(limpo) } : x)))
  }
  function mudarBasePreco(idx: number, base: 'tabela' | 'custo' | '') {
    setItens((atual) => atual.map((x, j) => (j === idx ? { ...x, base_preco: base || undefined } : x)))
  }
  const primeiraPendencia = () => itens.map((i) => pendenciaPreco(i, ehAdmin)).find(Boolean) || travaCupom || null

  function mudarQtd(idx: number, qtd: number) {
    setItens((atual) => atual.map((x, j) => (j === idx ? { ...x, qtd: Math.max(0, Math.round(qtd || 0)) } : x)))
  }

  function salvarDados() {
    setErro(null)
    const invalido = validarDadosVendaDireta(dados)
    if (invalido) { setErro(invalido); return }
    startTransition(async () => {
      const r = await salvarDadosVendaDiretaAction(projeto.id, dados)
      if ('erro' in r) setErro(r.erro)
      else { setEditandoDados(false); router.refresh() }
    })
  }

  async function salvarEquipamentos(): Promise<boolean> {
    // cupom: só manda quando o admin mexeu (undefined = mantém o salvo)
    const r = await salvarEquipamentosVendaDiretaAction(
      projeto.id, itens.filter((i) => i.qtd > 0), freteNum,
      ehAdmin && cupomMexido ? (cupom?.codigo || '') : undefined,
    )
    if ('erro' in r) { setErro(r.erro); return false }
    setCupomMexido(false)
    return true
  }

  function salvar() {
    setErro(null); setMsg(null)
    const pend = primeiraPendencia()
    if (pend) { setErro(pend); return }
    startTransition(async () => {
      if (await salvarEquipamentos()) { setMsg('✓ Equipamentos e frete salvos'); router.refresh() }
    })
  }

  async function gerarPdf() {
    setErro(null); setMsg(null)
    const invalido = validarDadosVendaDireta(dados)
    if (invalido || editandoDados) { setErro(invalido || 'Salve os dados do cliente antes de gerar o PDF'); return }
    if (calculo.qtd_itens === 0) { setErro('Adicione pelo menos um equipamento'); return }
    const pend = primeiraPendencia()
    if (pend) { setErro(pend); return }
    setGerando(true)
    try {
      if (!(await salvarEquipamentos())) return
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const paginas = Array.from(templateRef.current?.querySelectorAll('section') || [])
      for (let i = 0; i < paginas.length; i++) {
        const canvas = await html2canvas(paginas[i] as HTMLElement, {
          scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: '#050B16',
        })
        if (i > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
      }
      pdf.save(nomeArquivoPdf)

      const supabase = createClient()
      const caminho = `${projeto.id}/equipamentos-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from(BUCKET_PROPOSTAS)
        .upload(caminho, pdf.output('blob'), { contentType: 'application/pdf', upsert: false })
      if (upErr) throw upErr
      const url = supabase.storage.from(BUCKET_PROPOSTAS).getPublicUrl(caminho).data.publicUrl
      const r = await registrarPdfVendaDiretaAction(projeto.id, url)
      if ('erro' in r) throw new Error(r.erro)
      setUrlPdf(url)
      setMsg('✓ PDF gerado e salvo no histórico do projeto')
      router.refresh()
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gerar o PDF')
    } finally {
      setGerando(false)
    }
  }

  // Kalebe 2026-09-29: proposta vai pelo canal Spin (inbox), não pelo wa.me
  const nomeArquivoPdf = `PROPOSTA_EQUIPAMENTOS_${(dados.nf.nome || 'CLIENTE').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '')}.pdf`
  const legendaWhatsApp = `Olá ${dados.nf.nome.split(' ')[0]}! Segue a proposta dos equipamentos que você solicitou à Spin Solar.\n\nQualquer dúvida estou à disposição.`

  const entrega = enderecoEntrega(dados)
  const dadosPdf: ItemDadosVendaDireta = {
    ...dadosIniciais, ...dados, itens: itens.filter((i) => i.qtd > 0), frete: calculo.frete, cupom,
  }

  return (
    <div className="space-y-6">
      {/* 1. Dados do cliente (NF + entrega) */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-white">1. Dados para NF e entrega</h2>
          {!editandoDados && (
            <button type="button" onClick={() => setEditandoDados(true)} className="text-xs text-sol hover:underline">✏ Editar</button>
          )}
        </div>
        {editandoDados ? (
          <div className="space-y-4">
            <FormDadosVendaDireta valor={dados} onChange={setDados} />
            <button type="button" onClick={salvarDados} disabled={pending}
              className="px-5 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40">
              {pending ? '⏳ Salvando…' : 'Salvar dados'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-white font-bold">{dados.nf.nome}</p>
              <p className="text-white/60">{formatarCpfCnpj(dados.nf.documento)}{dados.nf.ie ? ` · IE ${dados.nf.ie}` : ''}</p>
              <p className="text-white/60">{dados.nf.email} · {dados.nf.telefone}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-white/40">Entrega</p>
              <p className="text-white/80">
                {entrega.rua}, {entrega.numero}{entrega.complemento ? ` — ${entrega.complemento}` : ''} · {entrega.bairro}
              </p>
              <p className="text-white/60">{entrega.cidade}/{entrega.uf} · CEP {entrega.cep}{dados.entrega.recebedor ? ` · recebe: ${dados.entrega.recebedor}` : ''}</p>
            </div>
          </div>
        )}
      </section>

      {/* 2. Equipamentos */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">2. Equipamentos (catálogo)</h2>
        {/* Kalebe 2026-09-29: filtros iguais ao catálogo + busca */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_240px] gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por modelo, fabricante ou tipo (ex.: SIW300H, placa 620, recarga, estrutura)…"
            className={inputCls}
          />
          <select value={filtroCat} onChange={(e) => { setFiltroCat(e.target.value); setFiltroSub('') }} className={inputCls}>
            <option value="" className="bg-noite">Todas as categorias · {catalogo.length}</option>
            {categorias.map((c) => <option key={c.valor} value={c.valor} className="bg-noite">{c.rotulo}</option>)}
          </select>
          <select value={filtroSub} onChange={(e) => setFiltroSub(e.target.value)} disabled={subcategorias.length < 2}
            className={`${inputCls} disabled:opacity-40`}>
            <option value="" className="bg-noite">{filtroCat ? 'Todas as subcategorias' : 'Subcategoria (escolha a categoria)'}</option>
            {subcategorias.map((s) => <option key={s.valor} value={s.valor} className="bg-noite">{s.rotulo}</option>)}
          </select>
        </div>

        {filtrando && (
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] text-[11px] text-white/50">
              <span>{resultados.length} item(ns){resultados.length > 100 ? ' — mostrando 100, refine a busca' : ''}</span>
              <button type="button" onClick={() => { setBusca(''); setFiltroCat(''); setFiltroSub('') }} className="hover:text-white">limpar filtros ✕</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {resultados.length === 0 && <p className="px-3 py-4 text-sm text-white/40 text-center">Nada encontrado com esses filtros.</p>}
              {resultados.slice(0, 100).map((p) => {
                const noCarrinho = itens.find((x) => x.produto_id === p.id)?.qtd || 0
                return (
                  <button key={p.id} type="button" onClick={() => adicionar(p)}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-3 border-b border-white/5">
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{[p.fabricante, p.modelo].filter(Boolean).join(' · ')}</span>
                      <span className="block text-[11px] text-white/45 truncate">
                        {rotuloCategoria(p.categoria)}{p.subcategoria ? ` · ${rotuloSubcategoria(p.subcategoria)}` : ''}
                        {p.detalhe && p.detalhe !== p.modelo ? ` · ${p.detalhe}` : ''}
                      </span>
                    </span>
                    <span className="text-xs shrink-0 flex items-center gap-2">
                      {p.sem_preco
                        ? <span className="px-1.5 py-0.5 rounded bg-sol/10 border border-sol/30 text-sol text-[10px]">sem preço na planilha</span>
                        : ehAdmin && <span className="text-white/50">tabela {brl(p.preco_tabela)}</span>}
                      {noCarrinho > 0 && <span className="text-verde text-[10px]">✓ {noCarrinho}</span>}
                      <span className="text-sol text-base">＋</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {itens.length === 0 ? (
          <p className="text-sm text-white/40 py-4 text-center border border-dashed border-white/10 rounded-lg">
            Busque e adicione os equipamentos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10 text-[10px] uppercase text-white/50 font-bold">
                  <th className="pb-2 pr-3">Equipamento</th>
                  <th className="pb-2 pr-3 w-28">Qtd</th>
                  {ehAdmin && <th className="pb-2 pr-3 text-right">Preço un.</th>}
                  {ehAdmin && <th className="pb-2 pr-3 text-right">Custo Spin</th>}
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {itens.map((it, idx) => (
                  <tr key={`${it.produto_id}-${idx}`} className="border-b border-white/5">
                    <td className="py-2 pr-3">
                      <span className="text-white">{[it.fabricante, it.modelo].filter(Boolean).join(' · ')}</span>
                      <span className="block text-[11px] text-white/45">{rotuloCategoria(it.categoria)}</span>
                      {it.preco_manual && !ehAdmin && (
                        <span className={`block text-[10px] ${it.preco_tabela > 0 ? 'text-white/45' : 'text-sol'}`}>
                          {it.preco_tabela > 0 ? 'preço informado pelo admin' : '⏳ sem preço na planilha — o admin precisa informar'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <input type="number" min={0} value={it.qtd} onChange={(e) => mudarQtd(idx, Number(e.target.value))}
                        className={`${inputCls} py-1`} />
                    </td>
                    {ehAdmin && (
                      <td className="py-2 pr-3 text-right text-white/70">
                        {it.preco_manual ? (
                          <div className="flex flex-col items-end gap-1 min-w-[190px]">
                            <input
                              inputMode="decimal"
                              value={precosTxt[it.produto_id || ''] ?? ''}
                              onChange={(e) => mudarPrecoManual(idx, it.produto_id, e.target.value)}
                              placeholder="preço R$"
                              className={`${inputCls} py-1 text-right font-mono ${it.preco_tabela > 0 ? '' : 'border-sol/60'}`}
                            />
                            <select value={it.base_preco || ''} onChange={(e) => mudarBasePreco(idx, e.target.value as any)}
                              className={`${inputCls} py-1 text-xs ${it.base_preco ? '' : 'border-sol/60'}`}>
                              <option value="" className="bg-noite">Esse valor é…</option>
                              <option value="custo" className="bg-noite">Custo Spin (sem fator)</option>
                              <option value="tabela" className="bg-noite">Tabela WEG (× fator {fmtNum(calculo.fator_aplicado, 4)})</option>
                            </select>
                          </div>
                        ) : brl(it.preco_tabela)}
                      </td>
                    )}
                    {ehAdmin && <td className="py-2 pr-3 text-right text-white/70">{brl(custoDoItem(it, calculo.fator_aplicado))}</td>}
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => setItens((a) => a.filter((_, j) => j !== idx))}
                        className="text-coral/70 hover:text-coral text-xs" title="Remover">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="max-w-xs">
          <label className="block">
            <span className="block text-[11px] font-bold text-white/60 mb-1">Frete até {entrega.cidade || 'o destino'} (R$)</span>
            <input value={frete} onChange={(e) => setFrete(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0,00" className={inputCls} />
            <span className="block text-[10px] text-white/35 mt-0.5">Valor cotado — entra no total e na base de margem, comissão e imposto.</span>
          </label>
        </div>
      </section>

      {/* 3. Valores */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">3. Valor da proposta</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-sol/10 border border-sol/40">
            <p className="text-[10px] uppercase tracking-wider font-bold text-sol">PIX ou boleto à vista</p>
            {calculo.desconto_cupom > 0 && (
              <p className="text-xs text-white/45 line-through mt-1">{brl(calculo.pv_cheio)}</p>
            )}
            <p className="text-2xl font-black text-white mt-0.5">{brl(calculo.pagamento.a_vista)}</p>
            {calculo.cupom && calculo.desconto_cupom > 0 && (
              <p className="text-[11px] text-verde">🎟 {calculo.cupom.codigo}: −{brl(calculo.desconto_cupom)}</p>
            )}
          </div>
          <div className="p-4 rounded-lg bg-white/[0.03] border border-white/10">
            <p className="text-[10px] uppercase tracking-wider font-bold text-white/50">Cartão (taxa do cliente)</p>
            <p className="text-lg font-bold text-white mt-1">
              {fmtNum(calculo.pagamento.cartao_parcelas, 0)}x de {brl(calculo.pagamento.cartao_parcela)}
            </p>
            <p className="text-[11px] text-white/45">total {brl(calculo.pagamento.cartao_total)} · taxa {fmtNum(calculo.pagamento.cartao_taxa_pct, 2)}%</p>
          </div>
          <div className="p-4 rounded-lg bg-white/[0.03] border border-white/10">
            <p className="text-[10px] uppercase tracking-wider font-bold text-white/50">Equipamentos</p>
            <p className="text-lg font-bold text-white mt-1">{fmtNum(calculo.qtd_itens, 0)} unidades</p>
            <p className="text-[11px] text-white/45">frete {calculo.frete > 0 ? brl(calculo.frete) : 'não informado'}</p>
          </div>
        </div>

        {/* Cupom de desconto — só o admin aplica (Kalebe 2026-09-30) */}
        {ehAdmin ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="block text-[11px] font-bold text-white/60 mb-1">🎟 Cupom de desconto</span>
              <input value={cupomTxt} onChange={(e) => setCupomTxt(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarCupom() } }}
                placeholder="CÓDIGO" disabled={!!cupom}
                className={`${inputCls} w-48 font-mono uppercase disabled:opacity-60`} />
            </label>
            {cupom ? (
              <button type="button" onClick={removerCupom} className="px-3 py-2 bg-white/5 border border-white/15 text-white/70 text-xs rounded-lg hover:bg-white/10">
                ✕ Remover cupom
              </button>
            ) : (
              <button type="button" onClick={aplicarCupom} disabled={validandoCupom || cupomTxt.trim().length < 3}
                className="px-3 py-2 bg-verde/15 border border-verde/40 text-verde text-xs font-bold rounded-lg disabled:opacity-40">
                {validandoCupom ? 'Conferindo…' : 'Aplicar'}
              </button>
            )}
            {cupom && (
              <span className="text-xs text-white/60 pb-2">
                {cupom.tipo === 'percentual' ? `${fmtNum(cupom.valor, 2)}% de desconto` : `${brl(cupom.valor)} de desconto`}
                {' '}· margem após cupom <strong className={travaCupom ? 'text-coral' : 'text-verde'}>{fmtNum(calculo.margem_efetiva_pct, 2)}%</strong>
              </span>
            )}
          </div>
        ) : calculo.cupom && calculo.desconto_cupom > 0 ? (
          <p className="text-xs text-verde">🎟 Cupom {calculo.cupom.codigo} aplicado pelo admin: −{brl(calculo.desconto_cupom)}</p>
        ) : null}
        {travaCupom && <p className="text-xs text-coral">⚠ {travaCupom}</p>}

        {ehAdmin && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-white/60 hover:text-white/80">🔒 Composição interna (só admin)</summary>
            <table className="mt-3 w-full max-w-lg text-sm">
              <tbody className="[&_td]:py-1">
                <tr><td className="text-white/60">Planilha WEG (tabela)</td><td className="text-right text-white/80">{brl(calculo.subtotal_tabela)}</td></tr>
                <tr><td className="text-white/60">× fator {fmtNum(calculo.fator_aplicado, 4)}</td><td className="text-right text-white/80">{brl(calculo.subtotal_tabela * calculo.fator_aplicado)}</td></tr>
                {calculo.custo_direto > 0 && (
                  <tr><td className="text-white/60">+ itens com preço de custo (sem fator)</td><td className="text-right text-white/80">{brl(calculo.custo_direto)}</td></tr>
                )}
                <tr><td className="text-white/60">= custo dos equipamentos</td><td className="text-right text-white/80">{brl(calculo.custo_equipamentos)}</td></tr>
                <tr><td className="text-white/60">+ frete</td><td className="text-right text-white/80">{brl(calculo.frete)}</td></tr>
                <tr className="border-t border-white/10"><td className="text-white/80 font-bold">Base de custo</td><td className="text-right text-white font-bold">{brl(calculo.base_custo)}</td></tr>
                {calculo.desconto_cupom > 0 && (
                  <>
                    <tr><td className="text-white/60">Preço cheio (margem-alvo {fmtNum(calculo.margem_pct, 2)}%)</td><td className="text-right text-white/80">{brl(calculo.pv_cheio)}</td></tr>
                    <tr><td className="text-white/60">− cupom {calculo.cupom?.codigo}</td><td className="text-right text-coral">−{brl(calculo.desconto_cupom)}</td></tr>
                  </>
                )}
                <tr><td className="text-white/60">Margem Spin {fmtNum(calculo.margem_efetiva_pct, 2)}%{calculo.desconto_cupom > 0 ? ' (após cupom)' : ''}</td><td className={`text-right ${calculo.margem >= 0 ? 'text-verde' : 'text-coral'}`}>{brl(calculo.margem)}</td></tr>
                <tr><td className="text-white/60">Comissão vendedor {fmtNum(calculo.comissao_pct, 2)}%</td><td className="text-right text-white/80">{brl(calculo.comissao)}</td></tr>
                <tr><td className="text-white/60">Imposto {fmtNum(calculo.imposto_pct, 2)}% sobre o total</td><td className="text-right text-white/80">{brl(calculo.imposto)}</td></tr>
                <tr className="border-t border-white/10"><td className="text-sol font-bold">Preço de venda{calculo.desconto_cupom > 0 ? ' (com cupom)' : ''}</td><td className="text-right text-sol font-bold">{brl(calculo.pv_total)}</td></tr>
              </tbody>
            </table>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button type="button" onClick={salvar} disabled={pending || gerando}
            className="px-5 py-3 bg-white/10 border border-white/20 text-white font-bold text-sm rounded-lg disabled:opacity-40">
            {pending ? '⏳ Salvando…' : '💾 Salvar'}
          </button>
          <button type="button" onClick={gerarPdf} disabled={pending || gerando}
            className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40">
            {gerando ? '⏳ Gerando PDF…' : urlPdf ? '📄 Gerar nova versão do PDF' : '📄 Gerar PDF da proposta'}
          </button>
          {urlPdf && (
            <>
              <a href={urlPdf} target="_blank" rel="noreferrer"
                className="px-4 py-3 bg-white/5 border border-white/15 text-white font-bold text-sm rounded-lg hover:bg-white/10">
                🔗 Ver último PDF
              </a>
              <BotaoEnviarPropostaCanal
                projetoId={projeto.id}
                urlPdf={urlPdf}
                nomeArquivo={nomeArquivoPdf}
                legenda={legendaWhatsApp}
                rotulo="💬 Enviar por WhatsApp"
              />
            </>
          )}
        </div>
        {msg && <p className="text-sm text-verde">{msg}</p>}
        {erro && <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-sm text-coral">❌ {erro}</div>}
      </section>

      {/* Modelo do PDF: fora da tela mas com layout (html2canvas não
          desenha elemento escondido). A prévia visível é uma cópia. */}
      {calculo.qtd_itens > 0 && !validarDadosVendaDireta(dados) && (
        <>
          <div aria-hidden className="tema-fixo" style={{ position: 'fixed', left: -10000, top: 0, width: 794, pointerEvents: 'none' }}>
            <PropostaVendaDiretaPDF ref={templateRef} projeto={projeto} dados={dadosPdf} calculo={calculo} configEmpresa={configEmpresa} />
          </div>
          <details className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
            <summary className="cursor-pointer text-sm text-white/70">👁 Prévia do PDF</summary>
            <div className="mt-3 overflow-auto">
              <div style={{ transform: 'scale(0.75)', transformOrigin: 'top left', width: 794 }}>
                <PropostaVendaDiretaPDF projeto={projeto} dados={dadosPdf} calculo={calculo} configEmpresa={configEmpresa} />
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
