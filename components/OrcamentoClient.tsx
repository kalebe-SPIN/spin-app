'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { salvarOrcamentoAction, marcarPropostaEnviadaAction } from '@/app/projetos/[id]/orcamento/actions'
import { PropostaPDFTemplate } from './PropostaPDFTemplate'
import type { PropostaCalculada } from '@/lib/precificacao/calcular'

type Props = {
  projeto: any
  proposta: PropostaCalculada
  configEmpresa: any
  listaCa: any[]
}

const BUCKET_PROPOSTAS = 'propostas-pdf'

export function OrcamentoClient({ projeto, proposta, configEmpresa, listaCa }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [gerando, setGerando] = useState(false)
  const [urlPdf, setUrlPdf] = useState<string | null>(projeto.url_pdf_proposta || null)
  const [erro, setErro] = useState<string | null>(null)
  const templateRef = useRef<HTMLDivElement>(null)

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
        // A4 = 210 × 297 mm
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      }

      // 1) Baixar automaticamente
      const nomeArquivo = `Proposta-${projeto.codigo}-${projeto.cliente_razao_social.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      pdf.save(nomeArquivo)

      // 2) Upload no Supabase Storage
      const pdfBlob = pdf.output('blob')
      const supabase = createClient()
      const path = `${projeto.id}/${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from(BUCKET_PROPOSTAS)
        .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: false })

      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from(BUCKET_PROPOSTAS).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      // 3) Salvar no banco
      startTransition(async () => {
        const result = await salvarOrcamentoAction(projeto.id, proposta, publicUrl)
        if (result.sucesso) {
          setUrlPdf(publicUrl)
          router.refresh()
        }
      })
    } catch (e: any) {
      console.error('[gerarPDF] erro:', e)
      setErro(e.message || 'Falha ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  function enviarWhatsApp() {
    if (!urlPdf) {
      setErro('Gere o PDF primeiro antes de enviar por WhatsApp.')
      return
    }
    const telefone = (projeto.cliente_telefone || '').replace(/\D/g, '')
    if (!telefone) {
      setErro('Cliente sem WhatsApp cadastrado.')
      return
    }
    const telWithDDI = telefone.startsWith('55') ? telefone : `55${telefone}`
    const nomeCliente = (projeto.cliente_razao_social || 'cliente').split(' ')[0]
    const mensagem = `Olá ${nomeCliente}! 🌞\n\nSegue a proposta do seu sistema fotovoltaico Spin Solar de ${(projeto.kit_selecionado?.potencia_cc_kwp || 0).toFixed(2)} kWp.\n\n📄 PDF completo: ${urlPdf}\n\nQualquer dúvida estou à disposição!`

    const url = `https://wa.me/${telWithDDI}?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank')

    // Marca como proposta enviada
    startTransition(async () => {
      await marcarPropostaEnviadaAction(projeto.id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Resumo da proposta */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Resumo da proposta calculada</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Potência CC" value={`${(projeto.kit_selecionado?.potencia_cc_kwp || 0).toFixed(2)} kWp`} highlight />
          <Metric label="Kit WEG (com fator)" value={`R$ ${fmt(proposta.kit_weg_com_fator)}`} />
          <Metric label="Lista CA + serviços" value={`R$ ${fmt(proposta.subtotal_lista_ca + proposta.frete + proposta.projeto_art + proposta.instalacao)}`} />
          <Metric label="PV FINAL" value={`R$ ${fmt(proposta.pv_total)}`} highlight verde />
        </div>
      </section>

      {/* Detalhamento */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-bold uppercase text-white/50 tracking-wider">
            🔧 Ver composição do preço (detalhamento)
          </summary>
          <div className="mt-4 space-y-2 text-xs text-white/70">
            <Linha label="Kit WEG bruto (placas + inversor)" valor={fmt(proposta.subtotal_kit_weg_bruto)} />
            <Linha label="× Fator WEG 0,4182" valor={fmt(proposta.kit_weg_com_fator)} destaque />
            <Linha label="Subtotal Lista CA (materiais)" valor={fmt(proposta.subtotal_lista_ca)} />
            <Linha label="Frete regional" valor={fmt(proposta.frete)} />
            <Linha label="Projeto + ART" valor={fmt(proposta.projeto_art)} />
            <Linha label="Instalação (mão de obra)" valor={fmt(proposta.instalacao)} />
            <Linha label="Base impostável (tudo menos kit WEG)" valor={fmt(proposta.base_impostavel)} destaque />
            <Linha label={`Margem (${proposta.memoria_calculo.margem_pct}%)`} valor={fmt(proposta.margem)} />
            <Linha label={`Comissão vendedor (${proposta.memoria_calculo.comissao_pct}%)`} valor={fmt(proposta.comissao_vendedor)} />
            <Linha label={`Impostos Simples (${proposta.memoria_calculo.impostos_pct}%)`} valor={fmt(proposta.impostos_simples)} />
            <div className="pt-2 border-t border-white/10 mt-2">
              <Linha label="PV FINAL" valor={fmt(proposta.pv_total)} destaque />
              <Linha label="Desconto máx. negociação (mantém margem mínima)" valor={fmt(proposta.desconto_max_negociacao)} />
            </div>
          </div>
        </details>
      </section>

      {/* Ações principais */}
      <section className="bg-verde/10 border border-verde/30 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Ações</h2>

        {erro && (
          <div className="mb-4 bg-coral/10 border border-coral/30 rounded p-3 text-sm text-coral">
            ❌ {erro}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={gerarPDF}
            disabled={gerando || isPending}
            className="p-4 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {gerando ? '📄 Gerando PDF...' : urlPdf ? '📄 Baixar PDF novamente' : '📄 Gerar e baixar PDF'}
          </button>

          <button
            type="button"
            onClick={enviarWhatsApp}
            disabled={!urlPdf || isPending}
            className="p-4 bg-verde text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            💬 Enviar por WhatsApp ao cliente
          </button>
        </div>

        {urlPdf && (
          <div className="mt-4 p-3 bg-white/[0.03] border border-white/10 rounded text-xs">
            <p className="text-verde font-bold mb-1">✅ PDF gerado e salvo:</p>
            <a href={urlPdf} target="_blank" rel="noreferrer" className="text-sol hover:underline break-all">
              {urlPdf}
            </a>
          </div>
        )}
      </section>

      {/* Template escondido (renderizado offscreen pra virar PDF) */}
      <div style={{ position: 'absolute', left: '-99999px', top: 0, zIndex: -1 }}>
        <PropostaPDFTemplate
          ref={templateRef}
          projeto={projeto}
          proposta={proposta}
          configEmpresa={configEmpresa}
          listaCa={listaCa}
        />
      </div>
    </div>
  )
}

function Metric({ label, value, highlight, verde }: { label: string; value: string; highlight?: boolean; verde?: boolean }) {
  const cor = verde ? 'text-verde' : highlight ? 'text-sol' : 'text-white'
  return (
    <div className={`p-3 rounded-lg border ${highlight ? (verde ? 'bg-verde/10 border-verde/40' : 'bg-sol/10 border-sol/40') : 'bg-white/[0.02] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</p>
      <p className={`text-lg font-bold ${cor}`}>{value}</p>
    </div>
  )
}

function Linha({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={destaque ? 'text-white font-bold' : 'text-white/60'}>{label}</span>
      <span className={destaque ? 'text-sol font-bold' : 'text-white/80'}>R$ {valor}</span>
    </div>
  )
}
