import { jsPDF } from 'jspdf'
import { linhasInvestimentoFinal, type FechamentoVenda } from './fechamento'

/**
 * PDF de proposta das categorias montadas no Spinzap (Kalebe 2026-10-14):
 * BESS, O&M e projetos técnicos — mesmo padrão do orçamento fotovoltaico e
 * da estação de recarga. Regras da casa:
 *   - cliente vê o escopo e o total consolidado (sem preço por item)
 *   - bloco do cliente só com nome + CPF/CNPJ formatado
 *   - assinatura escaneada do Kalebe; validade do parâmetro (15 dias)
 */

export type BlocoPdf = {
  titulo: string
  /** Linhas rótulo → valor à direita (ex.: "2 × Bateria X" → "10 kWh") */
  linhas?: Array<{ rotulo: string; valor?: string }>
  /** Itens de serviço com descrição ("Nome: texto") */
  servicos?: Array<{ nome: string; texto: string }>
  paragrafo?: string
}

export type DadosPdfCategoria = {
  subtitulo: string
  codigo_projeto?: string | null
  cliente_nome: string
  cliente_documento?: string | null
  blocos: BlocoPdf[]
  total: number
  rotulo_total?: string
  formas_pagamento: {
    a_vista_pix: { valor: number; desconto_pct: number }
    parcelado_cartao: { parcelas: number; valor_parcela: number }
  }
  garantias?: Array<{ rotulo: string; valor: string }>
  observacao?: string
  validade_dias?: number
  empresa: { razao_social?: string | null; cnpj?: string | null; telefone?: string | null; email?: string | null; rt_nome?: string | null }
  assinatura?: string | null
  logo?: string | null
  emitido_em?: Date
  /** Kalebe 2026-10-16: proposta FINAL — desconto, valor final e pagamento acordados */
  fechamento?: FechamentoVenda | null
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

export function gerarPdfPropostaCategoria(d: DadosPdfCategoria): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 18, R = 192, W = R - L
  const emitido = d.emitido_em || new Date()
  const validade = new Date(emitido.getTime() + (d.validade_dias || 15) * 86_400_000)
  const data = (x: Date) => x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  doc.setFillColor(15, 24, 37)
  doc.rect(0, 0, 210, 34, 'F')
  if (d.logo) { try { doc.addImage(d.logo, tipoImagem(d.logo), L, 8, 18, 18) } catch { /* sem logo */ } }
  const xTitulo = d.logo ? L + 22 : L
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('SPIN SOLAR', xTitulo, 16)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(d.subtitulo, xTitulo, 23)
  doc.setFontSize(8)
  if (d.codigo_projeto || d.fechamento) doc.text(`${d.fechamento ? 'Proposta final' : 'Proposta'}${d.codigo_projeto ? ` ${d.codigo_projeto}` : ''}`, R, 16, { align: 'right' })
  doc.text(`Emitida em ${data(emitido)} · Válida até ${data(validade)}`, R, 23, { align: 'right' })

  let y = 46
  const espaco = (h: number) => { if (y + h > 272) { doc.addPage(); y = 20 } }
  const titulo = (t: string) => {
    espaco(16)
    doc.setTextColor(167, 122, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(t.toUpperCase(), L, y)
    doc.setDrawColor(230, 230, 230); doc.line(L, y + 2, R, y + 2)
    y += 8
  }
  const linha = (rotulo: string, valor: string, destaque = false) => {
    const partes = doc.splitTextToSize(rotulo, W - 48) as string[]
    espaco(6.5 * partes.length)
    doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text(partes, L, y)
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', destaque ? 'bold' : 'normal'); doc.setFontSize(destaque ? 12 : 10)
    if (valor) doc.text(valor, R, y, { align: 'right' })
    y += (destaque ? 8 : 6.5) + 4.5 * (partes.length - 1)
  }
  const paragrafo = (t: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
    const partes = doc.splitTextToSize(t, W) as string[]
    espaco(4.6 * partes.length + 1)
    doc.text(partes, L, y); y += 4.6 * partes.length + 1.5
  }
  const servico = (nome: string, texto: string) => {
    doc.setFontSize(9)
    const partes = doc.splitTextToSize(texto ? `${nome}: ${texto}` : nome, W - 4) as string[]
    espaco(4.6 * partes.length + 1)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text('•', L, y)
    doc.text(partes, L + 4, y); y += 4.6 * partes.length + 1.5
  }

  titulo('Cliente')
  linha('Nome', d.cliente_nome)
  const docFmt = documentoFormatado(d.cliente_documento)
  if (docFmt) linha(docFmt.length > 14 ? 'CNPJ' : 'CPF', docFmt)
  y += 4

  for (const b of d.blocos) {
    if (!b.linhas?.length && !b.servicos?.length && !b.paragrafo) continue
    titulo(b.titulo)
    if (b.paragrafo) paragrafo(b.paragrafo)
    for (const s of b.servicos || []) servico(s.nome, s.texto)
    for (const l of b.linhas || []) linha(l.rotulo, l.valor || '')
    y += 3
  }

  if (d.fechamento) {
    // Proposta final: o que foi acordado com o cliente
    titulo('Investimento — condições acordadas')
    for (const l of linhasInvestimentoFinal(d.fechamento)) linha(l.rotulo, l.valor, !!l.destaque)
  } else {
    titulo('Investimento')
    linha(d.rotulo_total || 'Valor total', reais(d.total), true)
    const f = d.formas_pagamento
    linha(`À vista no PIX (${num(f.a_vista_pix.desconto_pct, 0)}% de desconto)`, reais(f.a_vista_pix.valor))
    linha('Cartão de crédito', `${f.parcelado_cartao.parcelas}× de ${reais(f.parcelado_cartao.valor_parcela)}`)
  }
  y += 4

  // Garantias + observação + assinatura juntas
  espaco(30 + (d.garantias?.length ? 12 + 6.5 * d.garantias.length : 0) + 30)
  if (d.garantias?.length) {
    titulo('Garantias')
    for (const g of d.garantias) linha(g.rotulo, g.valor)
    y += 2
  }
  doc.setTextColor(120, 120, 120); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  const obs = doc.splitTextToSize(d.observacao || (d.fechamento
    ? 'Proposta final com as condições acordadas com o cliente.'
    : 'Proposta feita com as informações passadas pelo cliente; valores confirmados após a visita técnica.'), W) as string[]
  doc.text(obs, L, y); y += 4 * obs.length + 8

  const yAss = y + 16
  if (d.assinatura) { try { doc.addImage(d.assinatura, tipoImagem(d.assinatura), L, yAss - 16, 50, 16) } catch { /* sem imagem */ } }
  doc.setDrawColor(180, 180, 180); doc.line(L, yAss + 1, L + 70, yAss + 1)
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(d.empresa.rt_nome || 'Spin Solar', L, yAss + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90)
  doc.text(`${d.empresa.razao_social || 'Spin Solar'}${d.empresa.cnpj ? ` · CNPJ ${documentoFormatado(d.empresa.cnpj) || d.empresa.cnpj}` : ''}`, L, yAss + 11)

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(120, 120, 120)
    doc.text([d.empresa.telefone, d.empresa.email, 'spinsolar.com.br'].filter(Boolean).join('  ·  '), 105, 288, { align: 'center' })
    if (paginas > 1) doc.text(`${i}/${paginas}`, R, 288, { align: 'right' })
  }
  return doc.output('arraybuffer')
}
