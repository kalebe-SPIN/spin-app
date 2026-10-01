'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PropostaVEPDFTemplate } from './PropostaVEPDFTemplate'
import { nomearProposta } from '@/lib/downloads'
import { salvarUrlPropostaVeAction } from '@/app/projetos/[id]/ve/proposta/actions'
import { BotaoEnviarPropostaCanal } from '@/components/proposta/BotaoEnviarPropostaCanal'

type Props = {
  projeto: any
  selecao: any
  configEmpresa: any
}

const BUCKET_PROPOSTAS = 'propostas-pdf'

export function PropostaVEClient({ projeto, selecao, configEmpresa }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [gerando, setGerando] = useState(false)
  const [urlPdf, setUrlPdf] = useState<string | null>(selecao?.url_pdf_proposta_ve || null)
  const [erro, setErro] = useState<string | null>(null)
  const templateRef = useRef<HTMLDivElement>(null)

  async function gerarPDF() {
    if (!templateRef.current) return
    setGerando(true)
    setErro(null)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const paginas = Array.from(templateRef.current.querySelectorAll('section'))

      for (let i = 0; i < paginas.length; i++) {
        const canvas = await html2canvas(paginas[i] as HTMLElement, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
        })
        const imgData = canvas.toDataURL('image/jpeg', 0.92)
        if (i > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      }

      // Kalebe 2026-09-01: novo formato PROPOSTA_XCA_CLIENTE.pdf.
      // VE não tem CC — só potência CA dos wallboxes selecionados.
      const equipamentos = Array.isArray(selecao?.equipamentos) ? selecao.equipamentos : []
      const potenciaCaTotal = equipamentos.reduce(
        (s: number, e: any) => s + (Number(e?.potencia_kw) || 0) * (Number(e?.qtd) || 1),
        0,
      )
      const nomeArquivo = nomearProposta({
        cliente: projeto.cliente_razao_social,
        potenciaCaKw: potenciaCaTotal,
      })
      pdf.save(nomeArquivo)

      const pdfBlob = pdf.output('blob')
      const supabase = createClient()
      const path = `${projeto.id}/ve-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from(BUCKET_PROPOSTAS)
        .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: false })

      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from(BUCKET_PROPOSTAS).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      startTransition(async () => {
        const r = await salvarUrlPropostaVeAction(projeto.id, publicUrl)
        if (r.sucesso) {
          setUrlPdf(publicUrl)
          router.refresh()
        } else if ('erro' in r) {
          setErro(r.erro || 'Falha ao salvar URL')
        }
      })
    } catch (e: any) {
      console.error('[gerarPDF VE] erro:', e)
      setErro(e.message || 'Falha ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  // Kalebe 2026-09-29: proposta vai pelo canal Spin (inbox), não pelo wa.me
  const legendaWhatsApp = `Olá ${(projeto.cliente_razao_social || 'cliente').split(' ')[0]}! ⚡🚗\n\nSegue a proposta da sua Estação de Recarga VE.\n\nQualquer dúvida estou à disposição!`
  const nomeArquivoWhatsApp = nomearProposta({
    cliente: projeto.cliente_razao_social,
    potenciaCaKw: (Array.isArray(selecao?.equipamentos) ? selecao.equipamentos : [])
      .reduce((s: number, e: any) => s + (Number(e?.potencia_kw) || 0) * (Number(e?.qtd) || 1), 0),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" onClick={gerarPDF} disabled={gerando || isPending}
          className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40">
          {gerando ? '⏳ Gerando PDF…' : urlPdf ? '📄 Regenerar PDF' : '📄 Gerar PDF'}
        </button>
        {urlPdf && (
          <>
            <a href={urlPdf} target="_blank" className="px-4 py-3 bg-white/5 border border-white/15 text-white font-bold text-sm rounded-lg hover:bg-white/10">
              🔗 Ver PDF salvo
            </a>
            <BotaoEnviarPropostaCanal
              projetoId={projeto.id}
              urlPdf={urlPdf}
              nomeArquivo={nomeArquivoWhatsApp}
              legenda={legendaWhatsApp}
              rotulo="💬 Enviar por WhatsApp"
            />
          </>
        )}
      </div>

      {erro && <div className="text-sm text-coral p-3 bg-coral/10 border border-coral/30 rounded">⚠ {erro}</div>}

      {/* Preview do template — mesmo escala usada pra gerar o PDF (794px) */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 overflow-auto">
        <div className="tema-fixo" style={{ transform: 'scale(0.85)', transformOrigin: 'top left', width: 934 }}>
          <PropostaVEPDFTemplate
            ref={templateRef}
            projeto={projeto}
            selecao={selecao}
            configEmpresa={configEmpresa}
          />
        </div>
      </div>
    </div>
  )
}
