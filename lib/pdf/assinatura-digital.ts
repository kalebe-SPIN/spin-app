import type { jsPDF } from 'jspdf'

/**
 * Assinatura DIGITAL da Spin nos PDFs (Kalebe 2026-10-16: "digital, cursiva",
 * como no modelo oficial components/PropostaPDFTemplate.tsx): selo
 * "Assinado digitalmente", nome em letra de assinatura, cargo, CNPJ e um
 * código de verificação. Nos PDFs do servidor (jsPDF) o nome sai em itálico
 * — a fonte cursiva do modelo oficial não vem embutida aqui.
 */

/** Código curto determinístico de verificação (mesmo do modelo oficial; não é criptográfico). */
export function hashAssinatura(input: string): string {
  let h1 = 5381, h2 = 52711
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = ((h1 << 5) + h1) ^ c
    h2 = ((h2 << 5) + h2) ^ c
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0').slice(0, 4)
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0').slice(0, 4)
  const p3 = ((h1 ^ h2) >>> 0).toString(16).padStart(4, '0').slice(0, 4)
  return `${p1}-${p2}-${p3}`
}

const cnpjFormatado = (c: string | null | undefined) => {
  const s = String(c || '').replace(/\D/g, '')
  return s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : null
}

/** Altura que o bloco ocupa (mm) — pra reservar espaço na página antes de desenhar. */
export const ALTURA_ASSINATURA_DIGITAL = 40

/** Desenha o bloco a partir de `y` (topo) e devolve o y logo abaixo dele. */
export function desenharAssinaturaDigital(doc: jsPDF, o: {
  x: number
  y: number
  nome?: string | null
  /** Razão social e CNPJ da empresa (configuracoes_empresa) */
  empresa?: { razao_social?: string | null; cnpj?: string | null }
  /** Identifica o documento pro código (ex.: código do projeto) */
  chave: string
  emitido?: Date
}): number {
  const nome = o.nome?.trim() || 'Kalebe Grün'
  const emitido = o.emitido || new Date()
  const data = emitido.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const largura = 82
  const { x } = o
  let y = o.y

  // Selo verde (cor na borda, texto neutro — visual da casa)
  doc.setDrawColor(46, 160, 67); doc.setLineWidth(0.3)
  doc.roundedRect(x, y, 40, 5.5, 1.2, 1.2, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(40, 40, 40)
  doc.text('ASSINADO DIGITALMENTE', x + 20, y + 3.8, { align: 'center' })
  y += 14

  // Nome em letra de assinatura
  doc.setFont('times', 'italic'); doc.setFontSize(22); doc.setTextColor(25, 25, 25)
  doc.text(nome, x, y)
  y += 3
  doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.2)
  doc.line(x, y, x + largura, y)
  y += 5

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 20)
  doc.text(nome, x, y); y += 4.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90)
  doc.text('Diretor comercial · Spin Solar', x, y); y += 4
  const cnpj = cnpjFormatado(o.empresa?.cnpj) || '22.279.642/0001-04'
  doc.text(`${o.empresa?.razao_social || 'Spin Solar'} · CNPJ ${cnpj}`, x, y); y += 4
  doc.setFontSize(7); doc.setTextColor(130, 130, 130)
  doc.text(`Verificação ${hashAssinatura(`spin-${o.chave}-${data}`)} · ${data}`, x, y)
  return y + 4
}
