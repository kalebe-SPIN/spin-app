import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TimelineProjeto } from '@/components/TimelineProjeto'

/**
 * Listagem de projetos — /projetos
 *
 * Mostra todos projetos do consultor logado.
 * Admin vê tudo (filtro por consultor disponível).
 */
export default async function ProjetosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: projetos } = await supabase
    .from('projetos')
    .select(`
      id, codigo, status, tipo_projeto,
      cliente_razao_social, cliente_cpf_cnpj,
      uc_geradora, data_inicio,
      created_at
    `)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← Dashboard
            </Link>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              Projetos
            </h1>
            <p className="text-white/60 mt-1 text-sm">
              {projetos?.length || 0} projetos no total
            </p>
          </div>

          <Link
            href="/projetos/novo"
            className="px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors"
          >
            + Novo projeto
          </Link>
        </header>

        {/* Lista de projetos */}
        {projetos && projetos.length > 0 ? (
          <div className="space-y-3">
            {projetos.map((p) => (
              <ProjetoCard key={p.id} projeto={p} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  )
}

function ProjetoCard({ projeto }: { projeto: any }) {
  const dataFmt = new Date(projeto.created_at).toLocaleDateString('pt-BR')

  return (
    <Link
      href={`/projetos/${projeto.id}`}
      className="block p-5 bg-white/5 border border-white/10 rounded-xl hover:border-sol/40 hover:bg-white/[0.07] transition-all"
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
          </div>
          <h3 className="text-lg font-bold text-white">{projeto.cliente_razao_social}</h3>
          <p className="text-sm text-white/60 mt-1">
            UC {projeto.uc_geradora}
            <span className="mx-2 text-white/20">•</span>
            {TIPO_PROJETO_LABEL[projeto.tipo_projeto as keyof typeof TIPO_PROJETO_LABEL] || projeto.tipo_projeto}
          </p>
        </div>
        <div className="text-right text-xs text-white/40">
          {dataFmt}
        </div>
      </div>
      <TimelineProjeto status={projeto.status} />
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-8 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
      <h3 className="text-xl font-bold text-white mb-2">Nenhum projeto ainda</h3>
      <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">
        Crie seu primeiro projeto e siga o workflow completo: fatura → telhado → dimensionamento → kit → orçamento.
      </p>
      <Link
        href="/projetos/novo"
        className="inline-block px-6 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors"
      >
        + Criar primeiro projeto
      </Link>
    </div>
  )
}

const STATUS_INFO = {
  rascunho:            { label: 'Rascunho',           classe: 'bg-white/10 text-white/60' },
  fatura_analisada:    { label: 'Fatura analisada',   classe: 'bg-weg-azul/10 text-weg-azul' },
  telhado_preenchido:  { label: 'Telhado OK',         classe: 'bg-weg-azul/10 text-weg-azul' },
  dimensionado:        { label: 'Dimensionado',       classe: 'bg-weg-azul/10 text-weg-azul' },
  kit_selecionado:     { label: 'Kit escolhido',      classe: 'bg-weg-azul/10 text-weg-azul' },
  lista_ca_confirmada: { label: 'Lista CA OK',        classe: 'bg-weg-azul/10 text-weg-azul' },
  orcamento_gerado:    { label: 'Orçamento pronto',   classe: 'bg-sol/10 text-sol' },
  proposta_enviada:    { label: 'Proposta enviada',   classe: 'bg-sol/10 text-sol' },
  aceito:              { label: 'Aceito ✓',           classe: 'bg-verde/10 text-verde' },
  recusado:            { label: 'Recusado',           classe: 'bg-coral/10 text-coral' },
  cancelado:           { label: 'Cancelado',          classe: 'bg-white/10 text-white/40' },
  expirado:            { label: 'Expirado',           classe: 'bg-coral/10 text-coral' },
}

const TIPO_PROJETO_LABEL = {
  ongrid:           'On-grid',
  hibrido_bess:     'Híbrido c/ BESS',
  expansao_ongrid:  'Expansão on-grid',
  expansao_hibrido: 'Expansão híbrido',
}
