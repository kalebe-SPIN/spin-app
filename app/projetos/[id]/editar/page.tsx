import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NovoProjetoForm } from '@/components/NovoProjetoForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Edição dos dados básicos do projeto — /projetos/[id]/editar
 *
 * Reusa o NovoProjetoForm em modo edição (passa projetoExistente como prop).
 * Após salvar, redireciona pra /projetos/[id].
 */
export default async function EditarProjetoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select(`
      id,
      cliente_razao_social,
      cliente_cpf_cnpj,
      cliente_email,
      cliente_telefone,
      cliente_endereco,
      uc_geradora,
      ucs_beneficiarias,
      tipo_projeto,
      motivacao_cliente,
      observacoes_consultor,
      codigo
    `)
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <Link
            href={`/projetos/${projeto.id}`}
            className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block"
          >
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Editar dados básicos
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social}
          </p>
        </header>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <NovoProjetoForm
            consultorId={user.id}
            projetoExistente={projeto as any}
          />
        </div>
      </div>
    </main>
  )
}
