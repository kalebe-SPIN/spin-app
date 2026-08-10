import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type ModoVisualizacao =
  | 'admin'
  | 'consultor'
  | 'vendedor_servicos'
  | 'profissional_campo'

const COOKIE_NAME = 'modo_visualizacao'

const MODOS_ADMIN: ModoVisualizacao[] = ['admin', 'consultor', 'vendedor_servicos', 'profissional_campo']

/**
 * Retorna o modo de visualização atual do usuário logado.
 *
 * Regras:
 *   - Usuário NÃO-admin: modo espelha o role real (vendedor_servicos e
 *     profissional_campo têm dashboards próprios; qualquer outro cai em
 *     'consultor').
 *   - Admin real: respeita o cookie entre os 4 modos. Default = 'admin'.
 */
export async function getModoVisualizacao(): Promise<{
  modo: ModoVisualizacao
  ehAdminReal: boolean
  perfil: any
}> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { modo: 'consultor', ehAdminReal: false, perfil: null }
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, pode_gerar_diagramas, nome_completo, avatar_url, zona, limite_horas_agenda')
    .eq('id', user.id)
    .single()

  const ehAdminReal = perfil?.role === 'admin'

  if (!ehAdminReal) {
    const modoDoRole: ModoVisualizacao =
      perfil?.role === 'vendedor_servicos' ? 'vendedor_servicos'
      : perfil?.role === 'profissional_campo' ? 'profissional_campo'
      : 'consultor'
    return { modo: modoDoRole, ehAdminReal: false, perfil }
  }

  const cookieValor = cookies().get(COOKIE_NAME)?.value as ModoVisualizacao | undefined
  const modo: ModoVisualizacao =
    cookieValor && MODOS_ADMIN.includes(cookieValor) ? cookieValor : 'admin'

  return { modo, ehAdminReal: true, perfil }
}
