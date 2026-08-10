'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Chat par-a-par entre vendedor_servicos e profissional_campo (mesma zona).
 *
 * Convenção: participante_a < participante_b (uuid lex). Uma thread ativa por
 * par (encerrada_em IS NULL). "Nova conversa" fecha a atual e cria outra —
 * histórico fica no banco pra auditoria mas some da UI.
 */

function ordenarPar(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** Retorna a thread ativa entre user e peer; cria uma se não existir. */
export async function obterOuCriarThreadPar(peerId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (peerId === user.id) return { erro: 'Não pode conversar consigo mesmo' }

  const [a, b] = ordenarPar(user.id, peerId)

  const { data: existente } = await supabase
    .from('chat_par_threads')
    .select('id')
    .eq('participante_a', a)
    .eq('participante_b', b)
    .is('encerrada_em', null)
    .maybeSingle()

  if (existente?.id) return { threadId: existente.id }

  const { data: nova, error } = await supabase
    .from('chat_par_threads')
    .insert({ participante_a: a, participante_b: b, criada_por: user.id })
    .select('id')
    .single()

  if (error) return { erro: error.message }
  return { threadId: nova.id }
}

export async function enviarMensagemParAction(peerId: string, conteudo: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (!conteudo.trim()) return { erro: 'Mensagem vazia' }

  const r = await obterOuCriarThreadPar(peerId)
  if (r.erro || !r.threadId) return { erro: r.erro || 'Falha ao abrir thread' }

  const { error } = await supabase
    .from('chat_par_mensagens')
    .insert({ thread_id: r.threadId, autor_id: user.id, conteudo: conteudo.trim() })

  if (error) return { erro: error.message }
  revalidatePath('/agenda')
  return { sucesso: true, threadId: r.threadId }
}

export async function novaConversaParAction(peerId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const [a, b] = ordenarPar(user.id, peerId)
  const agora = new Date().toISOString()

  // Fecha a thread ativa (se houver)
  await supabase
    .from('chat_par_threads')
    .update({ encerrada_em: agora })
    .eq('participante_a', a)
    .eq('participante_b', b)
    .is('encerrada_em', null)

  // Cria nova em seguida
  const { data: nova, error } = await supabase
    .from('chat_par_threads')
    .insert({ participante_a: a, participante_b: b, criada_por: user.id })
    .select('id')
    .single()

  if (error) return { erro: error.message }
  revalidatePath('/agenda')
  return { sucesso: true, threadId: nova.id }
}
