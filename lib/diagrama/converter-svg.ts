/**
 * Conversores client-side de SVG (diagramas gerados pelo Claude)
 * para PDF (via html2canvas + jsPDF) e DXF (formato AutoCAD).
 *
 * PDF: rasteriza o SVG e embute em A3 paisagem (padrao CAD).
 * DXF: parse XML do SVG e escreve DXF R12 (formato texto simples).
 *      Suporta line/rect/path (segmentos retos)/circle/text.
 *      Circulos e curvas Bezier aproximados por polilinhas.
 *
 * Adapta automaticamente pelo viewBox do SVG (funciona pra A4 antigo E A3 novo).
 *
 * Uso:
 *   import { baixarComoPdf, baixarComoDxf } from '@/lib/diagrama/converter-svg'
 *   await baixarComoPdf(urlSvg, 'unifilar-v1.pdf')
 *   await baixarComoDxf(urlSvg, 'unifilar-v1.dxf')
 */

// Detecta formato pelo viewBox — retorna dimensoes de renderizacao e jsPDF config
function detectarFormato(svgTexto: string) {
  const match = svgTexto.match(/viewBox\s*=\s*["']([^"']+)["']/)
  const vb = match ? match[1].split(/\s+/).map(Number) : [0, 0, 1580, 1120]
  const w = vb[2] || 1580
  const h = vb[3] || 1120
  const aspect = w / h

  // A3 paisagem: 420x297mm (aspect 1.414)
  // A4 paisagem: 297x210mm (aspect 1.414)
  // Ambos tem MESMO aspect ratio — usar A3 se >1300px (mais espaco pra tudo)
  const usaA3 = w > 1300
  return {
    wrapperPx: { w, h },
    pdfFormat: usaA3 ? 'a3' : 'a4',
    pdfMm: usaA3 ? { w: 420, h: 297 } : { w: 297, h: 210 },
    aspect,
  }
}

// ═══════════════════ PDF ═══════════════════
export async function baixarComoPdf(urlSvg: string, nomeArquivo: string): Promise<void> {
  const svgTexto = await fetch(urlSvg).then((r) => r.text())
  const fmt = detectarFormato(svgTexto)

  // Cria elemento temporario pra html2canvas rasterizar
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-99999px'
  wrapper.style.top = '0'
  wrapper.style.width = `${fmt.wrapperPx.w}px`
  wrapper.style.height = `${fmt.wrapperPx.h}px`
  wrapper.style.background = '#FFFFFF'
  wrapper.innerHTML = svgTexto
  document.body.appendChild(wrapper)

  try {
    const html2canvas = (await import('html2canvas')).default
    const jsPDF = (await import('jspdf')).jsPDF

    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#FFFFFF',
      scale: 2,      // 2x resolucao pra ficar nitido em zoom
      logging: false,
      useCORS: true,
    })

    const dataUrl = canvas.toDataURL('image/png', 1.0)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: fmt.pdfFormat as any,
    })
    pdf.addImage(dataUrl, 'PNG', 0, 0, fmt.pdfMm.w, fmt.pdfMm.h, undefined, 'FAST')
    pdf.save(nomeArquivo)
  } finally {
    document.body.removeChild(wrapper)
  }
}

// ═══════════════════ DXF ═══════════════════
type EntidadeDXF =
  | { tipo: 'LINE'; x1: number; y1: number; x2: number; y2: number; layer: string }
  | { tipo: 'CIRCLE'; cx: number; cy: number; r: number; layer: string }
  | { tipo: 'TEXT'; x: number; y: number; texto: string; altura: number; layer: string }
  | { tipo: 'LWPOLYLINE'; pontos: [number, number][]; fechada: boolean; layer: string }

