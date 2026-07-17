import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { atualizarEtapaHomologacaoAction } from '@/app/homologacoes/[id]/actions'
import { EtapaHomologacaoClient } from '@/components/EtapaHomologacaoClient'

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

  const { data: hom, error } = await supabase
    .from('homologacoes')
    .select(`
      *,
      projeto:projetos(
        id, codigo, cliente_razao_social, status, tipo_projeto, uc_geradora
      ),
      eletrotecnico:profiles!homologacoes_eletrotecnico_id_fkey(nome_completo)
    `)
    .eq('id', params.id)
    .single()

  if (error || !hom) notFound()

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

        {/* Metadados */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          <Campo label="Protocolo CELESC" valor={hom.protocolo_celesc || '—'} />
          <Campo label="Data solicitação" valor={fmtData(hom.data_solicitacao)} />
          <Campo label="Data aprovação" valor={fmtData(hom.data_aprovacao)} />
          <Campo label="Troca medidor" valor={fmtData(hom.data_prevista_troca_medidor)} />
          <Campo label="Responsável técnico" valor={hom.eletrotecnico?.nome_completo || '—'} />
          <Campo label="Etapa atual" valor={`${hom.etapa_atual}/${totalEtapas}`} />
        </section>

        {/* Progresso visual das 6 etapas */}
        <section className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-4">
            📋 Etapas da homologação
          </h2>

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
