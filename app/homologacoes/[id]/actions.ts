'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function atualizarEtapaHomologacaoAction(input: {
  etapaId: string
  status?: string
  observacoes?: string
  urlPdf?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const patch: any = { updated_at: new Date().toISOString() }
  if (input.status) {
    patch.status = input.status
    if (input.status === 'em_andamento') patch.iniciado_em = new Date().toISOString()
    if (input.status === 'concluido')    patch.concluido_em = new Date().toISOString()
  }
  if (input.observacoes !== undefined) patch.observacoes = input.observacoes
  if (input.urlPdf) patch.url_arquivo_pdf = input.urlPdf

  const { data: etapa, error } = await supabase
    .from('homologacao_etapas')
    .update(patch)
    .eq('id', input.etapaId)
    .select('homologacao_id')
    .single()

  if (error) return { erro: error.message }

  // Se concluiu esta etapa, avança etapa_atual da homologação (se for a atual)
  if (input.status === 'concluido' && etapa) {
    const { data: proxPendente } = await supabase
      .from('homologacao_etapas')
      .select('ordem')
      .eq('homologacao_id', etapa.homologacao_id)
      .eq('status', 'pendente')
      .order('ordem', { ascending: true })
      .limit(1)
      .maybeSingle()

    // Verifica se todas foram concluídas
    const { count: pendentes } = await supabase
      .from('homologacao_etapas')
      .select('id', { count: 'exact', head: true })
      .eq('homologacao_id', etapa.homologacao_id)
      .neq('status', 'concluido')

    const patchHom: any = { updated_at: new Date().toISOString() }
    if (proxPendente) patchHom.etapa_atual = proxPendente.ordem
    if (pendentes === 0) patchHom.status_geral = 'aprovada'

    await supabase.from('homologacoes').update(patchHom).eq('id', etapa.homologacao_id)
  }

  if (etapa) revalidatePath(`/homologacoes/${etapa.homologacao_id}`)
  return { sucesso: true }
}

/**
 * Reprocessa TODOS os arquivos automáticos da homologação. Útil quando:
 *   - Um arquivo foi deletado por engano
 *   - Dados do projeto mudaram (ex: alterou kit) e quer regerar tudo
 *   - Chave Anthropic voltou a ter crédito e quer gerar o diagrama que faltou
 */
export async function reprocessarArquivosHomologacaoAction(homologacaoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  // Busca projeto vinculado
  const { data: hom } = await supabase
    .from('homologacoes')
    .select('projeto_id')
    .eq('id', homologacaoId)
    .single()

  if (!hom) return { erro: 'Homologação não encontrada' }

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { gerarArquivosAutomaticos } = await import('@/lib/homologacao/gerar-arquivos')
    const supabaseAdmin = createAdminClient()
    const resultados = await gerarArquivosAutomaticos(supabaseAdmin, hom.projeto_id, homologacaoId)
    revalidatePath(`/homologacoes/${homologacaoId}`)
    return { sucesso: true, resultados }
  } catch (e: any) {
    return { erro: e?.message || 'Erro ao reprocessar' }
  }
}
