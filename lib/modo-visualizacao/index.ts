import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type ModoVisualizacao =
  | 'admin'
  | 'consultor'
  | 'representante'      // Kalebe 2026-09-06: perfil unificado (substitui o antigo 'vendedor_servicos')
  | 'profissional_campo'

/** @deprecated Compat: valores antigos que ainda podem existir em cookies/DB. */
export type ModoVisualizacaoLegado = ModoVisualizacao | 'vendedor_servicos'

const COOKIE_NAME = 'modo_visualizacao'

const MODOS_ADMIN: ModoVisualizacao[] = ['admin', 'consultor', 'representante', 'profissional_campo']

/** Normaliza modo legado ('vendedor_servicos' → 'representante'). */
function normalizarModo(m: string | undefined): ModoVisualizacao | undefined {
  if (m === 'vendedor_servicos') return 'representante'
  if (m && MODOS_ADMIN.includes(m as ModoVisualizacao)) return m as ModoVisualizacao
  return undefined
}

/**
 * Retorna o modo de visualização atual do usuário logado.
 *
 * Regras:
 *   - Usuário NÃO-admin: modo espelha o role real.
 *     • role 'representante' (novo) e 'representante' (legado) → modo 'representante'
 *     • role 'profissional_campo' → modo 'profissional_campo'
 *     • qualquer outro → modo 'consultor'
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
      perfil?.role === 'representante' || perfil?.role === 'vendedor_servicos' ? 'representante'
      : perfil?.role === 'profissional_campo' ? 'profissional_campo'
      : 'consultor'
    return { modo: modoDoRole, ehAdminReal: false, perfil }
  }

  const cookieValor = cookies().get(COOKIE_NAME)?.value
  const modo: ModoVisualizacao = normalizarModo(cookieValor) || 'admin'

  return { modo, ehAdminReal: true, perfil }
}
