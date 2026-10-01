'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { aceitarLead } from '@/lib/whatsapp/broadcast'

/**
 * Aceitar lead pelo portal (Kalebe 2026-10-01) — mesmo efeito de responder
 * ACEITAR no WhatsApp: entra na fila por ordem de aceite; o primeiro fica no
 * volante com 8 min pra contatar o cliente e vira o responsável da conversa.
 */
export async function aceitarLeadPortalAction(broadcastId: string): Promise<{ erro: string } | void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase.from('profiles').select('role, ativo').eq('id', user.id).maybeSingle()
  if (!perfil?.ativo || !['representante', 'admin'].includes(String(perfil.role))) {
    return { erro: 'Só representantes e admins aceitam leads' }
  }
  const r = await aceitarLead({ broadcast_id: broadcastId, representante_id: user.id })
  if ('erro' in r) return { erro: r.erro }
  redirect(`/leads/aceitar/${broadcastId}?ok=${r.no_volante ? 'volante' : `fila-${r.posicao}`}`)
}
