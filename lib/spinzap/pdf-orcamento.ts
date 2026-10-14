import { jsPDF } from 'jspdf'

/**
 * PDF do orçamento resumido que a Laís envia (Kalebe 2026-10-10) — gerado no
 * servidor (a proposta completa só sai no navegador). Regras da casa:
 *   - bloco do cliente só com nome + CPF/CNPJ formatado
 *   - assinatura escaneada do Kalebe (configuracoes_empresa.rt_assinatura_url)
 *   - validade de 15 dias, como a proposta completa
 *   - números no padrão brasileiro
 */

export type DadosPdfOrcamento = {
  cliente_nome: string
  cliente_documento?: string | null
  cidade?: string | null
  kwp: number
  qtd_placas: number
  placa_modelo: string
  placa_wp: number
  inversor_modelo: string
  inversor_kw: number
  /** Quantidade de inversores (micro: vários) */
  inversor_qtd?: number
  /** Itens extras incluídos (só descrição e quantidade — preço só no total) */
  extras?: Array<{ descricao: string; qtd: number }>
  geracao_kwh_mes: number
  consumo_kwh_mes?: number | null
  pv_total: number
  formas_pagamento: {
    a_vista_pix: { valor: number; desconto_pct: number }
    parcelado_cartao: { parcelas: number; valor_parcela: number; valor_total: number }
    financiado_estimado: { parcelas: number; valor_parcela_min: number; valor_parcela_max: number }
  }
  premissas: string[]
  empresa: { razao_social?: string | null; cnpj?: string | null; telefone?: string | null; email?: string | null; rt_nome?: string | null }
  /** data URL (PNG/JPEG) — opcional */
  assinatura?: string | null
  logo?: string | null
  emitido_em?: Date
}

const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n: number, c = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
function documentoFormatado(d: string | null | undefined): string | null {
  const s = String(d || '').replace(/\D/g, '')
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return null
}
const tipoImagem = (dataUrl: string) => (/^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG')

export function gerarPdfOrcamento(d: DadosPdfOrcamento): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 18, R = 192, W = R - L
  const emitido = d.emitido_em || new Date()
  const validade = new Date(emitido.getTime() + 15 * 86_400_000)
  const data = (x: Date) => x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  // Cabeçalho
  doc.setFillColor(15, 24, 37)
  doc.rect(0, 0, 210, 34, 'F')
  if (d.logo) { try { doc.addImage(d.logo, tipoImagem(d.logo), L, 8, 18, 18) } catch { /* sem logo */ } }
  const xTitulo = d.logo ? L + 22 : L
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('SPIN SOLAR', xTitulo, 16)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('Orçamento de energia solar', xTitulo, 23)
  doc.setFontSize(8)
  doc.text(`Emitido em ${data(emitido)} · Válido até ${data(validade)}`, R, 23, { align: 'right' })

  let y = 46
  const titulo = (t: string) => {
    doc.setTextColor(167, 122, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(t.toUpperCase(), L, y)
    doc.setDrawColor(230, 230, 230); doc.line(L, y + 2, R, y + 2)
    y += 8
  }
  const linha = (rotulo: string, valor: string, destaque = false) => {
    doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text(rotulo, L, y)
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', destaque ? 'bold' : 'normal'); doc.setFontSize(destaque ? 12 : 10)
    doc.text(valor, R, y, { align: 'right' })
    y += destaque ? 8 : 6.5
  }

  // Cliente: só nome + CPF/CNPJ
  titulo('Cliente')
  linha('Nome', d.cliente_nome)
  const docFmt = documentoFormatado(d.cliente_documento)
  if (docFmt) linha(docFmt.length > 14 ? 'CNPJ' : 'CPF', docFmt)
  y += 4

  titulo('Sistema proposto')
  linha('Potência', `${num(d.kwp, 2)} kWp`)
  linha('Placas', `${d.qtd_placas} × ${d.placa_modelo} (${num(d.placa_wp)} Wp)`)
  linha('Inversor', `${(d.inversor_qtd || 1) > 1 ? `${d.inversor_qtd} × ` : ''}${d.inversor_modelo} (${num(d.inversor_kw, 1)} kW)`)
  linha('Geração estimada', `${num(d.geracao_kwh_mes)} kWh/mês`)
  if (d.consumo_kwh_mes) linha('Consumo considerado', `${num(d.consumo_kwh_mes)} kWh/mês`)
  if (d.cidade) linha('Local', d.cidade)
  y += 4

  if (d.extras?.length) {
    titulo('Itens inclusos')
    for (const x of d.extras) linha(x.descricao.length > 70 ? `${x.descricao.slice(0, 69)}…` : x.descricao, `${x.qtd} un.`)
    y += 4
  }

  titulo('Investimento')
  linha('Valor total', reais(d.pv_total), true)
  const f = d.formas_pagamento
  linha(`À vista no PIX (${num(f.a_vista_pix.desconto_pct, 0)}% de desconto)`, reais(f.a_vista_pix.valor))
  linha(`Cartão de crédito`, `${f.parcelado_cartao.parcelas}× de ${reais(f.parcelado_cartao.valor_parcela)}`)
  linha(`Financiamento (estimativa)`, `${f.financiado_estimado.parcelas}× de ${reais(f.financiado_estimado.valor_parcela_min)} a ${reais(f.financiado_estimado.valor_parcela_max)}`)
  y += 4

  titulo('Premissas')
  doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  for (const p of d.premissas) {
    const partes = doc.splitTextToSize(`• ${p}`, W)
    doc.text(partes, L, y); y += 5 * partes.length
  }
  y += 2
  const obs = doc.splitTextToSize(
    'Orçamento preliminar, feito com as informações passadas pelo cliente. Placas e inversor definitivos seguem o estoque disponível; ' +
    'valores confirmados após a visita técnica. Financiamento sujeito à aprovação de crédito.', W)
  doc.setTextColor(120, 120, 120); doc.setFontSize(8)
  doc.text(obs, L, y); y += 4 * obs.length + 8

  // Assinatura (Kalebe)
  const yAss = Math.max(y, 232)
  if (d.assinatura) { try { doc.addImage(d.assinatura, tipoImagem(d.assinatura), L, yAss - 16, 50, 16) } catch { /* sem imagem */ } }
  doc.setDrawColor(180, 180, 180); doc.line(L, yAss + 1, L + 70, yAss + 1)
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(d.empresa.rt_nome || 'Spin Solar', L, yAss + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90)
  doc.text(`${d.empresa.razao_social || 'Spin Solar'}${d.empresa.cnpj ? ` · CNPJ ${documentoFormatado(d.empresa.cnpj) || d.empresa.cnpj}` : ''}`, L, yAss + 11)

  // Rodapé
  doc.setFontSize(8); doc.setTextColor(120, 120, 120)
  doc.text([d.empresa.telefone, d.empresa.email, 'spinsolar.com.br'].filter(Boolean).join('  ·  '), 105, 288, { align: 'center' })

  return doc.output('arraybuffer')
}
