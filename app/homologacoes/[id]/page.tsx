import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EtapaHomologacaoClient } from '@/components/EtapaHomologacaoClient'
import { ReprocessarArquivosBtn } from '@/components/ReprocessarArquivosBtn'
import { DocumentosObrigatoriosCard } from '@/components/DocumentosObrigatoriosCard'
import { ErrorBoundaryClient } from '@/components/ErrorBoundaryClient'
import { PadraoNovoToggle } from '@/components/PadraoNovoToggle'
import { GerarTodosDiagramasBtn } from '@/components/GerarTodosDiagramasBtn'
import { todosDocumentosCompletos } from '@/lib/homologacao/utils'

/** Detecta PJ pelo CNPJ (14 dígitos). Local pra não depender do import da action. */
function detectarPJ(cpfCnpj: string | null | undefined): boolean {
  if (!cpfCnpj) return false
  return cpfCnpj.replace(/\D/g, '').length === 14
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_GERAL_INFO: Record<string, { label: string; cor: string; emoji: string }> = {
  iniciado:      { label: 'Iniciado',      cor: 'text-white/60', emoji: '⏳' },
  em_andamento:  { label: 'Em andamento',  cor: 'text-sol',      emoji: '🚧' },
  aprovada:      { label: 'Aprovada',      cor: 'text-verde',    emoji: '✅' },
  rejeitada:     { label: 'Rejeitada',     cor: 'text-coral',    emoji: '❌' },
  cancelada:     { label: 'Cancelada',     cor: 'text-white/40', emoji: '🚫' },
}

const STATUS_ETAPA_INFO: Record<string, { label: string; cor: string; classe: string; emoji: string }> = {
  pendente:      { label: 'Pendente',      cor: 'text-white/60', classe: 'bg-white/5 border-white/10',   emoji: '⏳' },
  em_andamento:  { label: 'Em andamento',  cor: 'text-sol',      classe: 'bg-sol/10 border-sol/40',     emoji: '🚧' },
  concluido:     { label: 'Concluído',     cor: 'text-verde',    classe: 'bg-verde/10 border-verde/40', emoji: '✓' },
  erro:          { label: 'Erro',          cor: 'text-coral',    classe: 'bg-coral/10 border-coral/40', emoji: '⚠️' },
  bloqueado:     { label: 'Bloqueado',     cor: 'text-coral',    classe: 'bg-coral/10 border-coral/40', emoji: '🚫' },
}

export default async function HomologacaoDetalhePage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Query defensiva: tenta join completo com analise_fatura + cliente_cpf_cnpj
  let homRaw: any = null
  let err: any = null
  try {
    const res = await supabase
      .from('homologacoes')
      .select(`
        *,
        projeto:projetos(
          id, codigo, cliente_razao_social, cliente_cpf_cnpj, analise_fatura,
          status, tipo_projeto, uc_geradora
        ),
        eletrotecnico:profiles!homologacoes_eletrotecnico_id_fkey(nome_completo)
      `)
      .eq('id', params.id)
      .maybeSingle()
    homRaw = res.data
    err = res.error
  } catch (e: any) {
    err = e
  }

  // Fallback: se select com campos novos deu erro, tenta sem
  if (!homRaw || err) {
    const res2 = await supabase
      .from('homologacoes')
      .select(`
        *,
        projeto:projetos(
          id, codigo, cliente_razao_social, status, tipo_projeto, uc_geradora
        ),
        eletrotecnico:profiles!homologacoes_eletrotecnico_id_fkey(nome_completo)
      `)
      .eq('id', params.id)
      .maybeSingle()
    homRaw = res2.data
    err = res2.error
  }

  if (err || !homRaw) notFound()

  // Normaliza: Supabase às vezes retorna relação como array mesmo em 1-to-1
  const hom = {
    ...homRaw,
    projeto: Array.isArray(homRaw.projeto) ? homRaw.projeto[0] : homRaw.projeto,
    eletrotecnico: Array.isArray(homRaw.eletrotecnico) ? homRaw.eletrotecnico[0] : homRaw.eletrotecnico,
  }

  // Fallbacks defensivos — TODAS as colunas das migrations 039-043
  const homSafe: any = {
    ...hom,
    // 039: uploads infraestrutura
    foto_disjuntor_url: hom.foto_disjuntor_url ?? null,
    foto_padrao_entrada_url: hom.foto_padrao_entrada_url ?? null,
    foto_fachada_url: hom.foto_fachada_url ?? null,
    pdf_fatura_instalacao_url: hom.pdf_fatura_instalacao_url ?? null,
    documentos_completos_em: hom.documentos_completos_em ?? null,
    // 040: docs PF/PJ + sócios
    cnh_cliente_url: hom.cnh_cliente_url ?? null,
    procuracao_cliente_url: hom.procuracao_cliente_url ?? null,
    cartao_cnpj_url: hom.cartao_cnpj_url ?? null,
    contrato_social_url: hom.contrato_social_url ?? null,
    docs_socios: Array.isArray(hom.docs_socios) ? hom.docs_socios : [],
    // 041: padrão novo (base)
    precisa_padrao_novo: hom.precisa_padrao_novo ?? false,
    padrao_novo_amperagem: hom.padrao_novo_amperagem ?? null,
    padrao_novo_observacao: hom.padrao_novo_observacao ?? null,
    // 043: grupo tarifário do padrão
    padrao_novo_grupo_tarifa: hom.padrao_novo_grupo_tarifa ?? null,
    padrao_novo_tensao_v: hom.padrao_novo_tensao_v ?? null,
  }

  // Documentos completos — try/catch pra não travar a página se algo estourar
  let docsOk = false
  try {
    docsOk = todosDocumentosCompletos(homSafe)
  } catch (e: any) {
    console.error('[homologacao/page] todosDocumentosCompletos:', e?.message)
  }

  // Serialização estrita: força que TUDO que vai pra Client Components seja
  // JSON-safe (remove Date objects, undefined, functions, refs circulares etc)
  // Se algo aqui estourar, capturamos e passamos objeto vazio pros clients
  let propsSeguras: any = {
    ehPJ: false,
    faturaOk: false,
    projetoId: undefined as string | undefined,
    urls: {
      foto_disjuntor: null, foto_padrao_entrada: null, foto_fachada: null,
      pdf_fatura_instalacao: null, cnh_cliente: null, procuracao_cliente: null,
      cartao_cnpj: null, contrato_social: null,
    },
    socios: [] as any[],
    documentosCompletosEm: null as string | null,
    precisaAtual: false, amperagemAtual: null as number | null,
    observacaoAtual: null as string | null,
    grupoTarifaAtual: null as 'A' | 'B' | null, tensaoAtual: null as number | null,
  }
  try {
    propsSeguras = JSON.parse(JSON.stringify({
      ehPJ: detectarPJ(homSafe.projeto?.cliente_cpf_cnpj),
      faturaOk: !!homSafe.projeto?.analise_fatura,
      projetoId: homSafe.projeto?.id || undefined,
      urls: {
        foto_disjuntor: homSafe.foto_disjuntor_url,
        foto_padrao_entrada: homSafe.foto_padrao_entrada_url,
        foto_fachada: homSafe.foto_fachada_url,
        pdf_fatura_instalacao: homSafe.pdf_fatura_instalacao_url,
        cnh_cliente: homSafe.cnh_cliente_url,
        procuracao_cliente: homSafe.procuracao_cliente_url,
        cartao_cnpj: homSafe.cartao_cnpj_url,
        contrato_social: homSafe.contrato_social_url,
      },
      socios: homSafe.docs_socios,
      documentosCompletosEm: homSafe.documentos_completos_em,
      precisaAtual: homSafe.precisa_padrao_novo,
      amperagemAtual: homSafe.padrao_novo_amperagem,
      observacaoAtual: homSafe.padrao_novo_observacao,
      grupoTarifaAtual: homSafe.padrao_novo_grupo_tarifa,
      tensaoAtual: homSafe.padrao_novo_tensao_v,
    }))
  } catch (e: any) {
    console.error('[homologacao/page] serialização de props falhou:', e?.message)
  }

  const { data: etapas } = await supabase
    .from('homologacao_etapas')
    .select('*')
    .eq('homologacao_id', params.id)
    .order('ordem', { ascending: true })

  const statusInfo = STATUS_GERAL_INFO[hom.status_geral] || STATUS_GERAL_INFO.iniciado
  const totalEtapas = etapas?.length || 0
  const concluidas = etapas?.filter((e: any) => e.status === 'concluido').length || 0
  const progresso = totalEtapas > 0 ? Math.round((concluidas / totalEtapas) * 100) : 0

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <Link href={`/projetos/${hom.projeto?.id}`} className="text-xs text-white/40 hover:text-white/70">
            ← Voltar ao projeto
          </Link>
          <div className="mt-2 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                Homologação CELESC · {hom.projeto?.codigo}
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-white">
                🏗️ {hom.projeto?.cliente_razao_social}
              </h1>
              <p className="text-sm text-white/60 mt-1">
                UC {hom.projeto?.uc_geradora} · {hom.projeto?.tipo_projeto}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-black ${statusInfo.cor}`}>
                {statusInfo.emoji} {statusInfo.label}
              </p>
              <p className="text-[10px] text-white/50">
                {concluidas}/{totalEtapas} etapas · {progresso}%
              </p>
            </div>
          </div>
        </header>

        {/* Documentos obrigatórios do consultor — checkpoint pra liberar geração */}
        <ErrorBoundaryClient nome="Documentos obrigatórios">
          <DocumentosObrigatoriosCard
            homologacaoId={params.id}
            ehPJ={propsSeguras.ehPJ}
            faturaOk={propsSeguras.faturaOk}
            projetoId={propsSeguras.projetoId}
            urls={propsSeguras.urls}
            socios={propsSeguras.socios}
            documentosCompletosEm={propsSeguras.documentosCompletosEm}
          />
        </ErrorBoundaryClient>

        {/* Metadados */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <Campo label="Protocolo CELESC" valor={hom.protocolo_celesc || '—'} />
          <Campo label="Data solicitação" valor={fmtData(hom.data_solicitacao)} />
          <Campo label="Data aprovação" valor={fmtData(hom.data_aprovacao)} />
          <Campo label="Troca medidor" valor={fmtData(hom.data_prevista_troca_medidor)} />
          <Campo label="Responsável técnico" valor={hom.eletrotecnico?.nome_completo || '—'} />
          <Campo label="Etapa atual" valor={`${hom.etapa_atual}/${totalEtapas}`} />
        </section>

        {/* Botão destacado: gerar todos os arquivos */}
        <ErrorBoundaryClient nome="Botão gerar tudo">
          <section className="p-4 bg-gradient-to-r from-sol/10 to-verde/10 border border-sol/30 rounded-xl">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
                  🚀 Ação principal
                </h2>
                <p className="text-[10px] text-white/60 mt-0.5">
                  Após enviar todos os documentos, clique aqui pra sistema gerar automaticamente.
                </p>
              </div>
            </div>
            <GerarTodosDiagramasBtn
              homologacaoId={params.id}
              projetoId={homSafe.projeto?.id}
              documentosOk={docsOk}
            />
          </section>
        </ErrorBoundaryClient>

        {/* Toggle: precisa gerar novo padrão de entrada? */}
        <ErrorBoundaryClient nome="Padrão de entrada novo">
          <PadraoNovoToggle
            homologacaoId={params.id}
            precisaAtual={propsSeguras.precisaAtual}
            amperagemAtual={propsSeguras.amperagemAtual}
            observacaoAtual={propsSeguras.observacaoAtual}
            grupoTarifaAtual={propsSeguras.grupoTarifaAtual}
            tensaoAtual={propsSeguras.tensaoAtual}
          />
        </ErrorBoundaryClient>

        {/* Progresso visual das 6 etapas (7 se padrão novo) */}
        <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
              📋 Etapas da homologação
            </h2>
            <ReprocessarArquivosBtn homologacaoId={params.id} />
          </div>

          <div className="space-y-2">
            {(etapas || []).map((etapa: any) => (
              <EtapaHomologacaoClient
                key={etapa.id}
                etapa={etapa}
                statusInfo={STATUS_ETAPA_INFO}
              />
            ))}
          </div>
        </section>

        {/* Ação rápida: link pra diagrama do projeto */}
        <section className="p-4 bg-sol/[0.06] border border-sol/30 rounded-xl">
          <p className="text-xs uppercase font-bold text-sol mb-2">Atalhos</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Link
              href={`/projetos/${hom.projeto?.id}/diagrama`}
              className="p-3 bg-noite/40 border border-white/10 rounded hover:border-sol/40 text-xs text-white flex items-center gap-2"
            >
              📐 Diagramas do projeto →
            </Link>
            <Link
              href={`/projetos/${hom.projeto?.id}/lista-ca`}
              className="p-3 bg-noite/40 border border-white/10 rounded hover:border-sol/40 text-xs text-white flex items-center gap-2"
            >
              🧰 Lista CA →
            </Link>
            <Link
              href={`/projetos/${hom.projeto?.id}/kit`}
              className="p-3 bg-noite/40 border border-white/10 rounded hover:border-sol/40 text-xs text-white flex items-center gap-2"
            >
              🔋 Kit FV →
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

function Campo({ label, valor }: { label: string; valor: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className="text-sm text-white">{valor}</p>
    </div>
  )
}

function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00-03:00').toLocaleDateString('pt-BR')
}
