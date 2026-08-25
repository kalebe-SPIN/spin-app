import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PainelPrecificacaoFotovoltaicoClient } from '@/components/PainelPrecificacaoFotovoltaicoClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Painel de precificação FOTOVOLTAICA — parâmetros do grupo 'fotovoltaico'
 * na tabela parametros_precificacao. Edição via RPC editar_parametro_precificacao
 * (SCD Type 2 automático + log). Só admin.
 *
 * Lê 4 parâmetros:
 *   - fv_faixas_preco_kwp (JSON com 5 faixas de porte)
 *   - fv_preco_kwh_celesc_medio
 *   - fv_fator_perda_sistema
 *   - fv_potencia_padrao_modulo_wp
 */
export default async function PainelPrecificacaoFotovoltaicoPage() {
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
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">
            Somente administradores podem editar precificação fotovoltaica.
          </p>
        </div>
      </main>
    )
  }

  const { data: parametros } = await supabase
    .from('parametros_precificacao')
    .select('id, chave, descricao, valor_numero, valor_json, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe, alterado_por, created_at')
    .eq('grupo', 'fotovoltaico')
    .is('vigente_ate', null)
    .eq('ativo', true)
    .order('chave')

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-screen-2xl mx-auto">
        <div className="mb-6">
          <Link href="/admin/precificacao" className="text-white/60 text-sm hover:text-white transition">
            ← Voltar ao hub de precificação
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white">
            ☀️ Precificação <span className="text-sol">Fotovoltaica</span>
          </h1>
          <p className="text-white/60 mt-2 text-sm leading-relaxed">
            Parâmetros lidos pelo <strong className="text-sol">Orçamento Rápido</strong> pra estimar em 30s
            e pelo <strong className="text-sol">Orçamento Formal</strong> do projeto.
            Toda alteração exige motivo (mín 10 chars) e fica registrada no log de auditoria.
          </p>
        </header>

        <PainelPrecificacaoFotovoltaicoClient parametros={parametros || []} />
      </div>
    </main>
  )
}
