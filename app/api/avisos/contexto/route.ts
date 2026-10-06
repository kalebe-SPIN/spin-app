import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Recados da Bianca de UM cliente (Kalebe 2026-10-06: "as demais situações
 * a Bianca deve avisar quando o usuário abre o card do cliente").
 * GET ?cliente_id= | ?projeto_id= | ?conversa_id=
 * Junta tudo que é do mesmo cliente: projetos dele e conversas dos contatos
 * dele. Devolve só os avisos/sugestões do usuário logado.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const p = req.nextUrl.searchParams
  let clienteId = p.get('cliente_id')
  const projetos = new Set<string>()
  const conversas = new Set<string>()
  const contatos = new Set<string>()
  const admin = createAdminClient()

  if (p.get('conversa_id')) {
    conversas.add(p.get('conversa_id')!)
    const { data: c } = await admin.from('wa_conversas').select('contato:contato_id(id, cliente_id, projeto_id)').eq('id', p.get('conversa_id')!).maybeSingle()
    const ct = (c as any)?.contato
    if (ct?.id) contatos.add(ct.id)
    if (ct?.projeto_id) projetos.add(ct.projeto_id)
    clienteId = clienteId || ct?.cliente_id || null
  }
  if (p.get('projeto_id')) {
    projetos.add(p.get('projeto_id')!)
    const { data: pr } = await admin.from('projetos').select('cliente_id').eq('id', p.get('projeto_id')!).maybeSingle()
    clienteId = clienteId || pr?.cliente_id || null
  }
  if (clienteId) {
    const { data: prs } = await admin.from('projetos').select('id').eq('cliente_id', clienteId)
    for (const x of prs || []) projetos.add(x.id)
    const { data: cts } = await admin.from('wa_contatos').select('id').eq('cliente_id', clienteId)
    for (const x of cts || []) contatos.add(x.id)
  }
  if (projetos.size) {
    const { data: cts } = await admin.from('wa_contatos').select('id').in('projeto_id', Array.from(projetos))
    for (const x of cts || []) contatos.add(x.id)
  }
  if (contatos.size) {
    const { data: cvs } = await admin.from('wa_conversas').select('id').in('contato_id', Array.from(contatos))
    for (const x of cvs || []) conversas.add(x.id)
  }
  if (!projetos.size && !conversas.size) return NextResponse.json({ avisos: [], sugestoes: [] })

  const filtros = [
    projetos.size ? `projeto_id.in.(${Array.from(projetos).join(',')})` : null,
    conversas.size ? `conversa_id.in.(${Array.from(conversas).join(',')})` : null,
  ].filter(Boolean).join(',')

  const [{ data: avisos }, { data: sugestoes }] = await Promise.all([
    admin.from('avisos_internos')
      .select('id, remetente_agente, titulo, mensagem, urgente, projeto_id, conversa_id, criado_em')
      .eq('destinatario_id', user.id).is('lido_em', null).or(filtros)
      .order('criado_em', { ascending: false }).limit(30),
    projetos.size
      ? admin.from('bianca_comunicacoes')
        .select('id, canal, mensagem, destinatario_nome, destinatario_telefone, link_wa, status, gatilho_chave, projeto_id, criado_em, projeto:projeto_id(codigo, cliente_razao_social)')
        .eq('usuario_id', user.id).eq('status', 'sugerida').in('projeto_id', Array.from(projetos))
        .order('criado_em', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as any[] }),
  ])
  return NextResponse.json({ avisos: avisos || [], sugestoes: sugestoes || [] })
}
