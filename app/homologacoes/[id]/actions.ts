'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ═══════════════════ TIPOS DE DOCUMENTO OBRIGATÓRIO ═══════════════════
export const TIPOS_DOC = {
  foto_disjuntor: {
    coluna: 'foto_disjuntor_url',
    coluna_at: 'foto_disjuntor_enviado_em',
    label: 'Foto do disjuntor geral (padrão de entrada)',
    accept: 'image/*',
    emoji: '⚡',
  },
  foto_padrao_entrada: {
    coluna: 'foto_padrao_entrada_url',
    coluna_at: 'foto_padrao_entrada_enviado_em',
    label: 'Foto do padrão de entrada (completo)',
    accept: 'image/*',
    emoji: '🔌',
  },
  foto_fachada: {
    coluna: 'foto_fachada_url',
    coluna_at: 'foto_fachada_enviado_em',
    label: 'Foto da fachada do imóvel',
    accept: 'image/*',
    emoji: '🏠',
  },
  pdf_fatura_instalacao: {
    coluna: 'pdf_fatura_instalacao_url',
    coluna_at: 'pdf_fatura_enviado_em',
    label: 'PDF da fatura da instalação (CELESC atual)',
    accept: 'application/pdf',
    emoji: '📄',
  },
} as const

export type TipoDoc = keyof typeof TIPOS_DOC

/**
 * Upload de um dos 4 documentos obrigatórios do consultor.
 * Ao completar os 4, dispara geração dos arquivos automáticos das etapas.
 */
export async function uploadDocumentoHomologacaoAction(input: {
  homologacaoId: string
  tipo: TipoDoc
  arquivoBase64: string    // data URL "data:mime/type;base64,..."
  nomeOriginal: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const info = TIPOS_DOC[input.tipo]
  if (!info) return { erro: 'Tipo de documento inválido' }

  // Decode base64
  const match = input.arquivoBase64.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return { erro: 'Arquivo inválido — precisa ser data URL base64' }
  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabaseAdmin = createAdminClient()

  // Busca projeto vinculado pra montar caminho
  const { data: hom } = await supabaseAdmin
    .from('homologacoes')
    .select('projeto_id, foto_disjuntor_url, foto_padrao_entrada_url, foto_fachada_url, pdf_fatura_instalacao_url')
    .eq('id', input.homologacaoId)
    .single()

  if (!hom) return { erro: 'Homologação não encontrada' }

  // Extensão a partir do MIME
  const extensoes: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'application/pdf': 'pdf',
  }
  const ext = extensoes[mimeType] || 'bin'
  const caminho = `${hom.projeto_id}/${input.homologacaoId}/${input.tipo}.${ext}`

  const { error: upErr } = await supabaseAdmin.storage
    .from('homologacao-consultor')
    .upload(caminho, buffer, { contentType: mimeType, upsert: true })

  if (upErr) return { erro: upErr.message }

  // Signed URL (privado — expira em 1 ano)
  const { data: signed } = await supabaseAdmin.storage
    .from('homologacao-consultor')
    .createSignedUrl(caminho, 60 * 60 * 24 * 365)

  const url = signed?.signedUrl || ''
  const patch: any = {
    [info.coluna]: url,
    [info.coluna_at]: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await supabaseAdmin.from('homologacoes').update(patch).eq('id', input.homologacaoId)

  // Verifica se completou os 4 → dispara geração dos arquivos
  const homAtualizada = { ...hom, [info.coluna]: url }
  const completos = !!(
    homAtualizada.foto_disjuntor_url &&
    homAtualizada.foto_padrao_entrada_url &&
    homAtualizada.foto_fachada_url &&
    homAtualizada.pdf_fatura_instalacao_url
  )

  let geracaoDisparada = false
  if (completos) {
    await supabaseAdmin
      .from('homologacoes')
      .update({ documentos_completos_em: new Date().toISOString() })
      .eq('id', input.homologacaoId)

    try {
      const { gerarArquivosAutomaticos } = await import('@/lib/homologacao/gerar-arquivos')
      // Fire-and-forget — pode demorar
      gerarArquivosAutomaticos(supabaseAdmin, hom.projeto_id, input.homologacaoId)
        .catch((err) => console.error('[gerarArquivos pos-upload]', err))
      geracaoDisparada = true
    } catch (err) {
      console.error('[disparar geracao]', err)
    }
  }

  revalidatePath(`/homologacoes/${input.homologacaoId}`)
  return { sucesso: true, url, completos, geracaoDisparada }
}

export async function removerDocumentoHomologacaoAction(input: {
  homologacaoId: string
  tipo: TipoDoc
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const info = TIPOS_DOC[input.tipo]
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabaseAdmin = createAdminClient()

  await supabaseAdmin
    .from('homologacoes')
    .update({
      [info.coluna]: null,
      [info.coluna_at]: null,
      documentos_completos_em: null,  // volta a bloquear geração
    })
    .eq('id', input.homologacaoId)

  revalidatePath(`/homologacoes/${input.homologacaoId}`)
  return { sucesso: true }
}

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

  // Busca projeto vinculado + status dos uploads
  const { data: hom } = await supabase
    .from('homologacoes')
    .select('projeto_id, foto_disjuntor_url, foto_padrao_entrada_url, foto_fachada_url, pdf_fatura_instalacao_url')
    .eq('id', homologacaoId)
    .single()

  if (!hom) return { erro: 'Homologação não encontrada' }

  // Verifica se os 4 uploads obrigatórios foram feitos
  const faltando: string[] = []
  if (!hom.foto_disjuntor_url) faltando.push('foto do disjuntor')
  if (!hom.foto_padrao_entrada_url) faltando.push('foto do padrão de entrada')
  if (!hom.foto_fachada_url) faltando.push('foto da fachada')
  if (!hom.pdf_fatura_instalacao_url) faltando.push('PDF da fatura')

  if (faltando.length > 0) {
    return {
      erro: `Envie primeiro os documentos obrigatórios do consultor: ${faltando.join(', ')}.`,
    }
  }

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
