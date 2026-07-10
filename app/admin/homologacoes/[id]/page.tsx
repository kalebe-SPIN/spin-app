import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { HomologacaoPipeline } from '@/components/HomologacaoPipeline'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function HomologacaoDetalhePage(props: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
        </div>
      </main>
    )
  }

  const { data: homologacao } = await supabase
    .from('homologacoes')
    .select(`
      *,
      projeto:projeto_id (id, codigo, cliente_razao_social, tipo_projeto, kit_selecionado, status),
      etapas:homologacao_etapas (*)
    `)
    .eq('id', props.params.id)
    .single()

  if (!homologacao) notFound()

  const etapas = (homologacao.etapas || []).sort((a: any, b: any) => a.ordem - b.ordem)

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <Link href="/admin/homologacoes" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Todas homologações
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            {homologacao.projeto?.cliente_razao_social}
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {homologacao.projeto?.codigo} · {homologacao.projeto?.tipo_projeto}
          </p>
        </header>

        {/* Metadados CELESC */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Info label="Etapa atual" value={`${homologacao.etapa_atual}/6`} highlight />
          <Info label="Protocolo CELESC" value={homologacao.protocolo_celesc || '—'} />
          <Info label="Data solicitação" value={formatarData(homologacao.data_solicitacao)} />
          <Info label="Data aprovação" value={formatarData(homologacao.data_aprovacao)} />
        </div>

        <HomologacaoPipeline etapas={etapas} projetoId={homologacao.projeto?.id || ''} />

        {homologacao.observacoes && (
          <div className="mt-6 p-4 bg-white/[0.03] border border-white/10 rounded-lg">
            <p className="text-xs uppercase font-bold text-white/50 mb-1">Observações</p>
            <p className="text-sm text-white/80 whitespace-pre-wrap">{homologacao.observacoes}</p>
          </div>
        )}
      </div>
    </main>
  )
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-sol/10 border-sol/40' : 'bg-white/[0.02] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-sol' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function formatarData(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}
