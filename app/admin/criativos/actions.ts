'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CriativoTipo = 'imagem' | 'video' | 'pdf' | 'texto'

async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Somente admin' as const }
  return { userId: user.id }
}

export async function criarCriativoAction(input: {
  tipo: CriativoTipo
  titulo: string
  descricao?: string | null
  categoria?: string | null
  arquivo_url?: string | null   // path no bucket (client já fez upload)
  texto?: string | null          // conteúdo se tipo='texto'
  mensagem_whatsapp_template?: string | null
}) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  if (!input.titulo?.trim()) return { erro: 'Título obrigatório' }
  if (input.tipo === 'texto') {
    if (!input.texto?.trim()) return { erro: 'Conteúdo de texto obrigatório pra tipo texto' }
  } else {
    if (!input.arquivo_url?.trim()) return { erro: 'Arquivo obrigatório pra tipo ' + input.tipo }
  }

  const supabase = createClient()
  const { data, error } = await supabase.from('criativos_vendas').insert({
    tipo: input.tipo,
    titulo: input.titulo.trim(),
    descricao: input.descricao?.trim() || null,
    categoria: input.categoria?.trim() || null,
    arquivo_url: input.tipo === 'texto' ? null : input.arquivo_url,
    texto: input.tipo === 'texto' ? input.texto?.trim() : null,
    mensagem_whatsapp_template: input.mensagem_whatsapp_template?.trim() || null,
    criado_por: check.userId,
  }).select('id').single()

  if (error) return { erro: error.message }

  revalidatePath('/admin/criativos')
  revalidatePath('/biblioteca')
  return { sucesso: true, id: data.id }
}

export async function editarCriativoAction(id: string, patch: {
  titulo?: string
  descricao?: string | null
  categoria?: string | null
  texto?: string | null
  mensagem_whatsapp_template?: string | null
}) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const update: Record<string, unknown> = {}
  if (patch.titulo !== undefined) {
    if (!patch.titulo.trim()) return { erro: 'Título não pode ficar vazio' }
    update.titulo = patch.titulo.trim()
  }
  if (patch.descricao !== undefined) update.descricao = patch.descricao?.trim() || null
  if (patch.categoria !== undefined) update.categoria = patch.categoria?.trim() || null
  if (patch.texto !== undefined) update.texto = patch.texto?.trim() || null
  if (patch.mensagem_whatsapp_template !== undefined) {
    update.mensagem_whatsapp_template = patch.mensagem_whatsapp_template?.trim() || null
  }

  const supabase = createClient()
  const { error } = await supabase.from('criativos_vendas').update(update).eq('id', id)
  if (error) return { erro: error.message }

  revalidatePath('/admin/criativos')
  revalidatePath('/biblioteca')
  return { sucesso: true }
}

export async function toggleAtivoCriativoAction(id: string, ativo: boolean) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase.from('criativos_vendas').update({ ativo }).eq('id', id)
  if (error) return { erro: error.message }

  revalidatePath('/admin/criativos')
  revalidatePath('/biblioteca')
  return { sucesso: true }
}

export async function excluirCriativoAction(id: string) {
  const check = await verificarAdmin()
  if ('erro' in check) return { erro: check.erro }

  const supabase = createClient()
  const { error } = await supabase.from('criativos_vendas').delete().eq('id', id)
  if (error) return { erro: error.message }

  revalidatePath('/admin/criativos')
  revalidatePath('/biblioteca')
  return { sucesso: true }
}
