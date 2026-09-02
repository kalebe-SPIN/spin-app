import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CampanhasClient } from '@/components/CampanhasClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CampanhasPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const { data: campanhas } = await supabase
    .from('campanhas_mes')
    .select('*')
    .order('criado_em', { ascending: false })

  // Placa (categoria='placa_fv') e inversores WEG ativos pra selects
  const { data: placas } = await supabase
    .from('v_produtos_ativos')
    .select('id, modelo, codigo_weg, specs, preco_venda')
    .eq('categoria', 'placa_fv')
    .order('modelo')

  const { data: inversores } = await supabase
    .from('v_produtos_ativos')
    .select('id, modelo, codigo_weg, specs, preco_venda, subcategoria')
    .eq('categoria', 'inversor')
    .in('subcategoria', ['inversor_string', 'microinversor', 'inversor_hibrido'])
    .order('modelo')

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Campanhas do mês
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Kits com preço promocional pré-configurado — consultor oferece do card do projeto sem precisar dimensionar
          </p>
        </header>

        <CampanhasClient
          campanhas={campanhas || []}
          placas={placas || []}
          inversores={inversores || []}
        />
      </div>
    </main>
  )
}
