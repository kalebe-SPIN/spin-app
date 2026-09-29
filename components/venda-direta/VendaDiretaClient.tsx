'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtNum, formatarCpfCnpj } from '@/lib/formatters'
import type { ParametrosVigentes } from '@/lib/precificacao/calcular'
import { calcularVendaDireta, type ItemVendaDireta } from '@/lib/precificacao/venda-direta'
import { validarDadosVendaDireta, enderecoEntrega, type DadosVendaDireta, type ItemDadosVendaDireta } from '@/lib/venda-direta/tipos'
import type { ProdutoCatalogoVD } from '@/lib/venda-direta/preco'
import { FormDadosVendaDireta, inputCls } from './FormDadosVendaDireta'
import { PropostaVendaDiretaPDF } from './PropostaVendaDiretaPDF'
import { BotaoEnviarPropostaCanal } from '@/components/proposta/BotaoEnviarPropostaCanal'
import {
  salvarDadosVendaDiretaAction,
  salvarEquipamentosVendaDiretaAction,
  registrarPdfVendaDiretaAction,
} from '@/app/venda-direta/actions'

const BUCKET_PROPOSTAS = 'propostas-pdf'
const brl = (v: number) => `R$ ${fmtNum(v, 2)}`
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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
  const [urlPdf, setUrlPdf] = useState<string | null>(dadosIniciais.url_pdf || projeto.url_pdf_proposta || null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [pending, startTransition] = useTransition()
  const templateRef = useRef<HTMLDivElement>(null)

  const freteNum = Number(String(frete).replace(/\./g, '').replace(',', '.')) || 0
  const calculo = useMemo(() => calcularVendaDireta({ itens, frete: freteNum }, params), [itens, freteNum, params])

  const resultados = useMemo(() => {
    const t = normalizar(busca.trim())
    if (t.length < 2) return []
    const partes = t.split(/\s+/)
    return catalogo
      .filter((p) => {
        const alvo = normalizar([p.modelo, p.fabricante, p.descricao, p.categoria].filter(Boolean).join(' '))
        return partes.every((x) => alvo.includes(x))
      })
      .slice(0, 30)
  }, [busca, catalogo])

  function adicionar(p: ProdutoCatalogoVD) {
    setItens((atual) => {
      const i = atual.findIndex((x) => x.produto_id === p.id)
      if (i >= 0) return atual.map((x, j) => (j === i ? { ...x, qtd: x.qtd + 1 } : x))
      return [...atual, {
        produto_id: p.id, modelo: p.modelo, fabricante: p.fabricante, descricao: p.descricao,
        categoria: p.categoria, qtd: 1, preco_tabela: p.preco_tabela,
      }]
    })
    setMsg(null)
  }

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
    const r = await salvarEquipamentosVendaDiretaAction(projeto.id, itens.filter((i) => i.qtd > 0), freteNum)
    if ('erro' in r) { setErro(r.erro); return false }
    return true
  }

  function salvar() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      if (await salvarEquipamentos()) { setMsg('✓ Equipamentos e frete salvos'); router.refresh() }
    })
  }

  async function gerarPdf() {
    setErro(null); setMsg(null)
    const invalido = validarDadosVendaDireta(dados)
    if (invalido || editandoDados) { setErro(invalido || 'Salve os dados do cliente antes de gerar o PDF'); return }
    if (calculo.qtd_itens === 0) { setErro('Adicione pelo menos um equipamento'); return }
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
    ...dadosIniciais, ...dados, itens: itens.filter((i) => i.qtd > 0), frete: calculo.frete,
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
        <h2 className="text-lg font-bold text-white">2. Equipamentos (planilha WEG)</h2>
        <div className="relative">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por modelo, fabricante ou tipo (ex.: SIW300H, placa 620, estrutura)…"
            className={inputCls}
          />
          {resultados.length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto bg-noite border border-white/15 rounded-lg shadow-xl">
              {resultados.map((p) => (
                <button key={p.id} type="button" onClick={() => adicionar(p)}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-3 border-b border-white/5">
                  <span className="min-w-0">
                    <span className="block text-sm text-white truncate">{[p.fabricante, p.modelo].filter(Boolean).join(' · ')}</span>
                    <span className="block text-[11px] text-white/45 truncate">{p.categoria}{p.descricao && p.descricao !== p.modelo ? ` · ${p.descricao}` : ''}</span>
                  </span>
                  <span className="text-xs text-sol shrink-0">
                    {ehAdmin ? `tabela ${brl(p.preco_tabela)}` : ''} ＋
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

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
                  {ehAdmin && <th className="pb-2 pr-3 text-right">Tabela un.</th>}
                  {ehAdmin && <th className="pb-2 pr-3 text-right">Custo (× fator)</th>}
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {itens.map((it, idx) => (
                  <tr key={`${it.produto_id}-${idx}`} className="border-b border-white/5">
                    <td className="py-2 pr-3">
                      <span className="text-white">{[it.fabricante, it.modelo].filter(Boolean).join(' · ')}</span>
                      <span className="block text-[11px] text-white/45">{it.categoria}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <input type="number" min={0} value={it.qtd} onChange={(e) => mudarQtd(idx, Number(e.target.value))}
                        className={`${inputCls} py-1`} />
                    </td>
                    {ehAdmin && <td className="py-2 pr-3 text-right text-white/70">{brl(it.preco_tabela)}</td>}
                    {ehAdmin && <td className="py-2 pr-3 text-right text-white/70">{brl(it.preco_tabela * it.qtd * calculo.fator_aplicado)}</td>}
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
            <p className="text-2xl font-black text-white mt-1">{brl(calculo.pagamento.a_vista)}</p>
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

        {ehAdmin && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-white/60 hover:text-white/80">🔒 Composição interna (só admin)</summary>
            <table className="mt-3 w-full max-w-lg text-sm">
              <tbody className="[&_td]:py-1">
                <tr><td className="text-white/60">Planilha WEG (tabela)</td><td className="text-right text-white/80">{brl(calculo.subtotal_tabela)}</td></tr>
                <tr><td className="text-white/60">× fator {fmtNum(calculo.fator_aplicado, 4)} = custo dos equipamentos</td><td className="text-right text-white/80">{brl(calculo.custo_equipamentos)}</td></tr>
                <tr><td className="text-white/60">+ frete</td><td className="text-right text-white/80">{brl(calculo.frete)}</td></tr>
                <tr className="border-t border-white/10"><td className="text-white/80 font-bold">Base de custo</td><td className="text-right text-white font-bold">{brl(calculo.base_custo)}</td></tr>
                <tr><td className="text-white/60">Margem Spin {fmtNum(calculo.margem_pct, 2)}%</td><td className="text-right text-verde">{brl(calculo.margem)}</td></tr>
                <tr><td className="text-white/60">Comissão vendedor {fmtNum(calculo.comissao_pct, 2)}%</td><td className="text-right text-white/80">{brl(calculo.comissao)}</td></tr>
                <tr><td className="text-white/60">Imposto {fmtNum(calculo.imposto_pct, 2)}% sobre o total</td><td className="text-right text-white/80">{brl(calculo.imposto)}</td></tr>
                <tr className="border-t border-white/10"><td className="text-sol font-bold">Preço de venda</td><td className="text-right text-sol font-bold">{brl(calculo.pv_total)}</td></tr>
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
          <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 794, pointerEvents: 'none' }}>
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
