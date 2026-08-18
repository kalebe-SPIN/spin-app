import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { KanbanTelhados, type TelhadoCard } from '@/components/telhados/KanbanTelhados'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * CRM dedicado ao vendedor_servicos — kanban de prospecção de telhados.
 * Diferente de /crm/pipeline (admin-only, projetos): esta rota é liberada
 * pra vendedor_servicos e admin. Profissional de campo VÊ (RLS mig 066) mas
 * a UI atualmente é do fluxo do vendedor — quem prospecta.
 */
export default async function CrmServicosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()

  const permitido = perfil?.role === 'vendedor_servicos' || perfil?.role === 'admin'
  if (!permitido) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">Área exclusiva do vendedor de serviços.</p>
        </div>
      </main>
    )
  }

  // Traz todos os telhados exceto os "perdidos" (esses viram histórico)
  // Telhados + snapshot da proposta (pra abrir o simulador com dados anteriores)
  const { data: telhadosRaw } = await supabase
    .from('telhados')
    .select('id, fase, apelido, endereco, bairro, cidade, qtd_placas_estimada, potencia_kwp_estimada, foto_url, cliente_nome, cliente_telefone, ultima_interacao_em, criado_em, proposta_dados, proposta_valor')
    .neq('fase', 'perdido')
    .order('criado_em', { ascending: false })

  const telhados: TelhadoCard[] = (telhadosRaw || []) as TelhadoCard[]

  // Parâmetros da fórmula de limpeza + lista de cidades atendidas (pro simulador)
  const [{ data: paramsRow }, { data: cidadesRaw }] = await Promise.all([
    supabase
      .from('parametros_precificacao_servicos')
      .select('parametros')
      .eq('chave', 'limpeza_fotovoltaica')
      .maybeSingle(),
    supabase
      .from('cidades_distancia')
      .select('id, cidade, uf, km')
      .eq('ativo', true)
      .order('km', { ascending: true }),
  ])

  const parametrosLimpeza = (paramsRow?.parametros || null) as any
  const cidades = (cidadesRaw || []) as Array<{ id: string; cidade: string; uf: string; km: number }>

  const bucketPublicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/telhados-fotos`

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="max-w-[1500px] mx-auto">
        <nav className="mb-4">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/70">← Dashboard</Link>
        </nav>
        <KanbanTelhados
          telhados={telhados}
          bucketPublicUrl={bucketPublicUrl}
          parametrosLimpeza={parametrosLimpeza}
          cidades={cidades}
        />
      </div>
    </main>
  )
}
