'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Cidades no Spinzap (Kalebe 2026-10-14): "menu suspenso para escolher, com
 * opção de cadastrar nova quando não tiver ainda no registro". O registro é
 * cidades_distancia (mesmo de /admin/precificacao/cidades) — guarda o km até
 * a sede, que vira o deslocamento das propostas.
 */

export type CidadeRegistro = { id: string; cidade: string; uf: string; km: number }

export async function listarCidadesAction(): Promise<{ cidades: CidadeRegistro[] } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data, error } = await createAdminClient().from('cidades_distancia')
    .select('id, cidade, uf, km').eq('ativo', true)
  if (error) return { erro: error.message }
  const cidades = ((data || []) as any[])
    .map((c) => ({ id: c.id as string, cidade: String(c.cidade), uf: String(c.uf || '').toUpperCase(), km: Number(c.km) || 0 }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR') || a.uf.localeCompare(b.uf))
  return { cidades }
}

export async function cadastrarCidadeAction(input: { cidade: string; uf: string; km: number }): Promise<
  { cidade: CidadeRegistro } | { erro: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const nome = String(input.cidade || '').trim().replace(/\s+/g, ' ')
  const uf = String(input.uf || '').trim().toUpperCase()
  const km = Number(input.km)
  if (!nome) return { erro: 'Informe o nome da cidade' }
  if (!/^[A-Z]{2}$/.test(uf)) return { erro: 'UF com 2 letras' }
  if (!(km >= 0)) return { erro: 'Informe os km até a sede (Tijucas)' }
  const admin = createAdminClient()
  // Já existe (mesmo nome e UF, ignorando maiúsculas)? Usa a cadastrada
  const { data: ja } = await admin.from('cidades_distancia').select('id, cidade, uf, km, ativo').ilike('cidade', nome).eq('uf', uf).maybeSingle()
  if (ja) {
    if ((ja as any).ativo === false) await admin.from('cidades_distancia').update({ ativo: true }).eq('id', (ja as any).id)
    return { cidade: { id: (ja as any).id, cidade: (ja as any).cidade, uf: (ja as any).uf, km: Number((ja as any).km) || 0 } }
  }
  const { data: perfil } = await admin.from('profiles').select('nome_completo').eq('id', user.id).maybeSingle()
  const { data: nova, error } = await admin.from('cidades_distancia').insert({
    cidade: nome, uf, km, observacao: `Cadastrada pelo Spinzap por ${(perfil as any)?.nome_completo || 'usuário'}`,
  }).select('id, cidade, uf, km').single()
  if (error || !nova) return { erro: error?.message || 'Não consegui cadastrar' }
  revalidatePath('/admin/precificacao/cidades')
  return { cidade: { id: (nova as any).id, cidade: (nova as any).cidade, uf: (nova as any).uf, km: Number((nova as any).km) || 0 } }
}
