import { getConviteAtual } from '@/lib/convite'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AceitarPropostaBtn } from '@/components/vaga/AceitarPropostaBtn'
import { PropostaCampoConteudo } from '@/components/vaga/PropostaCampoConteudo'
import { PropostaConsultorConteudo } from '@/components/vaga/PropostaConsultorConteudo'
import { PropostaCredenciamentoConteudo } from '@/components/vaga/PropostaCredenciamentoConteudo'

/**
 * Apresentação da proposta de trabalho — /vaga/proposta
 * - campo          → Profissional de Campo (empreitada por OS)
 * - credenciamento → Credenciamento de parceiros de vendas (acelerador + níveis)
 * - demais         → Consultor Comercial (Linha Completa: sistemas + O&M) —
 *                    unificada, cobre os tipos 'solar' e 'comercial' antigos.
 */
export default async function PropostaPage() {
  const convite = await getConviteAtual()
  if (!convite) redirect('/vaga/login')

  const jaAceita = ['proposta_aceita', 'contrato_assinado', 'docs_enviados', 'concluido'].includes(convite.status)
  const contratoAssinado = ['contrato_assinado', 'docs_enviados', 'concluido'].includes(convite.status)
  const recusada = convite.status === 'recusado'

  const supabase = createClient()
  const { data: empresa } = await supabase
    .from('configuracoes_empresa')
    .select('razao_social, cnpj, logo_url')
    .eq('singleton', true)
    .maybeSingle()

  // Profissional de campo (empreitada por OS)
  if (convite.tipo_proposta === 'campo') {
    return (
      <main className="max-w-screen-xl mx-auto px-6 py-10 md:py-14">
        <PropostaCampoConteudo nomeCandidato={convite.nome_candidato} zona={convite.zona} cidades={convite.cidades || []} empresa={empresa} />
        <p className="mt-10 text-center text-xs text-white/30">
          SPIN Solar · Proposta válida para discussão — sujeita a formalização em contrato.
        </p>
      </main>
    )
  }

  // Credenciamento — parceiro de vendas (acelerador + Semana de Fechamento + níveis)
  const Proposta = convite.tipo_proposta === 'credenciamento' ? PropostaCredenciamentoConteudo : PropostaConsultorConteudo

  // Consultor Comercial unificada (default) OU Credenciamento
  return (
    <main className="max-w-screen-xl mx-auto px-6 py-10 md:py-14">
      <Proposta
        nomeCandidato={convite.nome_candidato}
        zona={convite.zona}
        cidades={convite.cidades || []}
        empresa={empresa}
        podeBaixarPdf={contratoAssinado}
      />

      {/* ===== CTA / DECISÃO ===== */}
      {recusada ? (
        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl text-center">
          <p className="text-white/70">
            Você recusou esta proposta. Mudou de ideia?{' '}
            <a href="https://wa.me/554832630182" target="_blank" rel="noopener" className="text-sol underline">
              Fale com a Spin
            </a>.
          </p>
        </div>
      ) : (
        <div className="p-6 md:p-8 bg-white/[0.03] border border-white/10 rounded-2xl">
          <h3 className="text-xl md:text-2xl font-black text-white mb-2">Pronto para começar?</h3>
          <p className="text-white/60 text-sm mb-6">
            Ao aceitar, você segue para o contrato de representação comercial e a assinatura digital.
          </p>
          <AceitarPropostaBtn jaAceita={jaAceita} />
        </div>
      )}

      <p className="mt-10 text-center text-xs text-white/30">
        SPIN Solar · Proposta para discussão — sujeita a formalização contratual.
      </p>
    </main>
  )
}
