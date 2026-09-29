import { createClient } from '@/lib/supabase/server'
import { ContatosProjetoClient } from './ContatosProjetoClient'

/**
 * Contatos do projeto além do titular — decisor, financeiro, técnico.
 * Kalebe 2026-09-29: o cliente repassa no WhatsApp o contato do decisor e
 * ele cai aqui sozinho (cartão de contato) ou pelo botão do inbox.
 * Some sem erro se a migration 124 ainda não rodou.
 */
export async function ContatosProjetoCard({ projetoId }: { projetoId: string }) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projeto_contatos')
    .select('id, nome, telefone, email, papel, origem, criado_em')
    .eq('projeto_id', projetoId)
    .order('criado_em')
  if (error) return null
  return <ContatosProjetoClient projetoId={projetoId} contatos={data || []} />
}
