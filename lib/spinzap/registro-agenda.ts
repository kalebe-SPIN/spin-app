import type { createAdminClient } from '@/lib/supabase/admin'
import { gravarMensagem } from '@/lib/whatsapp/conversas'
import { ROTULO_TIPO_AGENDA, textoRegistroAgenda, type RegistroAgenda } from './agenda-rotulos'

/**
 * Registro da agenda na conversa (Kalebe 2026-10-19): "toda tarefa, lembrete
 * ou evento acionado na agenda do Spinzap, além de avisar o responsável, fica
 * registrado na conversa num template" — e o template é MÓVEL: enquanto está
 * aberto, o cartão acompanha a conversa (fica no rodapé, acima da caixa de
 * mensagem — agendaAbertaConversaAction); quando é executado e alguém clica
 * em "Concluído", ele se FIXA na linha do tempo (mensagem interna tipo
 * 'system', não vai pro cliente). Cancelar ou excluir também fixa o cartão.
 */

export type { RegistroAgenda } from './agenda-rotulos'

type Admin = ReturnType<typeof createAdminClient>

export async function registrarAgendaNaConversa(admin: Admin, conversaId: string | null | undefined, r: RegistroAgenda, remetenteId?: string | null) {
  if (!conversaId) return
  try {
    const registro: RegistroAgenda = {
      ...r,
      titulo: String(r.titulo || '').trim().slice(0, 200) || ROTULO_TIPO_AGENDA[r.tipo].nome,
      detalhe: r.detalhe ? String(r.detalhe).trim().slice(0, 400) : null,
    }
    await gravarMensagem(admin, {
      conversa_id: conversaId,
      direcao: 'outbound',
      tipo: 'system',
      texto: textoRegistroAgenda(registro),
      remetente_id: remetenteId || null,
      origem_agente_nome: 'Agenda',
      status_entrega: 'enviada',
      dados: { registro: 'agenda', agenda: registro },
    })
  } catch (e) {
    console.error('[registro-agenda]', e)
  }
}

/** Primeiro nome de um perfil (pro cartão). */
export async function primeiroNomePerfil(admin: Admin, id: string | null | undefined): Promise<string | null> {
  if (!id) return null
  const { data } = await admin.from('profiles').select('nome_completo').eq('id', id).maybeSingle()
  return String((data as any)?.nome_completo || '').trim().split(/\s+/)[0] || null
}
