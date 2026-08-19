'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const }
  return { ok: true as const }
}

export async function criarCidadeAction(input: {
  cidade: string
  uf: string
  km: number
  observacao?: string | null
}) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  if (!input.cidade.trim()) return { erro: 'Nome da cidade obrigatório' }
  if (!input.uf.trim() || input.uf.length !== 2) return { erro: 'UF deve ter 2 letras' }
  if (input.km < 0) return { erro: 'KM deve ser ≥ 0' }

  const supabase = createClient()
  const { error } = await supabase.from('cidades_distancia').insert({
    cidade: input.cidade.trim(),
    uf: input.uf.trim().toUpperCase(),
    km: input.km,
    observacao: input.observacao?.trim() || null,
  })

  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/cidades')
  revalidatePath('/crm/servicos')
  return { sucesso: true }
}

export async function editarCidadeAction(id: string, patch: {
  cidade?: string
  uf?: string
  km?: number
  observacao?: string | null
}) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const update: Record<string, unknown> = {}
  if (patch.cidade !== undefined) {
    if (!patch.cidade.trim()) return { erro: 'Nome não pode ficar vazio' }
    update.cidade = patch.cidade.trim()
  }
  if (patch.uf !== undefined) {
    if (patch.uf.length !== 2) return { erro: 'UF deve ter 2 letras' }
    update.uf = patch.uf.trim().toUpperCase()
  }
  if (patch.km !== undefined) {
    if (patch.km < 0) return { erro: 'KM deve ser ≥ 0' }
    update.km = patch.km
  }
  if (patch.observacao !== undefined) update.observacao = patch.observacao?.trim() || null

  const supabase = createClient()
  const { error } = await supabase.from('cidades_distancia').update(update).eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/cidades')
  revalidatePath('/crm/servicos')
  return { sucesso: true }
}

export async function toggleAtivoCidadeAction(id: string, ativo: boolean) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase.from('cidades_distancia').update({ ativo }).eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/cidades')
  revalidatePath('/crm/servicos')
  return { sucesso: true }
}

export async function excluirCidadeAction(id: string) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase.from('cidades_distancia').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/cidades')
  revalidatePath('/crm/servicos')
  return { sucesso: true }
}
