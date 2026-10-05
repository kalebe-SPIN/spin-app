import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { carregarPainelCampo } from '@/lib/campo/dados'
import { CampoClient } from '@/components/campo/CampoClient'

export const dynamic = 'force-dynamic'

/**
 * /campo — painel do profissional de campo (Kalebe 2026-10-05): demandas de
 * serviço (filtro por região e tipo), agendar vários no mesmo dia, agenda e
 * ordens de serviço.
 */
export default async function CampoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/campo')
  const { data: perfil } = await supabase.from('profiles').select('role, ativo, nome_completo').eq('id', user.id).maybeSingle()
  const papel = String(perfil?.role || '')
  if (!perfil?.ativo || !['profissional_campo', 'instalador', 'admin'].includes(papel)) redirect('/dashboard')

  const dados = await carregarPainelCampo(user.id, papel === 'admin')

  return (
    <main className="min-h-screen p-3 sm:p-6 md:p-8">
      <div className="max-w-screen-xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl sm:text-3xl font-black text-white">🔧 Campo</h1>
          <p className="text-white/60 text-sm mt-0.5">
            Demandas de serviço, sua agenda, ordens de serviço e diárias. Agrupe por região pra fazer vários no mesmo dia.
          </p>
        </header>
        {'erro' in dados ? (
          <div className="p-4 rounded-xl bg-sol/10 border border-sol/30 text-sm text-sol">{dados.erro}</div>
        ) : (
          <CampoClient
            demandas={dados.demandas} agenda={dados.agenda} feitos={dados.feitos}
            dias={dados.dias} mes={dados.mes}
            equipe={dados.equipe} ehAdmin={papel === 'admin'} usuarioId={user.id}
          />
        )}
      </div>
    </main>
  )
}
