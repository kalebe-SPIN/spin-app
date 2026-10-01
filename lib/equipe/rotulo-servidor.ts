import { createAdminClient } from '@/lib/supabase/admin'
import { montarRotulo } from './rotulo'

/**
 * "Primeiro nome · setor" do usuário que está enviando (Kalebe 2026-10-01).
 * Setor = o escolhido em /admin/usuarios (profiles.setor_mensagens, mig 134);
 * sem escolha, o único setor em que a pessoa está; em vários sem escolha → só
 * o nome. Sem a migration 134 cai no setor único / só o nome.
 */
export async function rotuloRemetente(userId: string, nomeCompleto: string | null | undefined): Promise<string> {
  const admin = createAdminClient()
  let setor: string | null = null
  const { data: p, error } = await admin.from('profiles').select('setor_mensagens').eq('id', userId).maybeSingle()
  if (!error && (p as any)?.setor_mensagens) setor = (p as any).setor_mensagens
  if (!setor) {
    const { data: ms } = await admin
      .from('grupos_membros')
      .select('grupo:grupo_id(chave, ativo)')
      .eq('usuario_id', userId)
      .is('bloqueado_em', null)
    const chaves = ((ms || []) as any[]).map((m) => m.grupo).filter((g) => g?.ativo).map((g) => g.chave as string)
    if (chaves.length === 1) setor = chaves[0]
  }
  return montarRotulo(nomeCompleto, setor)
}
