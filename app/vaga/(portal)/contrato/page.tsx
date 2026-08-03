import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getConviteAtual } from '@/lib/convite'
import { montarContrato } from '@/lib/contrato-representacao'
import { AssinaturaContrato } from '@/components/vaga/AssinaturaContrato'

/** Contrato + assinatura digital — /vaga/contrato */
export default async function ContratoPage() {
  const convite = await getConviteAtual()
  if (!convite) redirect('/vaga/login')

  // Precisa ter aceitado a proposta antes
  if (convite.status === 'enviado') redirect('/vaga/proposta')
  if (convite.status === 'recusado') redirect('/vaga/proposta')

  const jaAssinado = ['contrato_assinado', 'docs_enviados', 'concluido'].includes(convite.status)

  // Puxa os dados da Spin (singleton) pra preencher a CONTRATANTE no contrato
  const supabase = createClient()
  const { data: empresa } = await supabase
    .from('configuracoes_empresa')
    .select('razao_social, cnpj, endereco')
    .eq('singleton', true)
    .maybeSingle()

  const texto = montarContrato({
    nomeCandidato: convite.nome_candidato,
    cargo: convite.cargo,
    zona: convite.zona,
    empresa,
  })

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 md:py-14">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Contrato de representação</h1>
        <p className="text-white/60">Leia o contrato e assine digitalmente para seguir.</p>
      </header>

      {/* Texto do contrato */}
      <div className="mb-8 bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">Documento</span>
          <span className="text-xs text-white/40">Lei 4.886/65</span>
        </div>
        <pre className="max-h-[420px] overflow-y-auto px-5 py-5 text-sm text-white/75 leading-relaxed whitespace-pre-wrap font-sans">
{texto}
        </pre>
      </div>

      {jaAssinado ? (
        <div className="p-6 bg-verde/[0.06] border border-verde/25 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-verde font-semibold">
            <span className="w-6 h-6 rounded-full bg-verde/20 border border-verde/50 flex items-center justify-center text-sm">✓</span>
            Contrato assinado
          </span>
          <a
            href="/vaga/documentos"
            className="px-6 py-3 bg-sol text-noite-0 font-bold rounded-lg hover:bg-sol-claro transition-colors"
          >
            Ir para os documentos →
          </a>
        </div>
      ) : (
        <AssinaturaContrato textoContrato={texto} nomeSugerido={convite.nome_candidato} />
      )}
    </main>
  )
}
