import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PipelineKanbanClient } from '@/components/PipelineKanbanClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PipelinePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = perfil?.role === 'admin'
  const isConsultor = perfil?.role === 'representante'

  if (!isAdmin && !isConsultor) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
        </div>
      </main>
    )
  }

  // Admin vê todos os projetos; consultor vê só os dele.
  // Kalebe 2026-10-07: sem excluídos e sem "não elegível" (saem da base; o
  // perdido segue na coluna Perdido). Etiqueta do negócio vem dos itens.
  // Tolerante: sem a migration 144 cai pra consulta antiga.
  const consulta = (completa: boolean) => {
    let q = supabase
      .from('projetos')
      .select(completa
        ? 'id, codigo, status, cliente_razao_social, tipo_projeto, updated_at, status_atualizado_em, projeto_itens(tipo, status)'
        : 'id, codigo, status, cliente_razao_social, tipo_projeto, updated_at, status_atualizado_em')
      .order('status_atualizado_em', { ascending: false, nullsFirst: false })
      .limit(500)
    if (completa) q = q.is('excluida_em', null).or('encerrado_tipo.is.null,encerrado_tipo.neq.nao_elegivel')
    if (isConsultor) q = q.eq('consultor_id', user.id)
    return q
  }
  let { data: projetos, error: erroConsulta } = await consulta(true)
  if (erroConsulta) ({ data: projetos } = await consulta(false))

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-4">
          <Link href="/crm" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← CRM
          </Link>
          <h1 className="text-2xl md:text-3xl font-black text-white">
            🎯 Pipeline Comercial
          </h1>
          <p className="text-white/60 mt-1 text-xs">
            {isAdmin ? 'Todos os projetos por fase' : 'Seus projetos por fase'} — {projetos?.length || 0} no total
          </p>
        </header>

        <PipelineKanbanClient
          projetos={(projetos || []) as any}
          isAdmin={isAdmin}
          ctaNovoHref="/projetos/novo"
          ctaNovoLabel="+ Novo projeto"
        />

        <div className="mt-4 text-[10px] text-white/40">
          💡 Clique num card pra abrir o projeto e mudar de etapa. ✏ Editar leva ao formulário do projeto.
          {isAdmin && ' 🗑 Excluir apaga o projeto e tudo vinculado (kit, orçamento, agenda, homologação).'}
        </div>
      </div>
    </main>
  )
}
