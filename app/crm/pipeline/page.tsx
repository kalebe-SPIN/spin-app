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
  let query = supabase
    .from('projetos')
    .select('id, codigo, status, cliente_razao_social, tipo_projeto, updated_at, status_atualizado_em')
    .order('status_atualizado_em', { ascending: false, nullsFirst: false })
    .limit(500)
  if (isConsultor) query = query.eq('consultor_id', user.id)

  const { data: projetos } = await query

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <Link href="/crm" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← CRM
            </Link>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              🎯 Pipeline Comercial
            </h1>
            <p className="text-white/60 mt-1 text-xs">
              {isAdmin ? 'Todos os projetos por fase' : 'Seus projetos por fase'} — {projetos?.length || 0} no total
            </p>
          </div>
          <Link
            href="/projetos/novo"
            className="px-4 py-2 bg-sol text-noite font-bold rounded-lg text-sm hover:bg-sol/90"
          >
            + Novo
          </Link>
        </header>

        <PipelineKanbanClient projetos={(projetos || []) as any} isAdmin={isAdmin} />

        <div className="mt-4 text-[10px] text-white/40">
          💡 Clique num card pra abrir o projeto e mudar de etapa. ✏ Editar leva ao formulário do projeto.
          {isAdmin && ' 🗑 Excluir apaga o projeto e tudo vinculado (kit, orçamento, agenda, homologação).'}
        </div>
      </div>
    </main>
  )
}
