'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type EmpresaInput = {
  razao_social: string
  cnpj: string | null
  endereco: string | null
  telefone: string | null
  email: string | null
  site: string | null
  logo_url: string | null

  rt_nome: string
  rt_titulo: string
  rt_crea: string | null
  rt_art_padrao: string | null
  rt_telefone: string | null
  rt_email: string | null
  rt_assinatura_url: string | null
}

export async function salvarConfigEmpresaAction(input: EmpresaInput) {
  const supabase = createClient()

  // Verifica que é admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') {
    return { sucesso: false, erro: 'Apenas admin pode alterar dados da empresa' }
  }

  // Upsert singleton (só 1 registro)
  const { data: existente } = await supabase
    .from('configuracoes_empresa')
    .select('id')
    .eq('singleton', true)
    .single()

  const payload = { ...input, updated_at: new Date().toISOString() }

  let error: any
  if (existente) {
    const res = await supabase.from('configuracoes_empresa').update(payload).eq('id', existente.id)
    error = res.error
  } else {
    const res = await supabase.from('configuracoes_empresa').insert({ ...payload, singleton: true })
    error = res.error
  }

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath('/admin/empresa')
  return { sucesso: true }
}
