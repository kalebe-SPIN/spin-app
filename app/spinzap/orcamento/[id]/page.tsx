import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DecisaoOrcamento } from './DecisaoOrcamento'
import { fmtKwp, formatarMoedaBRL } from '@/lib/formatters'

/**
 * /spinzap/orcamento/[id] — aprovação do orçamento montado pela Laís
 * (Kalebe 2026-10-10). Só admin. Mostra o resumo, a auditoria e o PDF.
 */
export const dynamic = 'force-dynamic'

export default async function OrcamentoLaisPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/spinzap')

  const admin = createAdminClient()
  const { data: o } = await admin.from('spinzap_orcamentos')
    .select('id, status, conversa_id, projeto_id, orcamento, auditoria, url_pdf, pv_total, potencia_kwp, criado_em, decidido_em, motivo_recusa, contato:contato_id(nome_exibicao, telefone)')
    .eq('id', params.id).maybeSingle()
  if (!o) notFound()
  const orc = (o as any).orcamento || {}
  const aud = (o as any).auditoria || { itens: [] }
  const contato = (o as any).contato || {}
  const itens = (aud.itens || []) as Array<{ ok: boolean; grave: boolean; grupo: string; texto: string }>
  const grupos = Array.from(new Set(itens.map((i) => i.grupo)))
  const f = orc.formas_pagamento

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/spinzap?c=${o.conversa_id}`} className="text-xs text-white/40 hover:text-white/60">← Conversa no Spinzap</Link>
          <h1 className="text-xl sm:text-2xl font-black text-white">Orçamento da Laís — {contato.nome_exibicao || contato.telefone || 'lead'}</h1>
          <p className="text-xs text-white/50">Montado em {new Date(o.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
        </div>
        <span className={`px-3 py-1 rounded-full border text-xs font-bold ${
          o.status === 'enviado' ? 'border-verde/50' : o.status === 'recusado' ? 'border-coral/50' : 'border-sol/50'
        } text-white/85`}>
          {o.status === 'enviado' ? 'Enviado ao cliente' : o.status === 'recusado' ? 'Recusado' : 'Aguardando aprovação'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-5">
        <div className="space-y-4">
          <section className="rounded-xl border border-white/10 p-4 space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">Sistema</h2>
            <Linha r="Potência" v={fmtKwp(orc.kwp)} />
            <Linha r="Placas" v={`${orc.qtd_placas} × ${orc.placa?.modelo} (${orc.placa?.potencia_wp} Wp)`} />
            <Linha r="Inversor" v={`${orc.inversor?.modelo} (${String(orc.inversor?.potencia_kw).replace('.', ',')} kW)`} />
            <Linha r="Geração estimada" v={`${Number(orc.geracao_kwh_mes || 0).toLocaleString('pt-BR')} kWh/mês`} />
            {orc.consumo_kwh_mes ? <Linha r="Consumo considerado" v={`${Math.round(orc.consumo_kwh_mes).toLocaleString('pt-BR')} kWh/mês`} /> : null}
            {orc.cidade ? <Linha r="Cidade" v={orc.cidade} /> : null}
          </section>
          <section className="rounded-xl border border-white/10 p-4 space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">Investimento</h2>
            <Linha r="Valor total" v={formatarMoedaBRL(o.pv_total)} forte />
            {f && <>
              <Linha r={`PIX (${f.a_vista_pix.desconto_pct}% desc.)`} v={formatarMoedaBRL(f.a_vista_pix.valor)} />
              <Linha r="Cartão" v={`${f.parcelado_cartao.parcelas}× de ${formatarMoedaBRL(f.parcelado_cartao.valor_parcela)}`} />
              <Linha r="Financiamento" v={`${f.financiado_estimado.parcelas}× de ${formatarMoedaBRL(f.financiado_estimado.valor_parcela_min)} a ${formatarMoedaBRL(f.financiado_estimado.valor_parcela_max)}`} />
            </>}
            {orc.interno && (
              <p className="text-[11px] text-white/45 pt-1">Interno: margem {Number(orc.interno.margem_pct).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% · desconto máx. {formatarMoedaBRL(orc.interno.desconto_max_negociacao)}</p>
            )}
          </section>
          <section className="rounded-xl border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">Auditoria</h2>
              <span className="text-xs font-bold text-white/80">{aud.aprovado ? '✅ Aprovado pelo auditor' : '⚠️ Barrado pelo auditor'}</span>
            </div>
            {grupos.map((g) => (
              <div key={g}>
                <p className="text-[11px] font-bold text-white/45 mb-1">{g}</p>
                <ul className="space-y-1">
                  {itens.filter((i) => i.grupo === g).map((i, n) => (
                    <li key={n} className="text-[13px] text-white/80 flex gap-2">
                      <span className="shrink-0">{i.ok ? '✓' : i.grave ? '✕' : '!'}</span>
                      <span className={!i.ok && i.grave ? 'text-coral' : ''}>{i.texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          {o.status === 'aguardando_aprovacao'
            ? <DecisaoOrcamento id={o.id} barrado={!aud.aprovado} />
            : o.status === 'recusado' ? <p className="text-sm text-white/70">Motivo: {o.motivo_recusa}</p> : null}
        </div>
        <div className="rounded-xl border border-white/10 overflow-hidden min-h-[520px]">
          {o.url_pdf
            ? <iframe src={o.url_pdf} title="PDF do orçamento" className="w-full h-full min-h-[720px] bg-white" />
            : <p className="p-4 text-sm text-white/50">Sem PDF.</p>}
        </div>
      </div>
    </main>
  )
}

function Linha({ r, v, forte }: { r: string; v: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-white/55">{r}</span>
      <span className={forte ? 'text-white font-black text-lg' : 'text-white/90 text-right'}>{v}</span>
    </div>
  )
}
