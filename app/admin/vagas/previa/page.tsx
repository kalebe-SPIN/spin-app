import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PropostaConsultorConteudo } from '@/components/vaga/PropostaConsultorConteudo'
import { PropostaCredenciamentoConteudo } from '@/components/vaga/PropostaCredenciamentoConteudo'
import { PropostaCampoConteudo } from '@/components/vaga/PropostaCampoConteudo'
import { montarContrato } from '@/lib/contrato-representacao'

export const dynamic = 'force-dynamic'

/**
 * Prévia permanente da experiência do candidato — /admin/vagas/previa
 * Acesso só do admin. Mostra proposta + contrato + documentos em modo leitura,
 * sem precisar de credencial de candidato nem gastar as 2 entradas.
 */
const DOCS = [
  ['RG e CPF (ou CNH)', 'Documento de identidade do titular. PDF ou foto legível.'],
  ['Comprovante de endereço', 'Conta de luz, água ou telefone recente (últimos 90 dias).'],
  ['CNPJ (Cartão CNPJ / Contrato social ou MEI)', 'Necessário para a representação comercial.'],
  ['Dados bancários / PIX', 'Conta para repasse das comissões (print ou comprovante).'],
]

export default async function PreviaVagaPage({ searchParams }: { searchParams?: { tipo?: string } }) {
  const tipo =
    searchParams?.tipo === 'campo' ? 'campo'
    : searchParams?.tipo === 'credenciamento' ? 'credenciamento'
    : 'comercial'
  // Campo é empreitada por OS (sem contrato/docs nesta prévia); os demais seguem
  // a jornada completa proposta → contrato → documentos.
  const jornadaCompleta = tipo !== 'campo'
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const { data: empresa } = await supabase
    .from('configuracoes_empresa')
    .select('razao_social, cnpj, endereco, logo_url')
    .eq('singleton', true)
    .maybeSingle()

  const nomeExemplo = 'Fulano de Tal'
  const zonaExemplo = 'Grande Florianópolis'
  const contrato = montarContrato({ nomeCandidato: nomeExemplo, cargo: 'Parceiro Comercial — Serviços de O&M', zona: zonaExemplo, empresa })

  return (
    <div className="min-h-screen">
      {/* Barra de prévia (admin) */}
      <div className="sticky top-0 z-40 bg-weg-azul/20 border-b border-weg-azul/40 backdrop-blur">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-sol font-bold">👁 Prévia</span>
            <div className="flex gap-1">
              <Link href="/admin/vagas/previa?tipo=comercial" className={`text-xs px-2.5 py-1 rounded-full border ${tipo === 'comercial' ? 'bg-sol text-noite-0 border-sol font-bold' : 'text-white/60 border-white/15 hover:bg-white/10'}`}>Consultor Comercial</Link>
              <Link href="/admin/vagas/previa?tipo=credenciamento" className={`text-xs px-2.5 py-1 rounded-full border ${tipo === 'credenciamento' ? 'bg-sol text-noite-0 border-sol font-bold' : 'text-white/60 border-white/15 hover:bg-white/10'}`}>Credenciamento</Link>
              <Link href="/admin/vagas/previa?tipo=campo" className={`text-xs px-2.5 py-1 rounded-full border ${tipo === 'campo' ? 'bg-sol text-noite-0 border-sol font-bold' : 'text-white/60 border-white/15 hover:bg-white/10'}`}>Prof. de campo</Link>
            </div>
          </div>
          <Link href="/admin/vagas" className="text-xs text-white/60 hover:text-sol transition-colors whitespace-nowrap">
            ← Voltar aos convites
          </Link>
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-6 py-10 md:py-14">
        {/* Navegação interna */}
        <nav className="flex flex-wrap gap-2 mb-10">
          <a href="#proposta" className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors">1 · Proposta</a>
          {jornadaCompleta && <>
            <a href="#contrato" className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors">2 · Contrato</a>
            <a href="#documentos" className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors">3 · Documentos</a>
          </>}
        </nav>

        {/* ETAPA 1 — Proposta */}
        <section id="proposta" className="scroll-mt-20">
          {tipo === 'campo' ? (
            <PropostaCampoConteudo
              nomeCandidato={nomeExemplo}
              zona={zonaExemplo}
              cidades={['Florianópolis', 'Itajaí', 'Blumenau', 'Joinville', 'Criciúma', 'Chapecó', 'Lages']}
              empresa={empresa}
            />
          ) : (
          <>
          {/* Consultor Comercial (unificada) OU Credenciamento — PDF só libera após assinatura */}
          {tipo === 'credenciamento' ? (
            <PropostaCredenciamentoConteudo
              nomeCandidato={nomeExemplo}
              zona={zonaExemplo}
              empresa={empresa}
              cidades={['Florianópolis', 'Itajaí', 'Blumenau', 'Joinville', 'Criciúma', 'Chapecó', 'Lages']}
            />
          ) : (
          <PropostaConsultorConteudo
            nomeCandidato={nomeExemplo}
            zona={zonaExemplo}
            empresa={empresa}
            cidades={['Florianópolis', 'Itajaí', 'Blumenau', 'Joinville', 'Criciúma', 'Chapecó', 'Lages']}
          />
          )}
          <div className="mb-16 p-6 bg-white/[0.03] border border-white/10 rounded-2xl">
            <p className="text-white/50 text-sm">
              🔒 Aqui o candidato vê os botões <strong className="text-white/80">"Aceitar proposta"</strong> e
              <strong className="text-white/80"> "Recusar"</strong> — desativados nesta prévia.
            </p>
          </div>
          </>
          )}
        </section>

        {jornadaCompleta && (
        <>
        {/* ETAPA 2 — Contrato */}
        <section id="contrato" className="scroll-mt-20 mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sol/40 font-mono text-sm font-bold">02</span>
            <h2 className="text-xl md:text-2xl font-black text-white">Contrato + assinatura digital</h2>
            <span className="flex-1 h-px bg-white/10" />
          </div>
          {(!empresa?.cnpj || !empresa?.razao_social) && (
            <div className="mb-4 px-4 py-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
              ⚠️ Faltam dados da Spin (razão social/CNPJ/endereço). Preencha em{' '}
              <Link href="/admin/empresa" className="underline">/admin/empresa</Link> — sem isso o contrato mostra <code>{'{{PLACEHOLDER}}'}</code>.
            </div>
          )}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">Documento (exemplo)</span>
              <span className="text-xs text-white/40">Lei 4.886/65</span>
            </div>
            <pre className="max-h-[420px] overflow-y-auto px-5 py-5 text-sm text-white/75 leading-relaxed whitespace-pre-wrap font-sans">
{contrato}
            </pre>
          </div>
          <p className="mt-3 text-sm text-white/45">
            O candidato assina com nome + CPF + aceite; o sistema registra data/hora, IP e hash do documento.
          </p>
        </section>

        {/* ETAPA 3 — Documentos */}
        <section id="documentos" className="scroll-mt-20 mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sol/40 font-mono text-sm font-bold">03</span>
            <h2 className="text-xl md:text-2xl font-black text-white">Documentos solicitados</h2>
            <span className="flex-1 h-px bg-white/10" />
          </div>
          <div className="grid gap-3">
            {DOCS.map(([t, d], i) => (
              <div key={i} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <p className="text-white font-bold text-sm">{t}</p>
                  <p className="text-white/50 text-xs mt-1">{d}</p>
                </div>
                <span className="text-xs px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/40">Enviar</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-white/45">
            Os arquivos enviados aparecem no detalhe de cada candidato, em <Link href="/admin/vagas" className="text-sol underline">/admin/vagas</Link>, com Aprovar/Reprovar.
          </p>
        </section>
        </>
        )}
      </main>
    </div>
  )
}
