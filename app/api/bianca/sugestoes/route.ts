import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bianca/sugestoes
 *
 * Retorna sugestoes pendentes (status='sugerida') do usuario logado.
 * Usado pelo SinoBianca no header pra popular o popover sem trocar de pagina.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })

  const { data: sugestoes, error } = await supabase
    .from('bianca_comunicacoes')
    .select(`
      id, canal, mensagem, destinatario_nome, destinatario_telefone, link_wa,
      status, gatilho_chave, projeto_id, criado_em,
      projeto:projeto_id(codigo, cliente_razao_social)
    `)
    .eq('usuario_id', user.id)
    .eq('status', 'sugerida')
    .order('criado_em', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  return NextResponse.json({ sugestoes: sugestoes || [] })
}
