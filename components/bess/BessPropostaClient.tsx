'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { salvarOrcamentoAction, marcarPropostaEnviadaAction } from '@/app/projetos/[id]/orcamento/actions'
import { createClient } from '@/lib/supabase/client'
import { PropostaPDFTemplateBess } from './PropostaPDFTemplateBess'

const BUCKET_PROPOSTAS = 'propostas-fv'

/**
 * Tela de proposta BESS puro — Kalebe 2026-09-09.
 *
 * Mostra composição do kit (bateria + controladora + medidor + caixas + opcionais),
 * memória de cálculo (kit bruto → fator WEG → margem/comissão/imposto → PV),
 * e permite salvar como orçamento + marcar como enviada. Custos internos
 * (kit bruto, fator, margem em R$) só aparecem pra admin.
 */

type ItemComp = {
  id?: string
  marca?: string | null
  modelo: string
  potencia_kw?: number | null
  qtd: number
  preco_venda: number
}

type Props = {
  projeto: any
  kit: {
    modo: 'bess_puro'
    // Kalebe 2026-09-09 v2: arrays (múltiplos itens por segmento).
    // Ainda aceita formato antigo (bateria/controladora/medidor singular) via normalização no consumidor.
    placas?: ItemComp[]       // MIN 2 unidades por tributação
    baterias?: ItemComp[]
    controladoras?: ItemComp[]
    medidores?: ItemComp[]
    bateria?: ItemComp        // legado
    controladora?: ItemComp   // legado
    medidor?: ItemComp        // legado
    caixas_juncao?: ItemComp[]
    opcionais?: ItemComp[]
    lista_ca?: ItemComp[]        // Kalebe 2026-09-09: materiais elétricos
    preco_total_estimado?: number
  }
  proposta: {
    kit_bess_bruto: number
    kit_com_fator: number
    subtotal_lista_ca?: number
    lista_ca?: ItemComp[]
    frete: number
    projeto_art: number
    projeto_art_detalhe?: {
      potencia_ca_total_kw: number
      valor_fixo_ate_30kw: number
      rs_por_kw_acima_30: number
      dentro_faixa_fixa: boolean
    }
    instalacao: number
    instalacao_detalhe?: {
      qtd_inversor: number
      qtd_bateria: number
      valor_por_inversor: number
      valor_por_bateria: number
    }
    base_impostavel: number
    margem: number
    comissao_vendedor: number
    impostos_simples: number
    pv_total: number
    memoria: {
      fator_kit_weg_aplicado: number
      margem_pct: number
      comissao_pct: number
      impostos_pct: number
    }
  }
  configEmpresa: any
  ehAdmin: boolean
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export function BessPropostaClient({ projeto, kit, proposta, configEmpresa, ehAdmin }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [urlPdf, setUrlPdf] = useState<string | null>(projeto.url_pdf_proposta || null)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const templateRef = useRef<HTMLDivElement>(null)

  function salvar() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      const r = await salvarOrcamentoAction(projeto.id, proposta as any)
      if (!r.sucesso) { setErro(r.erro || 'Erro ao salvar'); return }
      setMsg('Orçamento salvo — projeto avançou pra etapa Orçamento Gerado')
    })
  }

  function marcarEnviada() {
    setErro(null); setMsg(null)
    startTransition(async () => {
      const r = await marcarPropostaEnviadaAction(projeto.id)
      if (!r.sucesso) { setErro(r.erro || 'Erro ao marcar'); return }
      setMsg('Proposta marcada como enviada — projeto avançou pro CRM')
    })
  }

  async function gerarPdf() {
    if (!templateRef.current) { setErro('Template não pronto'); return }
    setErro(null); setMsg(null); setGerandoPdf(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const paginas = Array.from(templateRef.current.querySelectorAll('section'))
      for (let i = 0; i < paginas.length; i++) {
        const canvas = await html2canvas(paginas[i] as HTMLElement, {
          scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: '#050B16',
        })
        const imgData = canvas.toDataURL('image/jpeg', 0.92)
        if (i > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      }

      // Download local
      const nomeArquivo = `PROPOSTA_BESS_${(projeto.cliente_razao_social || 'cliente').replace(/\s+/g, '_')}.pdf`
      pdf.save(nomeArquivo)

      // Upload no bucket + salva URL no projeto
      const pdfBlob = pdf.output('blob')
      const supabase = createClient()
      const path = `${projeto.id}/bess-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from(BUCKET_PROPOSTAS)
        .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from(BUCKET_PROPOSTAS).getPublicUrl(path)
      const publicUrl = urlData.publicUrl
      const r = await salvarOrcamentoAction(projeto.id, proposta as any, publicUrl)
      if (r.sucesso) {
        setUrlPdf(publicUrl)
        setMsg('PDF gerado e salvo no card do cliente')
        router.refresh()
      }
    } catch (e: any) {
      console.error('[gerarPdf BESS] erro:', e)
      setErro(e.message || 'Falha ao gerar PDF')
    } finally {
      setGerandoPdf(false)
    }
  }

  function enviarWhatsApp() {
    if (!urlPdf) { setErro('Gere o PDF primeiro antes de enviar'); return }
    const tel = (projeto.cliente_telefone || '').replace(/\D/g, '')
    if (!tel) { setErro('Cliente sem WhatsApp cadastrado'); return }
    const telDDI = tel.startsWith('55') ? tel : `55${tel}`
    const nome = (projeto.cliente_razao_social || 'cliente').split(' ')[0]
    const msg = `Olá ${nome}! Segue sua proposta de sistema BESS (backup de energia) da Spin Solar:\n\n${urlPdf}\n\nQualquer dúvida estou à disposição. — Kalebe`
    window.open(`https://wa.me/${telDDI}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Normaliza formato singular (legado) → arrays
  const toArr = (x: any): ItemComp[] => Array.isArray(x) ? x : (x?.id ? [x] : [])
  const placasArr        = toArr(kit.placas)
  const bateriasArr      = toArr(kit.baterias      ?? kit.bateria)
  const controladorasArr = toArr(kit.controladoras ?? kit.controladora)
  const medidoresArr     = toArr(kit.medidores     ?? kit.medidor)
  const caixasArr        = kit.caixas_juncao || []
  const opcionaisArr     = kit.opcionais || []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna 1-2: composição do kit */}
      <div className="lg:col-span-2 space-y-4">
        <section className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 bg-white/5 text-[10px] uppercase tracking-widest font-bold text-white/60 border-b border-white/5">
            Composição do kit BESS
          </p>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-white/50">
              <tr>
                <th className="text-left p-3">Item</th>
                <th className="text-left p-3">Modelo</th>
                <th className="text-right p-3">Qtd</th>
                {ehAdmin && <th className="text-right p-3">Unit.</th>}
                <th className="text-right p-3">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {placasArr.map((p, i) => (
                <LinhaKit key={`p${i}`} label={placasArr.length > 1 ? `☀️ Placa ${i + 1}` : '☀️ Placa fotovoltaica'} item={p} ehAdmin={ehAdmin} />
              ))}
              {bateriasArr.map((b, i) => (
                <LinhaKit key={`b${i}`} label={bateriasArr.length > 1 ? `🔋 Bateria ${i + 1}` : '🔋 Bateria'} item={b} ehAdmin={ehAdmin} />
              ))}
              {controladorasArr.map((c, i) => (
                <LinhaKit key={`ct${i}`} label={controladorasArr.length > 1 ? `⚙️ Controladora ${i + 1}` : '⚙️ Controladora'} item={c} ehAdmin={ehAdmin} />
              ))}
              {medidoresArr.map((m, i) => (
                <LinhaKit key={`m${i}`} label={medidoresArr.length > 1 ? `📊 Medidor ${i + 1}` : '📊 Medidor'} item={m} ehAdmin={ehAdmin} />
              ))}
              {caixasArr.map((c, i) => (
                <LinhaKit key={`c${i}`} label={`🧰 Caixa junção ${i + 1}`} item={c} ehAdmin={ehAdmin} />
              ))}
              {opcionaisArr.map((o, i) => (
                <LinhaKit key={`o${i}`} label={`✨ Opcional ${i + 1}`} item={o} ehAdmin={ehAdmin} />
              ))}
              {ehAdmin && (
                <tr className="border-t border-sol/20 bg-sol/5">
                  <td colSpan={4} className="p-3 text-right text-[10px] uppercase tracking-wider font-bold text-sol">
                    Kit BESS bruto (custo WEG)
                  </td>
                  <td className="p-3 text-right font-mono font-black text-sol">
                    {fmtBRL(proposta.kit_bess_bruto)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Serviços */}
        {/* Lista CA — materiais elétricos complementares */}
        {(proposta.lista_ca?.length || 0) > 0 && (
          <section className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
            <p className="px-4 py-2.5 bg-white/5 text-[10px] uppercase tracking-widest font-bold text-white/60 border-b border-white/5">
              🔌 Lista CA — materiais elétricos
            </p>
            <table className="w-full text-sm">
              <tbody>
                {(proposta.lista_ca || []).map((it, i) => (
                  <LinhaKit key={i} label={`Item ${i + 1}`} item={it} ehAdmin={ehAdmin} />
                ))}
                <tr className="border-t border-sol/20 bg-sol/5">
                  <td colSpan={ehAdmin ? 4 : 3} className="p-3 text-right text-[10px] uppercase tracking-wider font-bold text-sol">
                    Subtotal Lista CA (entra na base impostável)
                  </td>
                  <td className="p-3 text-right font-mono font-black text-sol">
                    R$ {(proposta.subtotal_lista_ca || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/60 mb-3">
            Serviços e complementos
          </p>
          <div className="space-y-2 text-sm">
            {(proposta.subtotal_lista_ca || 0) > 0 && (
              <LinhaServico label="Lista CA (materiais elétricos)" valor={proposta.subtotal_lista_ca || 0} />
            )}
            <LinhaServico label="Frete regional" valor={proposta.frete} />
            <LinhaServico
              label={
                proposta.projeto_art_detalhe
                  ? proposta.projeto_art_detalhe.dentro_faixa_fixa
                    ? `Projeto + ART (${proposta.projeto_art_detalhe.potencia_ca_total_kw.toFixed(1).replace('.', ',')} kW · faixa até 30 kW)`
                    : `Projeto + ART (${proposta.projeto_art_detalhe.potencia_ca_total_kw.toFixed(1).replace('.', ',')} kW · R$ ${proposta.projeto_art_detalhe.valor_fixo_ate_30kw} + ${(proposta.projeto_art_detalhe.potencia_ca_total_kw - 30).toFixed(1).replace('.', ',')} kW × R$ ${proposta.projeto_art_detalhe.rs_por_kw_acima_30})`
                  : 'Projeto + ART'
              }
              valor={proposta.projeto_art}
            />
            <LinhaServico
              label={
                proposta.instalacao_detalhe
                  ? `Instalação (${proposta.instalacao_detalhe.qtd_inversor}× inversor R$ ${proposta.instalacao_detalhe.valor_por_inversor} + ${proposta.instalacao_detalhe.qtd_bateria}× bateria R$ ${proposta.instalacao_detalhe.valor_por_bateria})`
                  : 'Instalação (mão de obra)'
              }
              valor={proposta.instalacao}
            />
            <hr className="border-white/5 my-2" />
            <LinhaServico label="Base impostável" valor={proposta.base_impostavel} destaque />
          </div>
        </section>

        {ehAdmin && (
          <section className="bg-sol/[0.05] border border-sol/25 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest font-bold text-sol mb-3">
              🔒 Memória de cálculo (só admin)
            </p>
            <div className="space-y-2 text-sm">
              <LinhaServico label={`Fator kit WEG (${proposta.memoria.fator_kit_weg_aplicado})`} valor={proposta.kit_com_fator} />
              <LinhaServico label={`Margem (${proposta.memoria.margem_pct}%)`} valor={proposta.margem} />
              <LinhaServico label={`Comissão vendedor (${proposta.memoria.comissao_pct}%)`} valor={proposta.comissao_vendedor} />
              <LinhaServico label={`Imposto Simples (${proposta.memoria.impostos_pct}% s/ nota Spin)`} valor={proposta.impostos_simples} />
            </div>
          </section>
        )}
      </div>

      {/* Coluna 3: total + ações */}
      <div className="space-y-4">
        <section className="bg-gradient-to-br from-verde/10 to-sol/5 border border-verde/40 rounded-xl p-6 sticky top-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/60">PV total</p>
          <p className="text-3xl font-mono font-black text-white mt-1">{fmtBRL(proposta.pv_total)}</p>
          <p className="text-xs text-white/50 mt-1">Kit BESS + serviços · à vista</p>

          <div className="mt-6 space-y-2">
            <button
              onClick={gerarPdf}
              disabled={gerandoPdf || pending}
              className="w-full px-4 py-3 rounded-lg bg-sol text-noite font-bold text-sm hover:bg-sol/80 disabled:opacity-40 transition"
            >
              {gerandoPdf ? 'Gerando PDF…' : '📄 Gerar PDF da proposta'}
            </button>
            {urlPdf && (
              <>
                <a
                  href={urlPdf} target="_blank" rel="noreferrer"
                  className="block text-center w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 text-xs font-semibold transition"
                >
                  ↗ Abrir PDF salvo
                </a>
                <button
                  onClick={enviarWhatsApp}
                  className="w-full px-4 py-2 rounded-lg bg-verde/10 border border-verde/40 text-verde text-xs font-bold hover:bg-verde/20 transition"
                >
                  💬 Enviar por WhatsApp
                </button>
              </>
            )}
            <button
              onClick={salvar}
              disabled={pending}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 text-white text-xs font-semibold transition disabled:opacity-40"
            >
              💾 Só salvar orçamento (sem PDF)
            </button>
            <button
              onClick={marcarEnviada}
              disabled={pending}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 text-white text-xs font-semibold transition disabled:opacity-40"
            >
              📤 Marcar como enviada
            </button>
            <Link
              href={`/projetos/${projeto.id}/kit`}
              className="block text-center w-full px-4 py-2 rounded-lg text-white/60 hover:text-white text-xs transition"
            >
              ← Editar kit BESS
            </Link>
          </div>

          {erro && (
            <div className="mt-3 p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
              ⚠️ {erro}
            </div>
          )}
          {msg && (
            <div className="mt-3 p-2.5 bg-verde/10 border border-verde/30 rounded text-xs text-verde">
              ✓ {msg}
            </div>
          )}
        </section>

        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-4 text-xs text-white/60 leading-relaxed">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/50 mb-2">Cliente</p>
          <p className="text-white font-semibold">{projeto.cliente_razao_social}</p>
          {projeto.cliente_cpf_cnpj && (
            <p className="font-mono text-white/70 text-[11px] mt-0.5">{projeto.cliente_cpf_cnpj}</p>
          )}
        </section>
      </div>

      {/* Template PDF escondido — renderizado fora do viewport pra html2canvas
          poder capturar sem que apareça na tela do consultor. */}
      <div style={{ position: 'absolute', left: -99999, top: 0, width: 794 }} aria-hidden="true">
        <PropostaPDFTemplateBess
          ref={templateRef}
          projeto={projeto}
          kit={kit}
          proposta={proposta}
          configEmpresa={configEmpresa}
        />
      </div>
    </div>
  )
}

function LinhaKit({ label, item, ehAdmin }: { label: string; item: ItemComp; ehAdmin: boolean }) {
  const subtotal = (Number(item?.preco_venda) || 0) * (Number(item?.qtd) || 1)
  return (
    <tr className="border-t border-white/5">
      <td className="p-3 text-white font-semibold">{label}</td>
      <td className="p-3 text-white/70">
        {item?.marca ? `${item.marca} · ` : ''}{item?.modelo || '—'}
        {item?.potencia_kw ? <span className="text-white/40 ml-1">({item.potencia_kw}kW)</span> : null}
      </td>
      <td className="p-3 text-right font-mono text-white/70">{item?.qtd || 0}</td>
      {ehAdmin && (
        <td className="p-3 text-right font-mono text-white/60 text-xs">
          {fmtBRL(Number(item?.preco_venda) || 0)}
        </td>
      )}
      <td className="p-3 text-right font-mono text-white font-bold">{fmtBRL(subtotal)}</td>
    </tr>
  )
}

function LinhaServico({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={destaque ? 'text-white/80 font-bold text-xs' : 'text-white/60 text-xs'}>{label}</span>
      <span className={`font-mono ${destaque ? 'text-white font-black' : 'text-white/80'}`}>
        {fmtBRL(valor)}
      </span>
    </div>
  )
}
