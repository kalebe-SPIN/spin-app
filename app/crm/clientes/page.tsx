import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function ClientesListaPage({
  searchParams,
}: {
  searchParams: { busca?: string; ativos?: string }
}) {
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

  const busca = searchParams.busca?.trim() || ''
  const mostrarInativos = searchParams.ativos === 'todos'

  let query = supabase
    .from('clientes')
    .select('id, razao_social, nome_fantasia, cpf_cnpj, tipo, email, telefone, cidade:endereco->cidade, origem, ativo, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (!mostrarInativos) query = query.eq('ativo', true)
  if (busca) query = query.or(`razao_social.ilike.%${busca}%,nome_fantasia.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%`)

  const { data: clientes } = await query

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <Link href="/crm" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← CRM
          </Link>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">👥 Clientes</h1>
              <p className="text-white/60 mt-1 text-sm">
                {clientes?.length || 0} {clientes?.length === 1 ? 'cliente' : 'clientes'} {mostrarInativos ? 'no total' : 'ativos'}
              </p>
            </div>
            <Link
              href="/crm/clientes/novo"
              className="px-4 py-2 bg-sol text-noite font-bold rounded-lg text-sm hover:bg-sol/90"
            >
              + Novo cliente
            </Link>
          </div>
        </header>

        {/* Filtros */}
        <form method="get" className="flex gap-2 mb-6">
          <input
            type="text"
            name="busca"
            defaultValue={busca}
            placeholder="Buscar por nome, razão social, CPF/CNPJ..."
            className="flex-1 px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-sol/40 focus:outline-none"
          />
          <select
            name="ativos"
            defaultValue={searchParams.ativos || 'ativos'}
            className="px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white"
          >
            <option value="ativos">Só ativos</option>
            <option value="todos">Todos</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10"
          >
            Buscar
          </button>
        </form>

        {/* Lista */}
        {!clientes || clientes.length === 0 ? (
          <div className="text-center py-16 px-8 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
            <div className="text-4xl mb-3">👥</div>
            <h3 className="text-lg font-bold text-white mb-2">
              {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            </h3>
            <p className="text-sm text-white/60 mb-4">
              {busca ? 'Tenta outro termo de busca ou' : 'Comece'} cadastrando o primeiro cliente.
            </p>
            <Link
              href="/crm/clientes/novo"
              className="inline-block px-4 py-2 bg-sol text-noite font-bold rounded-lg text-sm hover:bg-sol/90"
            >
              + Novo cliente
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {clientes.map((c: any) => (
              <Link
                key={c.id}
                href={`/crm/clientes/${c.id}`}
                className={`block p-4 bg-white/[0.03] border rounded-xl hover:border-sol/40 hover:bg-white/[0.06] transition ${
                  c.ativo ? 'border-white/10' : 'border-white/5 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs">{c.tipo === 'pf' ? '👤' : '🏢'}</span>
                      <p className="text-base font-bold text-white truncate">{c.razao_social}</p>
                      {!c.ativo && (
                        <span className="text-[9px] uppercase bg-white/10 text-white/50 px-1.5 py-0.5 rounded">
                          inativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50 truncate">
                      {c.nome_fantasia && <>{c.nome_fantasia} · </>}
                      {c.cpf_cnpj || 'sem doc'}
                      {c.cidade && <> · {c.cidade}</>}
                    </p>
                    {(c.email || c.telefone) && (
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {c.email}{c.email && c.telefone && ' · '}{c.telefone}
                      </p>
                    )}
                  </div>
                  {c.origem && (
                    <span className="text-[9px] uppercase bg-sol/10 text-sol border border-sol/30 px-2 py-1 rounded-full font-bold">
                      {c.origem}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
