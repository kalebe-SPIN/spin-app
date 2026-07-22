'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { getInfoTipo, type TipoItem } from '@/lib/tipos-projeto'

type Item = {
  id: string
  tipo: string
  titulo: string | null
  valor_estimado: number | null
  dados: any
}

type Props = {
  projeto: any
  itens: Item[]
  configEmpresa: any
}

type CondicaoPagamento = {
  id: string
  label: string
  desconto_perc: number    // desconto sobre o total (%)
  parcelas: number
  descricao: string
}

const CONDICOES_DEFAULT: CondicaoPagamento[] = [
  { id: 'vista_pix', label: 'À vista (PIX/transferência)', desconto_perc: 5, parcelas: 1, descricao: 'Pagamento único com 5% de desconto.' },
  { id: 'entrada_saldo', label: 'Entrada + saldo', desconto_perc: 3, parcelas: 2, descricao: '50% na aprovação + 50% no início do serviço.' },
  { id: '3x_cartao', label: '3× no cartão', desconto_perc: 0, parcelas: 3, descricao: 'Sem juros no cartão de crédito.' },
  { id: '6x_cartao', label: '6× no cartão', desconto_perc: -3, parcelas: 6, descricao: 'Acréscimo de 3% de taxa. Sem entrada.' },
  { id: '12x_cartao', label: '12× no cartão', desconto_perc: -7, parcelas: 12, descricao: 'Acréscimo de 7% de taxa. Sem entrada.' },
]

