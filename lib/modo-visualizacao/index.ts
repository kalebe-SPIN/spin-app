import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type ModoVisualizacao = 'admin' | 'consultor' | 'vendedor_servicos'

const COOKIE_NAME = 'modo_visualizacao'

/**
 * Retorna o modo de visualização atual do usuário logado.
 *
 * Regras:
 *   - Se o usuário NÃO é admin no banco, sempre retorna 'consultor'
 *     (usuário comum não pode ver como admin nem que quisesse)
 *   - Se é admin, respeita o cookie. Sem cookie, default = 'admin'
 *
 * Modos disponíveis (só admin real pode alternar entre eles):
 *   - admin: visão completa do portal
 *   - consultor: simula um representante de solar
 *   - vendedor_servicos: simula um vendedor do Módulo Serviços (adicionado 2026-07-29)
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
    .select('role, pode_gerar_diagramas, nome_completo, avatar_url')
    .eq('id', user.id)
    .single()

  const ehAdminReal = perfil?.role === 'admin'

  if (!ehAdminReal) {
    return { modo: 'consultor', ehAdminReal: false, perfil }
  }

  const cookieValor = cookies().get(COOKIE_NAME)?.value
  const modo: ModoVisualizacao =
    cookieValor === 'consultor' || cookieValor === 'vendedor_servicos'
      ? cookieValor
      : 'admin'

  return { modo, ehAdminReal: true, perfil }
}