export async function baixarComoDxf(urlSvg: string, nomeArquivo: string): Promise<void> {
  const svgTexto = await fetch(urlSvg).then((r) => r.text())
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgTexto, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) throw new Error('SVG inválido')

  // viewBox pra saber altura e inverter Y (SVG top-left, DXF bottom-left)
  const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) || [0, 0, 1190, 842]
  const [, , , altura] = viewBox
  const flipY = (y: number) => altura - y

  const entidades: EntidadeDXF[] = []

  // Coleta linhas
  doc.querySelectorAll('line').forEach((el) => {
    entidades.push({
      tipo: 'LINE',
      x1: parseFloat(el.getAttribute('x1') || '0'),
      y1: flipY(parseFloat(el.getAttribute('y1') || '0')),
      x2: parseFloat(el.getAttribute('x2') || '0'),
      y2: flipY(parseFloat(el.getAttribute('y2') || '0')),
      layer: el.getAttribute('data-layer') || 'GERAL',
    })
  })

  // Retângulos viram 4 linhas
  doc.querySelectorAll('rect').forEach((el) => {
    const x = parseFloat(el.getAttribute('x') || '0')
    const y = parseFloat(el.getAttribute('y') || '0')
    const w = parseFloat(el.getAttribute('width') || '0')
    const h = parseFloat(el.getAttribute('height') || '0')
    const layer = el.getAttribute('data-layer') || 'BLOCOS'
    const yTop = flipY(y)
    const yBot = flipY(y + h)
    entidades.push({ tipo: 'LWPOLYLINE', pontos: [
      [x, yTop], [x + w, yTop], [x + w, yBot], [x, yBot],
    ], fechada: true, layer })
  })

  // Círculos
  doc.querySelectorAll('circle').forEach((el) => {
    entidades.push({
      tipo: 'CIRCLE',
      cx: parseFloat(el.getAttribute('cx') || '0'),
      cy: flipY(parseFloat(el.getAttribute('cy') || '0')),
      r: parseFloat(el.getAttribute('r') || '0'),
      layer: el.getAttribute('data-layer') || 'GERAL',
    })
  })

  // Textos
  doc.querySelectorAll('text').forEach((el) => {
    const x = parseFloat(el.getAttribute('x') || '0')
    const y = parseFloat(el.getAttribute('y') || '0')
    const fontSize = parseFloat(el.getAttribute('font-size') || '10')
    const texto = el.textContent?.trim() || ''
    if (!texto) return
    entidades.push({
      tipo: 'TEXT',
      x,
      y: flipY(y),
      texto: texto.replace(/[^\x20-\x7E]/g, '?'), // DXF só ASCII básico seguro
      altura: fontSize,
      layer: el.getAttribute('data-layer') || 'TEXTOS',
    })
  })

  // Paths — segmenta em polilinhas simples (M, L, Z, C, H, V)
  doc.querySelectorAll('path').forEach((el) => {
    const d = el.getAttribute('d') || ''
    const pontos = pathParaPontos(d)
    if (pontos.length < 2) return
    const layer = el.getAttribute('data-layer') || 'PATHS'
    entidades.push({
      tipo: 'LWPOLYLINE',
      pontos: pontos.map(([x, y]) => [x, flipY(y)] as [number, number]),
      fechada: /Z$/i.test(d.trim()),
      layer,
    })
  })

  const dxf = gerarDxfR12(entidades)
  const blob = new Blob([dxf], { type: 'application/dxf' })
  baixarBlob(blob, nomeArquivo)
}

/**
 * Parse simples de path SVG. Cobre M/L/H/V/Z + aproxima C (Bézier cúbica)
 * como 10 segmentos retos. Não suporta arcos (A) — vira reta direta.
 */
