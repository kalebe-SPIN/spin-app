import { createClient } from '@/lib/supabase/server'

export type ConviteTrabalho = {
  id: string
  user_id: string
  nome_candidato: string
  email_candidato: string
  telefone: string | null
  cargo: string
  zona: string | null
  cidades: string[]
  tipo_proposta: 'comercial' | 'campo' | 'solar'
  status: 'enviado' | 'proposta_aceita' | 'contrato_assinado' | 'docs_enviados' | 'concluido' | 'recusado'
  entradas_usadas: number
  max_entradas: number
  bloqueado: boolean
  url_pdf_proposta: string | null
  proposta_aceita_em: string | null
  contrato_assinado_em: string | null
  docs_enviados_em: string | null
}

/**
 * Retorna o convite de trabalho do candidato logado (ou null).
 * Usa RLS: candidato só enxerga o próprio convite (policy convite_self_read).
 */
export async function getConviteAtual(): Promise<ConviteTrabalho | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('convites_trabalho')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return (data as ConviteTrabalho) || null
}
