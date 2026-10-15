import { jsPDF } from 'jspdf'
import type { PropostaRecarga, RespostasRecarga } from './proposta-recarga'
import { rotuloSecao } from '@/lib/propostas/secoes'

/**
 * PDF da proposta de estação de recarga (Kalebe 2026-10-14), gerado no
 * servidor pra ficar nos arquivos e ir pelo WhatsApp. Regras da casa:
 *   - cliente vê só o total consolidado (escopo descrito, sem preço por item)
 *   - bloco do cliente só com nome + CPF/CNPJ formatado
 *   - assinatura escaneada do Kalebe (configuracoes_empresa.rt_assinatura_url)
 *   - validade de 15 dias; números no padrão brasileiro
 * Textos de serviço/garantia reaproveitam os da proposta VE anterior.
 */

export type DadosPdfRecarga = {
  codigo_projeto?: string | null
  cliente_nome: string
  cliente_documento?: string | null
  cidade?: string | null
  proposta: PropostaRecarga
  respostas: RespostasRecarga
  formas_pagamento: {
    a_vista_pix: { valor: number; desconto_pct: number }
    parcelado_cartao: { parcelas: number; valor_parcela: number; valor_total: number }
  }
  validade_dias?: number
  empresa: { razao_social?: string | null; cnpj?: string | null; telefone?: string | null; email?: string | null; rt_nome?: string | null }
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
const UNIDADE: Record<string, [string, string]> = { un: ['un.', 'un.'], m: ['m', 'm'], barra: ['barra', 'barras'] }

export function gerarPdfPropostaRecarga(d: DadosPdfRecarga): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 18, R = 192, W = R - L
  const emitido = d.emitido_em || new Date()
  const validade = new Date(emitido.getTime() + (d.validade_dias || 15) * 86_400_000)
  const data = (x: Date) => x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const p = d.proposta

  // Cabeçalho
  doc.setFillColor(15, 24, 37)
  doc.rect(0, 0, 210, 34, 'F')
  if (d.logo) { try { doc.addImage(d.logo, tipoImagem(d.logo), L, 8, 18, 18) } catch { /* sem logo */ } }
  const xTitulo = d.logo ? L + 22 : L
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('SPIN SOLAR', xTitulo, 16)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('Proposta de estação de recarga', xTitulo, 23)
  doc.setFontSize(8)
  if (d.codigo_projeto) doc.text(`Proposta ${d.codigo_projeto}`, R, 16, { align: 'right' })
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
    doc.text(valor, R, y, { align: 'right' })
    y += (destaque ? 8 : 6.5) + 4.5 * (partes.length - 1)
  }
  const paragrafo = (t: string, tam = 9) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(tam); doc.setTextColor(60, 60, 60)
    const partes = doc.splitTextToSize(t, W) as string[]
    espaco(4.6 * partes.length + 1)
    doc.text(partes, L, y); y += 4.6 * partes.length + 1.5
  }
  const servico = (nome: string, texto: string) => {
    doc.setFontSize(9)
    const partes = doc.splitTextToSize(`${nome}: ${texto}`, W - 4) as string[]
    espaco(4.6 * partes.length + 1)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text('•', L, y)
    doc.text(partes, L + 4, y); y += 4.6 * partes.length + 1.5
  }

  // Cliente: só nome + CPF/CNPJ
  titulo('Cliente')
  linha('Nome', d.cliente_nome)
  const docFmt = documentoFormatado(d.cliente_documento)
  if (docFmt) linha(docFmt.length > 14 ? 'CNPJ' : 'CPF', docFmt)
  y += 4

  // 1. Equipamentos
  titulo('1. Equipamentos')
  for (const e of p.equipamentos) {
    const kw = e.tipo === 'carregador' && e.potencia_kw > 0 ? `${num(e.potencia_kw, e.potencia_kw % 1 ? 1 : 0)} kW` : 'opcional'
    // Kalebe 2026-10-15: carregador do cliente — a Spin faz projeto e execução
    linha(e.do_cliente ? `${e.qtd} × carregador fornecido pelo cliente` : `${e.qtd} × ${e.modelo}`, kw)
  }
  if (p.potencia_total_kw > 0) linha('Potência total de recarga', `${num(p.potencia_total_kw, p.potencia_total_kw % 1 ? 1 : 0)} kW`)
  if (d.cidade) linha('Local da instalação', d.cidade)
  y += 4

  // 2. Projeto
  titulo('2. Projeto')
  servico('Diagrama unifilar', 'elaboração do documento técnico da instalação, assinado por RT habilitado.')
  servico('Diagrama trifilar', 'detalhamento das fases, neutros e proteções, assinado por RT habilitado.')
  y += 3

  // 3. Execução
  titulo('3. Execução')
  servico('Instalação e comissionamento', 'montagem, testes, energização e treinamento inicial de operação.')
  if (d.respostas.trechos?.length) {
    // Kalebe 2026-10-15: caminho até o ponto de conexão, trecho a trecho
    for (const t of p.trechos) {
      if (t.tipo === 'externo') servico(`Eletroduto externo — ${num(t.metros)} m`, 'eletroduto rígido aparente fixado na parede, com abraçadeiras, luvas e curvas.')
      if (t.tipo === 'subterraneo') servico(`Trecho subterrâneo — ${num(t.metros)} m`, `abertura de vala, passagem da tubulação e fechamento${t.concretagem ? ', com recomposição do piso em concreto' : ''}.`)
      if (t.tipo === 'embutido') servico(`Tubulação existente — ${num(t.metros)} m`, 'passagem dos cabos pela infraestrutura embutida.')
      if (t.tipo === 'alvenaria') servico(`Embutido na alvenaria — ${num(t.metros)} m`, 'rasgos e recomposição da parede para a passagem da infraestrutura.')
    }
  } else {
    if (d.respostas.alvenaria) servico('Alvenaria', 'furos, rasgos e recomposição para a passagem da infraestrutura.')
    if (d.respostas.infra_embutida) servico('Infraestrutura embutida', 'passagem dos cabos pela tubulação existente.')
  }
  const km = Number(d.respostas.km_deslocamento) || 0
  if (km > 0) servico('Deslocamento', `${num(km * 2)} km rodados (ida + volta) da Spin Solar até o local do cliente.`)
  if (p.materiais.length) {
    y += 2
    paragrafo('Materiais elétricos complementares para instalação em conformidade com a NBR 5410 e requisitos da concessionária:')
    for (const m of p.materiais) {
      const [um, varios] = UNIDADE[m.unidade] || ['un.', 'un.']
      linha(m.descricao, `${num(m.qtd)} ${m.qtd === 1 ? um : varios}`)
    }
  }
  y += 4

  // Seções incorporadas (aluguel, alvenaria, elétrica predial…): escopo, sem preço
  if (p.secoes.length) {
    titulo('4. Serviços adicionais')
    for (const s of p.secoes) {
      const r = rotuloSecao(s)
      servico(r.titulo, r.detalhe || 'incluso')
    }
    y += 3
  }

  // Investimento: só o total consolidado
  titulo('Investimento')
  linha(p.secoes.length ? 'Valor total (estação e serviços adicionais)' : 'Valor total (equipamentos, projeto e execução)', reais(p.total_geral), true)
  const f = d.formas_pagamento
  linha(`À vista no PIX (${num(f.a_vista_pix.desconto_pct, 0)}% de desconto)`, reais(f.a_vista_pix.valor))
  linha('Cartão de crédito', `${f.parcelado_cartao.parcelas}× de ${reais(f.parcelado_cartao.valor_parcela)}`)
  y += 4

  // Garantias + observação + assinatura ficam juntas na mesma página
  espaco(88)
  titulo('Garantias')
  linha('Equipamentos', 'garantia de fábrica')
  linha('Componentes elétricos', '12 meses')
  linha('Instalação Spin', '1 ano de mão de obra')
  linha('Documentos técnicos', 'cópia digital + ART')
  y += 2
  doc.setTextColor(120, 120, 120); doc.setFontSize(8)
  const obs = doc.splitTextToSize('Proposta feita com as informações passadas pelo cliente; valores confirmados após a visita técnica.', W) as string[]
  espaco(4 * obs.length + 30)
  doc.text(obs, L, y); y += 4 * obs.length + 8

  // Assinatura (Kalebe)
  const yAss = y + 16
  if (d.assinatura) { try { doc.addImage(d.assinatura, tipoImagem(d.assinatura), L, yAss - 16, 50, 16) } catch { /* sem imagem */ } }
  doc.setDrawColor(180, 180, 180); doc.line(L, yAss + 1, L + 70, yAss + 1)
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(d.empresa.rt_nome || 'Spin Solar', L, yAss + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90)
  doc.text(`${d.empresa.razao_social || 'Spin Solar'}${d.empresa.cnpj ? ` · CNPJ ${documentoFormatado(d.empresa.cnpj) || d.empresa.cnpj}` : ''}`, L, yAss + 11)

  // Rodapé em todas as páginas
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(120, 120, 120)
    doc.text([d.empresa.telefone, d.empresa.email, 'spinsolar.com.br'].filter(Boolean).join('  ·  '), 105, 288, { align: 'center' })
    if (paginas > 1) doc.text(`${i}/${paginas}`, R, 288, { align: 'right' })
  }

  return doc.output('arraybuffer')
}