function pathParaPontos(d: string): [number, number][] {
  const pontos: [number, number][] = []
  const tokens = d.match(/[MLHVZCSQTA][^MLHVZCSQTA]*/gi) || []
  let x = 0, y = 0, startX = 0, startY = 0

  for (const tok of tokens) {
    const cmd = tok[0]
    const nums = (tok.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number)
    const rel = cmd === cmd.toLowerCase()

    switch (cmd.toUpperCase()) {
      case 'M':
        for (let i = 0; i < nums.length; i += 2) {
          x = rel ? x + nums[i] : nums[i]
          y = rel ? y + nums[i + 1] : nums[i + 1]
          if (i === 0) { startX = x; startY = y }
          pontos.push([x, y])
        }
        break
      case 'L':
        for (let i = 0; i < nums.length; i += 2) {
          x = rel ? x + nums[i] : nums[i]
          y = rel ? y + nums[i + 1] : nums[i + 1]
          pontos.push([x, y])
        }
        break
      case 'H':
        for (const n of nums) {
          x = rel ? x + n : n
          pontos.push([x, y])
        }
        break
      case 'V':
        for (const n of nums) {
          y = rel ? y + n : n
          pontos.push([x, y])
        }
        break
      case 'C': {
        // Bézier cúbica — aproxima com 10 segmentos
        for (let i = 0; i < nums.length; i += 6) {
          const cp1x = rel ? x + nums[i] : nums[i]
          const cp1y = rel ? y + nums[i + 1] : nums[i + 1]
          const cp2x = rel ? x + nums[i + 2] : nums[i + 2]
          const cp2y = rel ? y + nums[i + 3] : nums[i + 3]
          const ex = rel ? x + nums[i + 4] : nums[i + 4]
          const ey = rel ? y + nums[i + 5] : nums[i + 5]
          for (let t = 0.1; t <= 1.001; t += 0.1) {
            const bx = Math.pow(1 - t, 3) * x + 3 * Math.pow(1 - t, 2) * t * cp1x + 3 * (1 - t) * t * t * cp2x + Math.pow(t, 3) * ex
            const by = Math.pow(1 - t, 3) * y + 3 * Math.pow(1 - t, 2) * t * cp1y + 3 * (1 - t) * t * t * cp2y + Math.pow(t, 3) * ey
            pontos.push([bx, by])
          }
          x = ex; y = ey
        }
        break
      }
      case 'Z':
        pontos.push([startX, startY])
        x = startX; y = startY
        break
    }
  }
  return pontos
}

/**
 * Escreve DXF R12 mínimo — text format, compatível AutoCAD/QCAD/LibreCAD.
 * Estrutura: HEADER + TABLES (layers) + ENTITIES + EOF
 */
function gerarDxfR12(entidades: EntidadeDXF[]): string {
  const layers = Array.from(new Set(entidades.map((e) => e.layer)))
  const lines: string[] = []

  // HEADER
  lines.push('0', 'SECTION', '2', 'HEADER')
  lines.push('9', '$ACADVER', '1', 'AC1009')  // R12
  lines.push('0', 'ENDSEC')

  // TABLES — declara layers
  lines.push('0', 'SECTION', '2', 'TABLES')
  lines.push('0', 'TABLE', '2', 'LAYER', '70', String(layers.length))
  for (const layer of layers) {
    lines.push('0', 'LAYER', '2', layer, '70', '0', '62', '7', '6', 'CONTINUOUS')
  }
  lines.push('0', 'ENDTAB', '0', 'ENDSEC')

  // ENTITIES
  lines.push('0', 'SECTION', '2', 'ENTITIES')
  for (const e of entidades) {
    switch (e.tipo) {
      case 'LINE':
        lines.push('0', 'LINE', '8', e.layer)
        lines.push('10', fmt(e.x1), '20', fmt(e.y1), '30', '0')
        lines.push('11', fmt(e.x2), '21', fmt(e.y2), '31', '0')
        break
      case 'CIRCLE':
        lines.push('0', 'CIRCLE', '8', e.layer)
        lines.push('10', fmt(e.cx), '20', fmt(e.cy), '30', '0', '40', fmt(e.r))
        break
      case 'TEXT':
        lines.push('0', 'TEXT', '8', e.layer)
        lines.push('10', fmt(e.x), '20', fmt(e.y), '30', '0')
        lines.push('40', fmt(e.altura), '1', e.texto)
        break
      case 'LWPOLYLINE':
        lines.push('0', 'POLYLINE', '8', e.layer, '66', '1', '70', e.fechada ? '1' : '0')
        for (const [px, py] of e.pontos) {
          lines.push('0', 'VERTEX', '8', e.layer)
          lines.push('10', fmt(px), '20', fmt(py), '30', '0')
        }
        lines.push('0', 'SEQEND', '8', e.layer)
        break
    }
  }
  lines.push('0', 'ENDSEC')
  lines.push('0', 'EOF')

  return lines.join('\r\n')
}

function fmt(n: number): string {
  return n.toFixed(4)
}

function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
