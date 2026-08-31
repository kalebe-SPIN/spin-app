'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { salvarOrcamentoAction, marcarPropostaEnviadaAction } from '@/app/projetos/[id]/orcamento/actions'
import { PropostaPDFTemplate } from './PropostaPDFTemplate'
import { nomearArquivo } from '@/lib/downloads'
import type { PropostaCalculada } from '@/lib/precificacao/calcular'

type Props = {
  projeto: any
  proposta: PropostaCalculada
  configEmpresa: any
  listaCa: any[]
  ehAdmin?: boolean
}

const BUCKET_PROPOSTAS = 'propostas-pdf'
const FATOR_WEG = 0.4182

export function OrcamentoClient({ projeto, proposta, configEmpresa, listaCa, ehAdmin = false }: Props) {
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

      // 1) Baixar automaticamente — padrão NOME_FINALIDADE_TIPO.ext
      const nomeArquivo = nomearArquivo({
        cliente: projeto.cliente_razao_social,
        finalidade: 'PROPOSTA_COMERCIAL',
        tipo: 'PDF',
      })
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

      {/* Composição de custos + precificação — SÓ ADMIN */}
      {ehAdmin && (
        <ComposicaoCustosAdmin
          projeto={projeto}
          proposta={proposta}
          listaCa={listaCa}
          fmt={fmt}
        />
      )}

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

// ═══════════════════════════════════════════════════════════════════════
// Composição de custos + precificação — ADMIN ONLY
// Kalebe 2026-08-29: 'quero cada item descrito um a um com o preço WEG e
// ao lado o preço com o fator e a quantidade de cada item da proposta.
// A Lista CA também abaixo. E o restante da precificação. Só acessível
// ao admin.'
// ═══════════════════════════════════════════════════════════════════════

function ComposicaoCustosAdmin({
  projeto, proposta, listaCa, fmt,
}: {
  projeto: any
  proposta: PropostaCalculada
  listaCa: any[]
  fmt: (v: number) => string
}) {
  const kit = projeto.kit_selecionado || {}
  const complementos = projeto.lista_complementos_cc?.itens || []
  const avisos = projeto.lista_complementos_cc?.avisos || []

  // Monta linhas do kit WEG: placa + inversor(es) + complementos
  type LinhaWeg = { descricao: string; qtd: number; unidade: string; precoUnit: number; subtotal: number; comFator: number }
  const linhasWeg: LinhaWeg[] = []

  // Placa
  if (kit.placa) {
    const sub = (kit.placa.preco_venda || 0) * (kit.qtd_placas || 0)
    linhasWeg.push({
      descricao: `Placa ${kit.placa.modelo}${kit.placa.potencia_wp ? ` (${kit.placa.potencia_wp}Wp)` : ''}`,
      qtd: kit.qtd_placas || 0,
      unidade: 'un',
      precoUnit: kit.placa.preco_venda || 0,
      subtotal: sub,
      comFator: sub * FATOR_WEG,
    })
  }

  // Inversor(es) — pode ser array novo ou objeto único legado
  const invs: any[] = kit.inversores && kit.inversores.length > 0
    ? kit.inversores
    : (kit.inversor && !kit.modo_ampliacao ? [{ ...kit.inversor, qtd: kit.qtd_inversores || 1 }] : [])
  for (const inv of invs) {
    if (!inv?.modelo || inv.modelo === 'AMPLIAÇÃO — sem inversor') continue
    const sub = (inv.preco_venda || 0) * (inv.qtd || 0)
    linhasWeg.push({
      descricao: `Inversor ${inv.modelo}${inv.potencia_kw ? ` (${inv.potencia_kw}kW)` : ''}${inv.fases ? ` · ${inv.fases}` : ''}`,
      qtd: inv.qtd || 0,
      unidade: 'un',
      precoUnit: inv.preco_venda || 0,
      subtotal: sub,
      comFator: sub * FATOR_WEG,
    })
  }

  // Complementos (cabo, estrutura, MC4, disjuntor, DPS)
  for (const c of complementos) {
    linhasWeg.push({
      descricao: `${rotuloCategoria(c.categoria)} ${c.modelo}`,
      qtd: c.qtd || 0,
      unidade: c.unidade || 'un',
      precoUnit: c.preco_unitario || 0,
      subtotal: c.subtotal || 0,
      comFator: (c.subtotal || 0) * FATOR_WEG,
    })
  }

  const totalWegBruto = linhasWeg.reduce((s, l) => s + l.subtotal, 0)
  const totalWegComFator = linhasWeg.reduce((s, l) => s + l.comFator, 0)
  const totalListaCa = (listaCa || []).reduce((s: number, i: any) => s + (i.preco_unitario || 0) * (i.qtd || 0), 0)

  return (
    <section className="bg-white/[0.03] border border-sol/30 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">Admin</span>
        <h2 className="text-lg font-bold text-white">Composição de custos e precificação</h2>
      </div>
      <p className="text-xs text-white/50 mb-6">
        Detalhamento item-a-item para revisão gerencial. Não vai para o cliente.
      </p>

      {/* Bloco 1 — Kit WEG */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider font-bold text-white/60 mb-2">1. Kit WEG (revenda × fator 0,4182)</h3>
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-white/40 uppercase tracking-wider text-[10px] border-b border-white/10">
                <th className="text-left py-2 px-2 font-normal">Item</th>
                <th className="text-right py-2 px-2 font-normal">Qtd</th>
                <th className="text-right py-2 px-2 font-normal">R$ WEG unit.</th>
                <th className="text-right py-2 px-2 font-normal">Subtotal WEG</th>
                <th className="text-right py-2 px-2 font-normal text-sol">× Fator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {linhasWeg.map((l, i) => (
                <tr key={i} className="text-white/70">
                  <td className="py-1.5 px-2">{l.descricao}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{l.qtd} {l.unidade}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">R$ {fmt(l.precoUnit)}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">R$ {fmt(l.subtotal)}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap text-sol">R$ {fmt(l.comFator)}</td>
                </tr>
              ))}
              <tr className="text-white font-bold border-t border-white/20">
                <td className="py-2 px-2" colSpan={3}>Total Kit WEG</td>
                <td className="py-2 px-2 text-right whitespace-nowrap">R$ {fmt(totalWegBruto)}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap text-sol">R$ {fmt(totalWegComFator)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {avisos.length > 0 && (
          <div className="mt-2 text-[11px] text-coral/80">
            ⚠ {avisos.join(' · ')}
          </div>
        )}
      </div>

      {/* Bloco 2 — Lista CA */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider font-bold text-white/60 mb-2">
          2. Lista CA (materiais complementares tributáveis)
        </h3>
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-white/40 uppercase tracking-wider text-[10px] border-b border-white/10">
                <th className="text-left py-2 px-2 font-normal">Item</th>
                <th className="text-right py-2 px-2 font-normal">Qtd</th>
                <th className="text-right py-2 px-2 font-normal">R$ unit.</th>
                <th className="text-right py-2 px-2 font-normal">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(listaCa || []).map((it: any, i: number) => (
                <tr key={i} className="text-white/70">
                  <td className="py-1.5 px-2">{it.descricao}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{it.qtd} {it.unidade || 'un'}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">R$ {fmt(it.preco_unitario || 0)}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">R$ {fmt((it.preco_unitario || 0) * (it.qtd || 0))}</td>
                </tr>
              ))}
              <tr className="text-white font-bold border-t border-white/20">
                <td className="py-2 px-2" colSpan={3}>Total Lista CA</td>
                <td className="py-2 px-2 text-right whitespace-nowrap">R$ {fmt(totalListaCa)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bloco 3 — Serviços & logística */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider font-bold text-white/60 mb-2">3. Serviços e logística (também tributáveis)</h3>
        <div className="space-y-1 text-xs text-white/70">
          <Linha label="Frete regional" valor={fmt(proposta.frete)} />
          <Linha label="Projeto + ART" valor={fmt(proposta.projeto_art)} />
          <Linha label="Instalação (mão de obra)" valor={fmt(proposta.instalacao)} />
          <div className="pt-2 mt-2 border-t border-white/10">
            <Linha label="Base impostável (Lista CA + serviços)" valor={fmt(proposta.base_impostavel)} destaque />
          </div>
        </div>
      </div>

      {/* Bloco 4 — Acréscimos comerciais */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider font-bold text-white/60 mb-2">4. Acréscimos comerciais (método invertido)</h3>
        <div className="space-y-1 text-xs text-white/70">
          <Linha label={`Margem (${proposta.memoria_calculo.margem_pct}%)`} valor={fmt(proposta.margem)} />
          <Linha label={`Comissão vendedor (${proposta.memoria_calculo.comissao_pct}%)`} valor={fmt(proposta.comissao_vendedor)} />
          <Linha label={`Impostos Simples (${proposta.memoria_calculo.impostos_pct}% — só sobre base impostável)`} valor={fmt(proposta.impostos_simples)} />
        </div>
      </div>

      {/* Fechamento */}
      <div className="pt-4 border-t border-sol/30 space-y-1 text-sm">
        <Linha label="Custo total antes de acréscimos" valor={fmt(proposta.kit_weg_com_fator + proposta.base_impostavel)} />
        <Linha label="PV FINAL" valor={fmt(proposta.pv_total)} destaque />
        <Linha label="Desconto máx. negociação (mantém margem mínima)" valor={fmt(proposta.desconto_max_negociacao)} />
      </div>
    </section>
  )
}

function rotuloCategoria(cat: string): string {
  switch (cat) {
    case 'cabo_cc': return 'Cabo solar'
    case 'estrutura': return 'Estrutura'
    case 'conector': return 'Conector'
    case 'disjuntor': return 'Disjuntor CA'
    case 'dps': return 'DPS CA'
    default: return cat
  }
}
