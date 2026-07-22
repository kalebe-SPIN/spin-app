import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PainelPrecificacaoServicosClient } from '@/components/PainelPrecificacaoServicosClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PainelPrecificacaoServicosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">
            Somente administradores podem editar precificação de serviços.
          </p>
        </div>
      </main>
    )
  }

  const { data: servicos } = await supabase
    .from('parametros_precificacao_servicos')
    .select('*')
    .eq('ativo', true)
    .order('nome')

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Precificação de serviços
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Parâmetros usados pelo sistema pra calcular preço automático nos formulários de projeto.
          </p>
        </header>

        {(servicos || []).map((s: any) => (
          <section key={s.id} className="mb-8">
            <PainelPrecificacaoServicosClient
              chave={s.chave}
              nome={s.nome}
              descricao={s.descricao}
              parametrosIniciais={s.parametros}
            />
          </section>
        ))}

        {(!servicos || servicos.length === 0) && (
          <div className="p-6 bg-white/[0.02] border border-dashed border-white/10 rounded-lg text-center text-sm text-white/40">
            Nenhum serviço configurado. Rode a migration 047 no Supabase.
          </div>
        )}
      </div>
    </main>
  )
}
