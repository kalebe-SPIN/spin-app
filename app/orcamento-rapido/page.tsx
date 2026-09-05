import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { OrcamentoRapidoForm } from '@/components/OrcamentoRapidoForm'

/**
 * Página do Orçamento Rápido — feature de LEAD.
 * Consultor gera estimativa em 30s a partir de um gatilho (kWh, R$/mês, qtd placas),
 * envia via WhatsApp, e depois converte em projeto quando cliente demonstra interesse.
 *
 * Ver PLANO_ORCAMENTO_RAPIDO.md pra fluxo completo.
 * Mig 058 criou a tabela orcamentos_rapidos.
 */
export default async function OrcamentoRapidoPage({
  searchParams,
}: {
  searchParams?: { lead?: string; cliente?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { modo } = await getModoVisualizacao()
  if (modo === 'representante') redirect('/crm/servicos')
  if (modo === 'profissional_campo') redirect('/agenda')

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome_completo, role')
    .eq('id', user.id)
    .single()

  const { data: empresa } = await supabase
    .from('configuracoes_empresa')
    .select('razao_social')
    .maybeSingle()

  // Se veio de um lead, carrega infos pra pre-encher
  type LeadInfo = { id: string; nome: string; telefone: string | null; whatsapp: string | null }
  let leadInfo: LeadInfo | null = null
  if (searchParams?.lead) {
    const { data } = await supabase
      .from('leads')
      .select('id, nome, telefone, whatsapp')
      .eq('id', searchParams.lead)
      .maybeSingle()
    if (data) leadInfo = data as unknown as LeadInfo
  }

  const empresaNome = empresa?.razao_social || 'Spin Solar'
  const consultorPrimeiroNome = profile?.nome_completo?.split(' ')[0] || 'Consultor'

  return (
    <main className="min-h-screen bg-noite">
      <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">
        {/* Header mobile-first */}
        <header className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-white/50 text-sm hover:text-white transition mb-3"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sol/30 to-coral/20 flex items-center justify-center text-2xl">
              ⚡
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white">Orçamento Rápido</h1>
              <p className="text-xs text-white/50 uppercase tracking-wider">
                Fase LEAD · sem PDF, sem contrato
              </p>
            </div>
          </div>
          <p className="text-sm text-white/60">
            Estimativa em 30s pra enviar no WhatsApp e testar o interesse do lead antes de
            investir tempo em projeto técnico completo.
          </p>
          {leadInfo && (
            <div className="mt-3 p-3 rounded-lg bg-verde/10 border border-verde/30 text-sm">
              <span className="text-verde font-semibold">👤 Lead: {leadInfo.nome}</span>
              {leadInfo.whatsapp && (
                <span className="text-white/60 ml-2">· 📱 {leadInfo.whatsapp}</span>
              )}
            </div>
          )}
        </header>

        <OrcamentoRapidoForm
          empresa={{ nome: empresaNome, consultor: consultorPrimeiroNome }}
          leadId={leadInfo?.id}
          telefoneLead={leadInfo?.whatsapp || leadInfo?.telefone || null}
        />

        {/* Nota rodapé */}
        <p className="mt-8 text-[10px] text-white/30 text-center leading-relaxed">
          Este orçamento é uma estimativa comercial preliminar.
          O valor oficial só é validado após visita técnica e emissão de proposta formal.
        </p>
      </div>
    </main>
  )
}