export function OrcamentoServicosClient({ projeto, itens, configEmpresa }: Props) {
  const [condicoesSelecionadas, setCondicoes] = useState<string[]>(['vista_pix', 'entrada_saldo', '3x_cartao'])
  const [observacoes, setObservacoes] = useState('')
  const [validadeDias, setValidadeDias] = useState(15)
  const [descontoTipo, setDescontoTipo] = useState<'reais' | 'percentual'>('reais')
  const [descontoValor, setDescontoValor] = useState<number>(0)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [erroPdf, setErroPdf] = useState<string | null>(null)

  const subtotal = useMemo(
    () => itens.reduce((s, i) => s + (parseFloat(String(i.valor_estimado)) || 0), 0),
    [itens],
  )

  const descontoAplicado = useMemo(() => {
    if (descontoValor <= 0) return 0
    if (descontoTipo === 'percentual') {
      return Math.min(subtotal * (descontoValor / 100), subtotal)
    }
    return Math.min(descontoValor, subtotal)
  }, [descontoTipo, descontoValor, subtotal])

  const totalComDesconto = subtotal - descontoAplicado

  function toggleCondicao(id: string) {
    setCondicoes((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  const dataProposta = new Date().toLocaleDateString('pt-BR')
  const dataValidade = new Date(Date.now() + validadeDias * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')

  const pdfRef = useRef<HTMLDivElement>(null)

  async function gerarPdf() {
    setErroPdf(null)
    setGerandoPdf(true)
    try {
      const el = pdfRef.current
      if (!el) throw new Error('Template não montado')

      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).jsPDF

      // Torna visível temporariamente pra renderizar
      el.style.display = 'block'
      const canvas = await html2canvas(el, {
        backgroundColor: '#FFFFFF',
        scale: 2,
        logging: false,
        useCORS: true,
      })
      el.style.display = 'none'

      const imgData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      // A4 portrait: 210 x 297 mm
      const w = 210
      const h = (canvas.height * w) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, w, h > 297 ? 297 : h, undefined, 'FAST')
      pdf.save(`proposta-${projeto.codigo || 'servico'}-${Date.now()}.pdf`)
    } catch (err: any) {
      setErroPdf(err?.message || 'Falha ao gerar PDF')
    } finally {
      setGerandoPdf(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna esquerda: itens + condições (2/3) */}
      <div className="lg:col-span-2 space-y-6">
        {/* Header explicativo */}
        <div className="bg-verde/10 border border-verde/30 rounded-xl p-4">
          <p className="text-xs text-white/80">
            ✅ <strong>Proposta de serviço</strong> — sem componentes fotovoltaicos.
            Todos os itens já estão precificados com base nos parâmetros configurados
            em <code className="text-sol">/admin/precificacao/servicos</code>.
          </p>
        </div>

        {/* Lista de módulos/itens */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-4">
            📦 Módulos da proposta ({itens.length})
          </p>
          <div className="space-y-2">
            {itens.map((it) => {
              const info = getInfoTipo(it.tipo as TipoItem)
              const valor = parseFloat(String(it.valor_estimado)) || 0
              return (
                <div key={it.id} className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl shrink-0">{info?.emoji || '📋'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white">
                          {it.titulo || info?.label || it.tipo}
                        </p>
                        {info?.descricao && (
                          <p className="text-[10px] text-white/50 mt-0.5">{info.descricao}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-lg font-bold text-verde shrink-0">
                      {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Desconto */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-1">
            🎯 Desconto (opcional)
          </p>
          <p className="text-[10px] text-white/50 mb-4">
            Aplicado sobre o subtotal ANTES das condições de pagamento.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Tipo</label>
              <div className="flex bg-noite border border-white/15 rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDescontoTipo('reais')}
                  className={`flex-1 py-1.5 text-xs font-bold transition ${
                    descontoTipo === 'reais' ? 'bg-sol text-noite' : 'text-white/60 hover:text-white'
                  }`}
                >
                  R$
                </button>
                <button
                  type="button"
                  onClick={() => setDescontoTipo('percentual')}
                  className={`flex-1 py-1.5 text-xs font-bold transition ${
                    descontoTipo === 'percentual' ? 'bg-sol text-noite' : 'text-white/60 hover:text-white'
                  }`}
                >
                  %
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">
                Valor {descontoTipo === 'percentual' ? '(%)' : '(R$)'}
              </label>
              <input
                type="number"
                min={0}
                step={descontoTipo === 'percentual' ? 0.5 : 10}
                value={descontoValor}
                onChange={(e) => setDescontoValor(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Aplicado</label>
              <div className="px-2 py-1.5 bg-verde/10 border border-verde/30 rounded text-verde text-sm font-bold">
                - {descontoAplicado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
          </div>
        </section>

        {/* Condições de pagamento */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-1">
            💳 Condições de pagamento
          </p>
          <p className="text-[10px] text-white/50 mb-4">
            Marque quais aparecerão na proposta pro cliente escolher.
          </p>
          <div className="space-y-2">
            {CONDICOES_DEFAULT.map((c) => {
              const selecionado = condicoesSelecionadas.includes(c.id)
              // Aplica desconto manual primeiro, depois desconto da condicao
              const valorFinal = totalComDesconto * (1 - c.desconto_perc / 100)
              const valorParcela = valorFinal / c.parcelas

              return (
                <label
                  key={c.id}
                  className={`block p-3 rounded-lg border cursor-pointer transition ${
                    selecionado
                      ? 'bg-sol/10 border-sol/40'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => toggleCondicao(c.id)}
                      className="mt-1 w-4 h-4 accent-sol shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
                        <p className="text-sm font-bold text-white">{c.label}</p>
                        <div className="text-right">
                          <p className="text-sm font-bold text-verde">
                            {valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          {c.parcelas > 1 && (
                            <p className="text-[10px] text-white/60">
                              {c.parcelas}× de {valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-white/50">{c.descricao}</p>
                      {c.desconto_perc > 0 && (
                        <span className="inline-block text-[10px] font-bold text-verde bg-verde/10 border border-verde/30 rounded px-1.5 py-0.5 mt-1">
                          {c.desconto_perc}% OFF
                        </span>
                      )}
                      {c.desconto_perc < 0 && (
                        <span className="inline-block text-[10px] font-bold text-coral bg-coral/10 border border-coral/30 rounded px-1.5 py-0.5 mt-1">
                          +{-c.desconto_perc}% de acréscimo
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </section>

        {/* Observações + validade */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-4">
            📝 Detalhes da proposta
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Validade (dias)</label>
              <input
                type="number"
                min={1}
                value={validadeDias}
                onChange={(e) => setValidadeDias(parseInt(e.target.value) || 15)}
                className="w-32 px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
              />
              <p className="text-[10px] text-white/40 mt-1">
                Proposta válida até <strong>{dataValidade}</strong>
              </p>
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">Observações (opcional)</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Ex: prazo de execução, requisitos específicos, condições especiais..."
                className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Coluna direita: preview + acoes (1/3, sticky) */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <div className="bg-gradient-to-br from-verde/10 to-sol/5 border border-verde/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-bold text-verde mb-3">
            💰 Resumo da proposta
          </p>

          <div className="space-y-1 mb-3 text-xs text-white/70">
            <div className="flex justify-between">
              <span>Cliente</span>
              <span className="text-white font-bold truncate max-w-[60%]">{projeto.cliente_razao_social}</span>
            </div>
            <div className="flex justify-between">
              <span>Projeto</span>
              <span className="text-white font-mono">{projeto.codigo}</span>
            </div>
            <div className="flex justify-between">
              <span>Data</span>
              <span className="text-white">{dataProposta}</span>
            </div>
            <div className="flex justify-between">
              <span>Módulos</span>
              <span className="text-white">{itens.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Condições</span>
              <span className="text-white">{condicoesSelecionadas.length} formas</span>
            </div>
          </div>

          {/* Detalhamento com desconto se aplicavel */}
          {descontoAplicado > 0 && (
            <div className="mb-3 space-y-1 text-xs">
              <div className="flex justify-between text-white/60">
                <span>Subtotal</span>
                <span>{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
              <div className="flex justify-between text-verde">
                <span>Desconto</span>
                <span>- {descontoAplicado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
            </div>
          )}

          <div className="p-3 bg-verde/20 rounded-lg mb-3">
            <p className="text-[10px] uppercase text-noite/80 font-bold">
              Valor final {descontoAplicado > 0 ? '(com desconto)' : '(sem descontos)'}
            </p>
            <p className="text-2xl font-black text-noite">
              {totalComDesconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={gerarPdf}
              disabled={gerandoPdf || condicoesSelecionadas.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-sol text-noite font-bold text-sm rounded-lg hover:bg-sol/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {gerandoPdf ? '⏳ Gerando PDF...' : '📄 Baixar PDF da proposta'}
            </button>
            {condicoesSelecionadas.length === 0 && (
              <p className="text-[10px] text-coral text-center">
                Marque pelo menos 1 condição de pagamento
              </p>
            )}
            {erroPdf && (
              <p className="text-[10px] text-coral text-center">⚠️ {erroPdf}</p>
            )}
            <Link
              href={`/projetos/${projeto.id}`}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg hover:bg-white/10 transition"
            >
              ← Voltar ao projeto
            </Link>
          </div>
        </div>
      </div>

      {/* Template escondido usado pra renderizar o PDF */}
      <TemplatePdf
        pdfRef={pdfRef}
        projeto={projeto}
        configEmpresa={configEmpresa}
        itens={itens}
        subtotal={subtotal}
        descontoAplicado={descontoAplicado}
        totalComDesconto={totalComDesconto}
        condicoes={CONDICOES_DEFAULT.filter((c) => condicoesSelecionadas.includes(c.id))}
        observacoes={observacoes}
        dataProposta={dataProposta}
        dataValidade={dataValidade}
        validadeDias={validadeDias}
      />
    </div>
  )
}

/**
 * Template HTML A4 portrait renderizado escondido, usado pelo html2canvas
 * pra gerar o PDF. Ficar como componente separado deixa o layout do PDF
 * independente da tela de trabalho do consultor.
 */
function TemplatePdf({
  pdfRef, projeto, configEmpresa, itens, subtotal, descontoAplicado,
  totalComDesconto, condicoes, observacoes, dataProposta, dataValidade, validadeDias,
}: {
  pdfRef: React.RefObject<HTMLDivElement>
  projeto: any
  configEmpresa: any
  itens: Item[]
  subtotal: number
  descontoAplicado: number
  totalComDesconto: number
  condicoes: CondicaoPagamento[]
  observacoes: string
  dataProposta: string
  dataValidade: string
  validadeDias: number
}) {
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div
      ref={pdfRef}
      style={{
        display: 'none',
        position: 'fixed',
        left: '-9999px',
        top: 0,
        width: '794px',   // 210mm @ 96dpi
        minHeight: '1123px',
        padding: '40px',
        background: '#FFFFFF',
        color: '#111827',
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: '12px',
        lineHeight: 1.5,
      }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1a4f8b', paddingBottom: '16px', marginBottom: '20px' }}>
        <div>
          {/* Logo Spin desenhada */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', gap: '3px' }}>
              <div style={{ width: '6px', height: '30px', background: '#1a4f8b' }} />
              <div style={{ width: '6px', height: '30px', background: '#0e7490' }} />
              <div style={{ width: '6px', height: '30px', background: '#f4d000' }} />
              <div style={{ width: '6px', height: '30px', background: '#0f766e' }} />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#1a4f8b', letterSpacing: '-1px' }}>SPIN</div>
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280' }}>
            {configEmpresa?.razao_social || 'Spin Solar Energias Renováveis Ltda'}
          </div>
          {configEmpresa?.cnpj && (
            <div style={{ fontSize: '10px', color: '#6b7280' }}>CNPJ: {configEmpresa.cnpj}</div>
          )}
          {configEmpresa?.endereco && (
            <div style={{ fontSize: '10px', color: '#6b7280' }}>{configEmpresa.endereco}</div>
          )}
          {configEmpresa?.telefone && (
            <div style={{ fontSize: '10px', color: '#6b7280' }}>
              {configEmpresa.telefone} {configEmpresa.email ? `· ${configEmpresa.email}` : ''}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Proposta comercial</div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#1a4f8b' }}>
            {projeto.codigo || '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280' }}>Emitida em {dataProposta}</div>
          <div style={{ fontSize: '10px', color: '#b91c1c' }}>Válida até {dataValidade} ({validadeDias} dias)</div>
        </div>
      </div>

      {/* CLIENTE */}
      <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>
          Cliente
        </div>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{projeto.cliente_razao_social}</div>
        {projeto.cliente_cpf_cnpj && (
          <div style={{ fontSize: '11px', color: '#6b7280' }}>CPF/CNPJ: {projeto.cliente_cpf_cnpj}</div>
        )}
        {projeto.cliente_telefone && (
          <div style={{ fontSize: '11px', color: '#6b7280' }}>WhatsApp: {projeto.cliente_telefone}</div>
        )}
      </div>

      {/* MODULOS */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#1a4f8b', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '10px' }}>
          Escopo da proposta ({itens.length} módulo{itens.length > 1 ? 's' : ''})
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#1a4f8b', color: '#FFFFFF' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px' }}>Descrição</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', width: '140px' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, idx) => {
              const info = getInfoTipo(it.tipo as TipoItem)
              const valor = parseFloat(String(it.valor_estimado)) || 0
              return (
                <tr key={it.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#FFFFFF' : '#f9fafb' }}>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 'bold' }}>{it.titulo || info?.label || it.tipo}</div>
                    {info?.descricao && (
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{info.descricao}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 'bold' }}>
                    {brl(valor)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* TOTAIS */}
      <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#f8fafc', borderRadius: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#374151', marginBottom: '4px' }}>
          <span>Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        {descontoAplicado > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#0f766e', marginBottom: '4px' }}>
            <span>Desconto</span>
            <span>- {brl(descontoAplicado)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '6px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 900, color: '#1a4f8b' }}>
          <span>TOTAL</span>
          <span>{brl(totalComDesconto)}</span>
        </div>
      </div>

      {/* CONDICOES DE PAGAMENTO */}
      {condicoes.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: '#1a4f8b', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '10px' }}>
            Condições de pagamento
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #d1d5db' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '10px', color: '#6b7280', borderBottom: '1px solid #d1d5db' }}>Opção</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', color: '#6b7280', borderBottom: '1px solid #d1d5db' }}>Valor total</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', color: '#6b7280', borderBottom: '1px solid #d1d5db' }}>Parcela</th>
              </tr>
            </thead>
            <tbody>
              {condicoes.map((c) => {
                const valor = totalComDesconto * (1 - c.desconto_perc / 100)
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', fontSize: '11px' }}>
                      <div style={{ fontWeight: 'bold' }}>{c.label}</div>
                      <div style={{ fontSize: '9px', color: '#6b7280' }}>{c.descricao}</div>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: c.desconto_perc > 0 ? '#0f766e' : '#111827' }}>
                      {brl(valor)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '11px' }}>
                      {c.parcelas > 1
                        ? `${c.parcelas}× de ${brl(valor / c.parcelas)}`
                        : 'à vista'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* OBSERVACOES */}
      {observacoes && (
        <div style={{ marginBottom: '20px', padding: '10px 12px', background: '#fefce8', border: '1px solid #f4d000', borderRadius: '4px' }}>
          <div style={{ fontSize: '10px', color: '#a16207', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>
            Observações
          </div>
          <div style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{observacoes}</div>
        </div>
      )}

      {/* RODAPE */}
      <div style={{ marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #d1d5db', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280' }}>
        <div>
          <div style={{ fontWeight: 'bold', color: '#111827' }}>Responsável técnico</div>
          <div>{configEmpresa?.rt_nome || '—'}</div>
          <div>{configEmpresa?.rt_titulo || 'Eletrotécnico'} · Reg. {configEmpresa?.rt_crea || '—'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>Este documento é uma proposta comercial</div>
          <div>e não gera obrigação até assinatura de contrato.</div>
        </div>
      </div>
    </div>
  )
}
