import { createClient } from '@/lib/supabase/client'

/**
 * PDF da proposta oficial no navegador (mesmo processo de
 * components/OrcamentoClient.tsx): cada <section> do PropostaPDFTemplate vira
 * uma página A4 (html2canvas → jsPDF) e o arquivo sobe pro bucket
 * "propostas-pdf". Usado pelo "Montar proposta" do Spinzap (Kalebe 2026-10-15).
 */

/** Espera as imagens do template (logo) carregarem — sem isso o html2canvas sai sem logo. */
export async function esperarImagens(el: HTMLElement, limiteMs = 5000): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'))
  await Promise.race([
    Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((ok) => { img.onload = () => ok(); img.onerror = () => ok() })))),
    new Promise<void>((ok) => setTimeout(ok, limiteMs)),
  ])
}

export async function pdfDoTemplate(el: HTMLElement): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF('p', 'mm', 'a4')
  const paginas = Array.from(el.querySelectorAll('section'))
  for (let i = 0; i < paginas.length; i++) {
    const canvas = await html2canvas(paginas[i] as HTMLElement, { scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: '#ffffff' })
    if (i > 0) pdf.addPage()
    // A4 = 210 × 297 mm
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
  }
  return pdf.output('blob')
}

/** Sobe o PDF e devolve a URL pública. */
export async function subirPdfProposta(projetoId: string, blob: Blob, prefixo: string): Promise<string | { erro: string }> {
  const supabase = createClient()
  const caminho = `${projetoId}/${prefixo}-${Date.now()}.pdf`
  const { error } = await supabase.storage.from('propostas-pdf').upload(caminho, blob, { contentType: 'application/pdf', upsert: false })
  if (error) return { erro: `Não consegui salvar o PDF: ${error.message}` }
  return supabase.storage.from('propostas-pdf').getPublicUrl(caminho).data.publicUrl
}
