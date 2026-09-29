import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NovaVendaDiretaClient } from '@/components/venda-direta/NovaVendaDiretaClient'
import { formatarMoedaBRL } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

/**
 * /venda-direta — atalho do admin (Kalebe 2026-09-29): venda de
 * equipamentos da planilha WEG direto ao consumidor final, sem projeto,
 * instalação nem lista CA. Cria o projeto e leva pra tela de equipamentos.
 */
export default async function VendaDiretaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const [{ data: vendas }, { data: perfis }] = await Promise.all([
    supabase
      .from('projetos')
      .select('id, codigo, cliente_razao_social, status, pv_total, created_at, url_pdf_proposta')
      .eq('tipo_projeto', 'venda_equipamentos')
      .is('excluida_em', null)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('profiles')
      .select('id, nome_completo, role')
      .eq('ativo', true)
      .in('role', ['admin', 'representante', 'consultor']),
  ])

  const vendedores = (perfis || [])
    .map((p: any) => ({ id: p.id, nome: p.nome_completo || 'Sem nome', papel: p.role }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-xl mx-auto space-y-8">
        <header>
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-1 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">📦 Venda direta de equipamentos</h1>
          <p className="text-white/60 mt-1 text-sm max-w-3xl">
            Equipamentos da planilha WEG vendidos direto ao consumidor final. Sem projeto, mão de obra
            de instalação nem lista CA — margem e comissão próprias, imposto sobre o total e termo de
            isenção de responsabilidade técnica no PDF.
          </p>
        </header>

        <NovaVendaDiretaClient usuarioId={user.id} vendedores={vendedores} />

        <section>
          <h2 className="text-lg font-bold text-white mb-3">
            Últimas vendas diretas <span className="text-xs font-normal text-white/40">({(vendas || []).length})</span>
          </h2>
          {(vendas || []).length === 0 ? (
            <p className="text-sm text-white/40 py-6 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-lg">
              Nenhuma venda direta ainda.
            </p>
          ) : (
            <div className="overflow-x-auto bg-white/[0.03] border border-white/10 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-white/10 text-[10px] uppercase text-white/50 font-bold">
                    <th className="p-3">Código</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3">Criada</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {(vendas || []).map((v: any) => (
                    <tr key={v.id} className="border-b border-white/5">
                      <td className="p-3 font-mono text-xs text-white/60">{v.codigo}</td>
                      <td className="p-3 text-white/85">{v.cliente_razao_social || '—'}</td>
                      <td className="p-3 text-xs text-white/60">{String(v.status).replace(/_/g, ' ')}</td>
                      <td className="p-3 text-right text-sol font-bold">{v.pv_total ? formatarMoedaBRL(v.pv_total) : '—'}</td>
                      <td className="p-3 text-xs text-white/50">{new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="p-3 text-right">
                        <Link href={`/projetos/${v.id}/venda-direta`} className="text-xs text-sol hover:underline">Abrir →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
