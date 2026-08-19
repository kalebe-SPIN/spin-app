import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarToken, corsHeaders, jsonCors, BUCKET_PROPOSTAS } from '@/lib/menu-handoff'

export const dynamic = 'force-dynamic'

/**
 * POST /api/menu/proposta/anexo
 * Body: { token, projetoId, path, tamanho }
 *
 * Confirma que o PDF subiu pro Storage e registra o anexo no projeto, pra
 * o consultor abrir o arquivo direto do card no CRM.
 *
 * Só aceita paths dentro da pasta do próprio consultor — impede que um token
 * válido registre arquivo de outra pessoa como anexo do projeto dele.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonCors({ ok: false, erro: 'Body inválido' }, origin, 400)
  }

  const sessao = await validarToken(String(body?.token || ''))
  if (!sessao) {
    return jsonCors({ ok: false, erro: 'Sessão inválida ou expirada' }, origin, 401)
  }

  const projetoId = String(body?.projetoId || '')
  const path = String(body?.path || '')
  const tamanho = Number(body?.tamanho) || null

  if (!projetoId || !path) {
    return jsonCors({ ok: false, erro: 'projetoId e path são obrigatórios' }, origin, 400)
  }

  // O path é sempre <consultor_id>/<projeto_id>/<arquivo>
  if (!path.startsWith(`${sessao.consultorId}/${projetoId}/`)) {
    return jsonCors({ ok: false, erro: 'Caminho de arquivo não autorizado' }, origin, 403)
  }

  const supabase = createAdminClient()

  // O projeto tem que ser mesmo do consultor dono do token
  const { data: projeto } = await supabase
    .from('projetos')
    .select('id, codigo, consultor_id')
    .eq('id', projetoId)
    .maybeSingle()

  if (!projeto || projeto.consultor_id !== sessao.consultorId) {
    return jsonCors({ ok: false, erro: 'Projeto não encontrado' }, origin, 404)
  }

  const nomeArquivo = path.split('/').pop() || `Proposta-${projeto.codigo}.pdf`

  const { error } = await supabase.from('projetos_anexos').insert({
    projeto_id: projetoId,
    categoria: 'proposta_comercial',
    descricao: 'Proposta em PDF emitida pelo catálogo (menu.spinsolar.com.br)',
    url_storage: path,
    nome_arquivo: nomeArquivo,
    tamanho_bytes: tamanho,
    mime_type: 'application/pdf',
    uploaded_by: sessao.consultorId,
  })

  if (error) {
    console.error('[menu/proposta/anexo] erro ao registrar:', error.message)
    return jsonCors({ ok: false, erro: 'Erro ao anexar o PDF ao projeto' }, origin, 500)
  }

  const { data: pub } = supabase.storage.from(BUCKET_PROPOSTAS).getPublicUrl(path)

  return jsonCors({ ok: true, url: pub?.publicUrl || null, codigo: projeto.codigo }, origin)
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}
