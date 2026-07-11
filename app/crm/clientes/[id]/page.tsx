import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ClienteForm } from '@/components/ClienteForm'
import { TimelineInteracoes } from '@/components/TimelineInteracoes'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ClienteDetalhePage({ params }: { params: { id: string } }) {
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
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
        </div>
      </main>
    )
  }

  const { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!cliente) notFound()

  // Projetos vinculados (busca por razão social — sem FK ainda pra clientes)
  const { data: projetos } = await supabase
    .from('projetos')
    .select('id, codigo, status, tipo_projeto, created_at')
    .ilike('cliente_razao_social', cliente.razao_social)
    .order('created_at', { ascending: false })
    .limit(10)

  // Interações
  const { data: interacoes } = await supabase
    .from('interacoes_cliente')
    .select('id, tipo, descricao, data_hora, duracao_min, usuario:usuario_id (nome_completo)')
    .eq('cliente_id', cliente.id)
    .order('data_hora', { ascending: false })
    .limit(30)

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <Link href="/crm/clientes" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Clientes
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{cliente.tipo === 'pf' ? '👤' : '🏢'}</span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-white/50">
                  {cliente.tipo === 'pf' ? 'Pessoa Física' : 'Empresa'}
                </span>
                {!cliente.ativo && (
                  <span className="text-[9px] uppercase bg-white/10 text-white/50 px-1.5 py-0.5 rounded">
                    inativo
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-white">
                {cliente.razao_social}
              </h1>
              {cliente.nome_fantasia && (
                <p className="text-white/60 mt-1 text-sm">{cliente.nome_fantasia}</p>
              )}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coluna esquerda: form editar */}
          <div>
            <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
              Dados do cliente
            </h2>
            <ClienteForm clienteExistente={cliente} />
          </div>

          {/* Coluna direita: interações + projetos */}
          <div className="space-y-4">
            {/* Projetos */}
            <section className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs uppercase tracking-wider font-bold text-sol">
                  📋 Projetos ({projetos?.length || 0})
                </h3>
                <Link
                  href={`/projetos/novo?cliente=${cliente.razao_social}`}
                  className="text-[10px] text-sol hover:underline"
                >
                  + Novo
                </Link>
              </div>
              {!projetos || projetos.length === 0 ? (
                <p className="text-xs text-white/40">Nenhum projeto vinculado ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {projetos.map((p: any) => (
                    <Link
                      key={p.id}
                      href={`/projetos/${p.id}`}
                      className="block p-2 bg-noite/40 border border-white/5 rounded hover:border-sol/30 transition"
                    >
                      <p className="text-xs font-bold text-white">{p.codigo}</p>
                      <p className="text-[10px] text-white/50 mt-0.5">
                        {p.status} · {p.tipo_projeto}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Timeline interações */}
            <TimelineInteracoes
              clienteId={cliente.id}
              interacoes={(interacoes || []) as any}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
