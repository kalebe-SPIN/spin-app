'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { salvarOrcamentoAction, marcarPropostaEnviadaAction } from '@/app/projetos/[id]/orcamento/actions'
import { PropostaPDFTemplate } from './PropostaPDFTemplate'
import { nomearArquivo, nomearProposta } from '@/lib/downloads'
import type { PropostaCalculada } from '@/lib/precificacao/calcular'

type PropostaUc = {
  uc_ref: string
  label: string
  endereco_label?: string | null
  endereco_proprio?: boolean
  kit: any
  listaCa: any[]
  complementosCc: any
  proposta: PropostaCalculada
}

type Props = {
  projeto: any
  proposta: PropostaCalculada | null
  configEmpresa: any
  listaCa: any[]
  ehAdmin?: boolean
  modoComposicao?: 'centralizado' | 'por_uc'
  propostasPorUc?: PropostaUc[] | null
}

const BUCKET_PROPOSTAS = 'propostas-pdf'
const FATOR_WEG = 0.4182

export function OrcamentoClient({
  projeto, proposta, configEmpresa, listaCa, ehAdmin = false,
  modoComposicao = 'centralizado', propostasPorUc = null,
}: Props) {
  // No modo por_uc, escolhe a UC ativa (default: primeira). Todo o
  // dashboard/composição usa a proposta da UC ativa; o PDF unifica.
  const [ucAtivaRef, setUcAtivaRef] = useState<string>(
    propostasPorUc?.[0]?.uc_ref || ''
  )
  const ucAtiva = modoComposicao === 'por_uc'
    ? (propostasPorUc?.find(u => u.uc_ref === ucAtivaRef) || propostasPorUc?.[0])
    : null

  // Proposta+listaCa efetivas (rota A ou B)
  const propostaEfetiva: PropostaCalculada = modoComposicao === 'por_uc'
    ? (ucAtiva?.proposta as PropostaCalculada)
    : (proposta as PropostaCalculada)
  const listaCaEfetiva: any[] = modoComposicao === 'por_uc'
    ? (ucAtiva?.listaCa || [])
    : listaCa

  // Totais consolidados (soma de todas as UCs no modo por_uc)
  const totalConsolidado = modoComposicao === 'por_uc' && propostasPorUc
    ? propostasPorUc.reduce((s, u) => s + (u.proposta?.pv_total || 0), 0)
    : (proposta?.pv_total || 0)
  const potenciaCcConsolidada = modoComposicao === 'por_uc' && propostasPorUc
    ? propostasPorUc.reduce((s, u) => s + (u.kit?.potencia_cc_kwp || 0), 0)
    : (projeto.kit_selecionado?.potencia_cc_kwp || 0)
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

      // 1) Baixar automaticamente — Kalebe 2026-09-01: novo formato
      //    PROPOSTA_5.2CC-4.4CA_NOME DO CLIENTE.pdf
      const potenciaCcTotal = modoComposicao === 'por_uc'
        ? (propostasPorUc || []).reduce((s: number, u: any) => s + (u.kit?.potencia_cc_kwp || 0), 0)
        : (projeto.kit_selecionado?.potencia_cc_kwp || 0)
      const potenciaCaTotal = modoComposicao === 'por_uc'
        ? (propostasPorUc || []).reduce((s: number, u: any) => s + (u.kit?.potencia_ca_kw || 0), 0)
        : (projeto.kit_selecionado?.potencia_ca_kw || 0)
      const nomeArquivo = nomearProposta({
        cliente: projeto.cliente_razao_social,
        potenciaCcKwp: potenciaCcTotal,
        potenciaCaKw: potenciaCaTotal,
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
        const result = await salvarOrcamentoAction(projeto.id, propostaEfetiva, publicUrl)
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
    const potenciaTotal = modoComposicao === 'por_uc' && propostasPorUc
      ? propostasPorUc.reduce((s, u) => s + (u.kit?.potencia_cc_kwp || 0), 0)
      : (projeto.kit_selecionado?.potencia_cc_kwp || 0)
    const suffixUcs = modoComposicao === 'por_uc' && propostasPorUc
      ? ` (${propostasPorUc.length} UCs contempladas)` : ''
    const mensagem = `Olá ${nomeCliente}! 🌞\n\nSegue a proposta do seu sistema fotovoltaico Spin Solar de ${potenciaTotal.toFixed(2)} kWp${suffixUcs}.\n\n📄 PDF completo: ${urlPdf}\n\nQualquer dúvida estou à disposição!`

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
      {/* Consolidado (só modo por_uc) */}
      {modoComposicao === 'por_uc' && propostasPorUc && propostasPorUc.length > 0 && (
        <section className="bg-verde/5 border border-verde/40 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-verde/15 text-verde">
              Consolidado
            </span>
            <h2 className="text-lg font-bold text-white">
              {propostasPorUc.length} kits (um por UC)
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Metric label="UCs contempladas" value={String(propostasPorUc.length)} highlight />
            <Metric label="Potência CC total" value={`${potenciaCcConsolidada.toFixed(2)} kWp`} />
            <Metric label="PV TOTAL (todas UCs)" value={`R$ ${fmt(totalConsolidado)}`} highlight verde />
          </div>
        </section>
      )}

      {/* Seletor de UC (só modo por_uc) */}
      {modoComposicao === 'por_uc' && propostasPorUc && propostasPorUc.length > 0 && (
        <section className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-2">
            Ver detalhamento da UC
          </p>
          <div className="flex flex-wrap gap-2">
            {propostasPorUc.map((u) => (
              <button
                key={u.uc_ref}
                type="button"
                onClick={() => setUcAtivaRef(u.uc_ref)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
                  ucAtivaRef === u.uc_ref
                    ? 'bg-sol text-noite border-sol'
                    : 'bg-white/[0.03] text-white/70 border-white/15 hover:border-white/30'
                }`}
              >
                {u.label}
                {u.endereco_proprio && ' 📍'}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Resumo da UC ativa (ou proposta central) */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">
          {modoComposicao === 'por_uc' && ucAtiva
            ? `Resumo — ${ucAtiva.label}${ucAtiva.endereco_label ? ` · ${ucAtiva.endereco_label}` : ''}`
            : 'Resumo da proposta calculada'}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric
            label="Potência CC"
            value={`${((modoComposicao === 'por_uc' ? ucAtiva?.kit : projeto.kit_selecionado)?.potencia_cc_kwp || 0).toFixed(2)} kWp`}
            highlight
          />
          <Metric label="Kit WEG (com fator)" value={`R$ ${fmt(propostaEfetiva.kit_weg_com_fator)}`} />
          <Metric label="Lista CA + serviços" value={`R$ ${fmt(propostaEfetiva.subtotal_lista_ca + propostaEfetiva.frete + propostaEfetiva.projeto_art + propostaEfetiva.instalacao)}`} />
          <Metric label={modoComposicao === 'por_uc' ? 'PV desta UC' : 'PV FINAL'} value={`R$ ${fmt(propostaEfetiva.pv_total)}`} highlight verde />
        </div>
      </section>

      {/* Composição de custos + precificação — SÓ ADMIN. Usa UC ativa. */}
      {ehAdmin && (
        <ComposicaoCustosAdmin
          projeto={{
            ...projeto,
            // No modo por_uc, o ComposicaoCustosAdmin lê kit_selecionado
            // e lista_complementos_cc da UC ativa em vez do global.
            kit_selecionado: modoComposicao === 'por_uc' ? ucAtiva?.kit : projeto.kit_selecionado,
            lista_complementos_cc: modoComposicao === 'por_uc' ? ucAtiva?.complementosCc : projeto.lista_complementos_cc,
          }}
          proposta={propostaEfetiva}
          listaCa={listaCaEfetiva}
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
          proposta={propostaEfetiva}
          configEmpresa={configEmpresa}
          listaCa={listaCaEfetiva}
          modoComposicao={modoComposicao}
          propostasPorUc={propostasPorUc || undefined}
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

  // Complementos WEG — sempre exibe uma linha POR CATEGORIA na ordem
  // fixa (cabo, estrutura, conector, disjuntor, DPS), agrupando os
  // itens quando o catálogo devolveu mais de um da mesma categoria.
  // Se a categoria não tem item no catálogo, aparece uma linha
  // '— não cadastrado' pra o admin não pensar que o sistema esqueceu.
  const CATEGORIAS_WEG: Array<{ categoria: string; label: string }> = [
    { categoria: 'cabo_cc', label: 'Cabo solar' },
    { categoria: 'estrutura', label: 'Estrutura' },
    { categoria: 'conector', label: 'Conector MC4' },
    { categoria: 'disjuntor', label: 'Disjuntor CA' },
    { categoria: 'dps', label: 'DPS CA' },
  ]
  for (const cat of CATEGORIAS_WEG) {
    const doGrupo = complementos.filter((c: any) => c.categoria === cat.categoria)
    if (doGrupo.length === 0) {
      linhasWeg.push({
        descricao: `${cat.label} — ⚠ não cadastrado no catálogo`,
        qtd: 0, unidade: '—', precoUnit: 0, subtotal: 0, comFator: 0,
      })
      continue
    }
    for (const c of doGrupo) {
      linhasWeg.push({
        descricao: `${cat.label} · ${c.modelo}`,
        qtd: c.qtd || 0,
        unidade: c.unidade || 'un',
        precoUnit: c.preco_unitario || 0,
        subtotal: c.subtotal || 0,
        comFator: (c.subtotal || 0) * FATOR_WEG,
      })
    }
  }

  const totalWegBruto = linhasWeg.reduce((s, l) => s + l.subtotal, 0)
  const totalWegComFator = linhasWeg.reduce((s, l) => s + l.comFator, 0)
  const totalListaCa = (listaCa || []).reduce((s: number, i: any) => s + (i.preco_unitario || 0) * (i.qtd || 0), 0)

  return (
    <section className="bg-white/[0.03] border border-sol/30 rounded-xl p-6">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">Admin</span>
          <h2 className="text-lg font-bold text-white">Composição de custos e precificação</h2>
        </div>
        {/* Kalebe 2026-09-01: analista de projeto valida conformidade
            antes de fechar a proposta */}
        <ValidadorAnalista
          kit={projeto.kit_selecionado}
          complementos={projeto.lista_complementos_cc?.itens || []}
          avisos={avisos}
          listaCa={listaCa}
        />
      </div>
      <p className="text-xs text-white/50 mb-4">
        Detalhamento item-a-item para revisão gerencial. Não vai para o cliente.
      </p>

      {/* Banner de avisos — visível ANTES da tabela pra o admin ver na hora */}
      {avisos.length > 0 && (
        <div className="mb-6 p-3 bg-coral/10 border border-coral/40 rounded-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs font-bold text-coral mb-2">
                ⚠ {avisos.length} item(s) do kit WEG não entraram no preço:
              </p>
              <ul className="space-y-1 text-[11px] text-coral/90">
                {avisos.map((a: string, i: number) => (
                  <li key={i}>· {a}</li>
                ))}
              </ul>
            </div>
            <a
              href="/admin/diagnostico-catalogo"
              className="text-[10px] font-bold text-sol hover:underline whitespace-nowrap"
            >
              🔍 Diagnosticar catálogo →
            </a>
          </div>
        </div>
      )}

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
                  {/* Kalebe 2026-09-01: subtotal em amarelo pra dar foco (coluna paralela ao × FATOR do Kit WEG) */}
                  <td className="py-1.5 px-2 text-right whitespace-nowrap text-sol font-semibold">
                    R$ {fmt((it.preco_unitario || 0) * (it.qtd || 0))}
                  </td>
                </tr>
              ))}
              <tr className="text-white font-bold border-t border-white/20">
                <td className="py-2 px-2" colSpan={3}>Total Lista CA</td>
                <td className="py-2 px-2 text-right whitespace-nowrap text-sol">R$ {fmt(totalListaCa)}</td>
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

/**
 * Botão + modal 'Validar com Analista' — Kalebe 2026-09-01.
 * Roda checklist local de conformidade do orçamento antes de fechar
 * a proposta. Verificações rápidas (client-side, sem IA):
 *   - Kit tem placa + inversor?
 *   - Todos os complementos WEG têm preço?
 *   - Lista CA tem itens sem preço?
 *   - Ratio CC:CA está dentro do limite (150% string / 200% híbrido)?
 *   - Total de avisos pendentes
 * Retorna checklist visual verde/amarelo/vermelho. IA pode ser
 * plugada depois (skill mestre-da-eletrica).
 */
function ValidadorAnalista({
  kit, complementos, avisos, listaCa,
}: {
  kit: any
  complementos: any[]
  avisos: string[]
  listaCa: any[]
}) {
  const [aberto, setAberto] = useState(false)

  const check: Array<{ ok: 'ok' | 'aviso' | 'erro'; titulo: string; detalhe?: string }> = []

  // 1. Placa + inversor
  if (!kit?.placa) check.push({ ok: 'erro', titulo: 'Placa não selecionada' })
  else check.push({ ok: 'ok', titulo: `Placa ${kit.placa.modelo}${kit.placa.potencia_wp ? ` (${kit.placa.potencia_wp}Wp)` : ''}`, detalhe: `${kit.qtd_placas || 0} unidades` })

  const invs: any[] = kit?.inversores?.length > 0 ? kit.inversores : (kit?.inversor ? [{ ...kit.inversor, qtd: kit.qtd_inversores || 1 }] : [])
  if (invs.length === 0) check.push({ ok: 'erro', titulo: 'Inversor não selecionado' })
  else invs.forEach((inv: any) => check.push({ ok: 'ok', titulo: `Inversor ${inv.modelo}${inv.potencia_kw ? ` (${inv.potencia_kw}kW)` : ''}`, detalhe: `${inv.qtd || 1} unidade(s)` }))

  // 2. FCI CC:CA
  const potCc = Number(kit?.potencia_cc_kwp) || 0
  const potCa = invs.reduce((s: number, i: any) => s + (Number(i.potencia_kw) || 0) * (Number(i.qtd) || 1), 0)
  if (potCc > 0 && potCa > 0) {
    const fci = (potCc / potCa) * 100
    const isHibrido = invs.some((i: any) => /SIW\d00H/i.test(String(i.modelo || '')))
    const limite = isHibrido ? 200 : 150
    if (fci > limite) check.push({ ok: 'erro', titulo: `CC/CA fora do limite: ${fci.toFixed(0)}% (máx ${limite}% ${isHibrido ? 'híbrido' : 'string'})` })
    else if (fci > limite * 0.9) check.push({ ok: 'aviso', titulo: `CC/CA no limite: ${fci.toFixed(0)}% (máx ${limite}%)` })
    else check.push({ ok: 'ok', titulo: `CC/CA ${fci.toFixed(0)}% dentro do limite (máx ${limite}%)` })
  }

  // 3. Complementos WEG sem preço
  const complSemPreco = complementos.filter((c: any) => !(Number(c.preco_unitario) > 0))
  if (complSemPreco.length > 0) check.push({ ok: 'aviso', titulo: `${complSemPreco.length} complemento(s) WEG sem preço`, detalhe: complSemPreco.map((c: any) => c.categoria).join(', ') })
  else check.push({ ok: 'ok', titulo: `${complementos.length} complementos WEG precificados` })

  // 4. Lista CA sem preço
  const caSemPreco = (listaCa || []).filter((c: any) => !(Number(c.preco_unitario) > 0))
  if (caSemPreco.length > 0) check.push({ ok: 'aviso', titulo: `${caSemPreco.length} item(s) da Lista CA sem preço`, detalhe: `de ${(listaCa || []).length} totais` })
  else if ((listaCa || []).length > 0) check.push({ ok: 'ok', titulo: `${listaCa.length} itens da Lista CA precificados` })

  // 5. Avisos brutos
  if (avisos.length > 0) check.push({ ok: 'aviso', titulo: `${avisos.length} aviso(s) do gerador de kit` })

  const erros = check.filter(c => c.ok === 'erro').length
  const alerts = check.filter(c => c.ok === 'aviso').length
  const statusGeral: 'ok' | 'aviso' | 'erro' = erros > 0 ? 'erro' : alerts > 0 ? 'aviso' : 'ok'

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className={`px-3 py-1.5 text-[11px] font-bold rounded border ${
          statusGeral === 'ok'    ? 'bg-verde/15 border-verde/40 text-verde hover:bg-verde/25' :
          statusGeral === 'aviso' ? 'bg-sol/15 border-sol/40 text-sol hover:bg-sol/25' :
                                    'bg-coral/15 border-coral/40 text-coral hover:bg-coral/25'
        }`}>
        🔬 Validar com Analista ({statusGeral === 'ok' ? '✓' : `${erros + alerts}`})
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setAberto(false)}>
          <div className="bg-noite border border-white/15 rounded-xl w-full max-w-2xl p-5 space-y-3 mt-8"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-white">🔬 Analista de conformidade</p>
                <p className="text-[11px] text-white/50">Checklist automático antes de fechar proposta</p>
              </div>
              <button onClick={() => setAberto(false)} className="text-white/50 hover:text-white text-xl">×</button>
            </div>

            <div className={`p-3 rounded border ${
              statusGeral === 'ok'    ? 'bg-verde/10 border-verde/40 text-verde' :
              statusGeral === 'aviso' ? 'bg-sol/10 border-sol/40 text-sol' :
                                        'bg-coral/10 border-coral/40 text-coral'
            }`}>
              <p className="text-sm font-bold">
                {statusGeral === 'ok'    ? '✓ Proposta APROVADA pra fechar' :
                 statusGeral === 'aviso' ? `⚠ ${alerts} pendência(s) — revisar antes de fechar` :
                                            `❌ ${erros} erro(s) crítico(s) — não fechar sem corrigir`}
              </p>
            </div>

            <div className="space-y-1">
              {check.map((c, i) => (
                <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded ${
                  c.ok === 'ok'    ? 'bg-verde/5' :
                  c.ok === 'aviso' ? 'bg-sol/5' :
                                     'bg-coral/5'
                }`}>
                  <span className="text-sm">
                    {c.ok === 'ok' ? '✓' : c.ok === 'aviso' ? '⚠' : '❌'}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs text-white">{c.titulo}</p>
                    {c.detalhe && <p className="text-[10px] text-white/50 mt-0.5">{c.detalhe}</p>}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-white/40 pt-2 border-t border-white/10">
              💡 Validação client-side. Análise técnica profunda (dimensionamento, conformidade NBR/CELESC) via IA mestre-da-eletrica virá em breve.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

