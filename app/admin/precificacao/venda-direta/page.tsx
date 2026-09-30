import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { paramsToRecord } from '@/lib/precificacao/calcular'
import { PARAMETROS_VENDA_DIRETA } from '@/lib/precificacao/venda-direta'
import { PrecificacaoVendaDiretaClient } from '@/components/venda-direta/PrecificacaoVendaDiretaClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * /admin/precificacao/venda-direta — estrutura de preço da venda de
 * equipamentos + cupons de desconto (Kalebe 2026-09-30). Só admin.
 */
export default async function PrecificacaoVendaDiretaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">Precificação é exclusiva do admin.</p>
        </div>
      </main>
    )
  }

  const chaves = PARAMETROS_VENDA_DIRETA.map((p) => p.chave)
  const [{ data: paramsRows }, { data: detalhes }, { data: cupons, error: eCupons }, { data: usos }, { data: log }] = await Promise.all([
    supabase.from('parametros_precificacao').select('chave, valor_numero, valor_json, unidade').eq('ativo', true).is('vigente_ate', null),
    supabase.from('parametros_precificacao')
      .select('chave, valor_numero, unidade, valor_minimo, valor_maximo, vigente_de')
      .in('chave', chaves).is('vigente_ate', null),
    supabase.from('cupons_desconto').select('*').order('criado_em', { ascending: false }),
    supabase.from('cupons_usos').select('cupom_id, desconto_valor'),
    supabase.from('parametros_precificacao_log')
      .select('parametro_chave, valor_anterior, valor_novo, motivo, created_at')
      .in('parametro_chave', chaves).order('created_at', { ascending: false }).limit(15),
  ])

  const usosPorCupom: Record<string, { qtd: number; total: number }> = {}
  for (const u of (usos || []) as any[]) {
    const x = (usosPorCupom[u.cupom_id] ||= { qtd: 0, total: 0 })
    x.qtd += 1
    x.total += Number(u.desconto_valor) || 0
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="max-w-screen-xl mx-auto">
        <header className="mb-6">
          <div className="flex gap-4 text-xs mb-2">
            <Link href="/admin/precificacao" className="text-white/40 hover:text-white/60">← Precificação</Link>
            <Link href="/venda-direta" className="text-white/40 hover:text-white/60">Vendas diretas</Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white">📦 Venda de equipamentos — preço e cupons</h1>
          <p className="text-white/60 text-xs mt-1">
            Parâmetros próprios da venda direta (não mexem na proposta fotovoltaica). Toda mudança fica registrada com motivo e data.
          </p>
        </header>
        <PrecificacaoVendaDiretaClient
          params={paramsToRecord(paramsRows || [])}
          detalhes={(detalhes || []) as any[]}
          cupons={eCupons ? null : ((cupons || []) as any[])}
          usosPorCupom={usosPorCupom}
          log={(log || []) as any[]}
        />
      </div>
    </main>
  )
}
