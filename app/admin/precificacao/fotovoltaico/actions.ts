'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type EdicaoParametro =
  | { chave: string; valor_numero: number; motivo: string }
  | { chave: string; valor_json: unknown; motivo: string }

/**
 * Edita parâmetro fotovoltaico usando a RPC editar_parametro_precificacao
 * (SCD Type 2 — encerra vigência antiga + cria novo registro + log).
 */
export async function editarParametroFotovoltaicoAction(
  edicao: EdicaoParametro,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Apenas admin pode editar' }

  if (!edicao.motivo || edicao.motivo.trim().length < 10) {
    return { erro: 'Motivo da alteração obrigatório (mín 10 caracteres)' }
  }

  const args: Record<string, unknown> = {
    p_chave: edicao.chave,
    p_motivo: edicao.motivo.trim(),
    p_valor_numero: null,
    p_valor_texto: null,
    p_valor_json: null,
  }
  if ('valor_numero' in edicao) args.p_valor_numero = edicao.valor_numero
  if ('valor_json' in edicao) args.p_valor_json = edicao.valor_json

  const { error } = await supabase.rpc('editar_parametro_precificacao', args)
  if (error) return { erro: error.message }

  revalidatePath('/admin/precificacao/fotovoltaico')
  revalidatePath('/admin/precificacao')
  return { sucesso: true }
}
