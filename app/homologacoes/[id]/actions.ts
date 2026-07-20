'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ehPJ, todosDocumentosCompletos, type Socio } from '@/lib/homologacao/utils'

// ═══════════════════ TIPOS DE DOCUMENTO OBRIGATÓRIO ═══════════════════
export const TIPOS_DOC = {
  // ─── INFRAESTRUTURA (sempre) ───
  foto_disjuntor: {
    coluna: 'foto_disjuntor_url',
    coluna_at: 'foto_disjuntor_enviado_em',
    label: 'Foto do disjuntor geral (padrão de entrada)',
    accept: 'image/*',
    emoji: '⚡',
    grupo: 'infra' as const,
  },
  foto_padrao_entrada: {
    coluna: 'foto_padrao_entrada_url',
    coluna_at: 'foto_padrao_entrada_enviado_em',
    label: 'Foto do padrão de entrada (completo)',
    accept: 'image/*',
    emoji: '🔌',
    grupo: 'infra' as const,
  },
  foto_fachada: {
    coluna: 'foto_fachada_url',
    coluna_at: 'foto_fachada_enviado_em',
    label: 'Foto da fachada do imóvel',
    accept: 'image/*',
    emoji: '🏠',
    grupo: 'infra' as const,
  },
  pdf_fatura_instalacao: {
    coluna: 'pdf_fatura_instalacao_url',
    coluna_at: 'pdf_fatura_enviado_em',
    label: 'PDF da fatura da instalação (CELESC atual)',
    accept: 'application/pdf',
    emoji: '📄',
    grupo: 'infra' as const,
  },
  // ─── CLIENTE (sempre PF ou PJ) ───
  cnh_cliente: {
    coluna: 'cnh_cliente_url',
    coluna_at: 'cnh_cliente_enviado_em',
    label: 'CNH ou RG do cliente/representante',
    accept: 'application/pdf,image/*',
    emoji: '🪪',
    grupo: 'cliente' as const,
  },
  procuracao_cliente: {
    coluna: 'procuracao_cliente_url',
    coluna_at: 'procuracao_cliente_enviado_em',
    label: 'Procuração assinada digitalmente pelo cliente',
    accept: 'application/pdf',
    emoji: '✍️',
    grupo: 'cliente' as const,
  },
  // ─── PJ apenas ───
  cartao_cnpj: {
    coluna: 'cartao_cnpj_url',
    coluna_at: 'cartao_cnpj_enviado_em',
    label: 'Cartão CNPJ',
    accept: 'application/pdf',
    emoji: '🏢',
    grupo: 'pj' as const,
  },
  contrato_social: {
    coluna: 'contrato_social_url',
    coluna_at: 'contrato_social_enviado_em',
    label: 'Contrato Social (última alteração)',
    accept: 'application/pdf',
    emoji: '📜',
    grupo: 'pj' as const,
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

  // Busca projeto vinculado + todos os docs pra checar se completou
  const { data: hom } = await supabaseAdmin
    .from('homologacoes')
    .select(`
      projeto_id,
      foto_disjuntor_url, foto_padrao_entrada_url, foto_fachada_url, pdf_fatura_instalacao_url,
      cnh_cliente_url, procuracao_cliente_url,
      cartao_cnpj_url, contrato_social_url,
      docs_socios,
      projeto:projetos(cliente_cpf_cnpj, analise_fatura)
    `)
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

  // Verifica se completou TODOS os documentos → dispara geração
  const homAtualizada = { ...hom, [info.coluna]: url }
  const completos = todosDocumentosCompletos(homAtualizada)

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

// ═══════════════════ TOGGLE PADRÃO DE ENTRADA NOVO ═══════════════════

/**
 * Marca/desmarca que o projeto precisa de novo padrão de entrada CELESC.
 * Quando true: adiciona etapa 'padrao_entrada_novo' (ordem 7) e permite
 * gerar o SVG do diagrama do padrão.
 * Quando false: remove a etapa se ainda estiver pendente.
 */
export async function togglePadraoNovoAction(input: {
  homologacaoId: string
  precisa: boolean
  amperagem?: number
  observacao?: string
  grupoTarifa?: 'A' | 'B'
  tensaoV?: number
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabaseAdmin = createAdminClient()

  await supabaseAdmin
    .from('homologacoes')
    .update({
      precisa_padrao_novo: input.precisa,
      padrao_novo_amperagem: input.amperagem ?? null,
      padrao_novo_observacao: input.observacao ?? null,
      padrao_novo_grupo_tarifa: input.grupoTarifa ?? null,
      padrao_novo_tensao_v: input.tensaoV ?? null,
    })
    .eq('id', input.homologacaoId)

  if (input.precisa) {
    // Adiciona etapa 7 se não existir
    const { data: existente } = await supabaseAdmin
      .from('homologacao_etapas')
      .select('id')
      .eq('homologacao_id', input.homologacaoId)
      .eq('chave', 'padrao_entrada_novo')
      .maybeSingle()

    if (!existente) {
      await supabaseAdmin.from('homologacao_etapas').insert({
        homologacao_id: input.homologacaoId,
        ordem: 7,
        chave: 'padrao_entrada_novo',
        nome_exibicao: 'Diagrama Padrão de Entrada Novo',
        status: 'pendente',
      })
    }
  } else {
    // Remove etapa se ainda estiver pendente (não remove se já concluiu ou tem arquivo)
    await supabaseAdmin
      .from('homologacao_etapas')
      .delete()
      .eq('homologacao_id', input.homologacaoId)
      .eq('chave', 'padrao_entrada_novo')
      .eq('status', 'pendente')
  }

  revalidatePath(`/homologacoes/${input.homologacaoId}`)
  return { sucesso: true }
}

// ═══════════════════ SÓCIOS (PJ) ═══════════════════

export async function adicionarSocioAction(input: {
  homologacaoId: string
  nome: string
  cpf?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (!input.nome.trim()) return { erro: 'Nome do sócio obrigatório' }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabaseAdmin = createAdminClient()

  const { data: hom } = await supabaseAdmin
    .from('homologacoes')
    .select('docs_socios')
    .eq('id', input.homologacaoId)
    .single()

  if (!hom) return { erro: 'Homologação não encontrada' }

  const socios: Socio[] = hom.docs_socios || []
  const novoSocio: Socio = {
    id: crypto.randomUUID(),
    nome: input.nome.trim(),
    cpf: input.cpf?.trim(),
    cnh_url: null,
    procuracao_url: null,
    criado_em: new Date().toISOString(),
  }

  await supabaseAdmin
    .from('homologacoes')
    .update({
      docs_socios: [...socios, novoSocio],
      documentos_completos_em: null,  // bloqueia geração até novo sócio ter docs
    })
    .eq('id', input.homologacaoId)

  revalidatePath(`/homologacoes/${input.homologacaoId}`)
  return { sucesso: true, socio: novoSocio }
}

export async function removerSocioAction(input: {
  homologacaoId: string
  socioId: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabaseAdmin = createAdminClient()

  const { data: hom } = await supabaseAdmin
    .from('homologacoes')
    .select('docs_socios')
    .eq('id', input.homologacaoId)
    .single()

  if (!hom) return { erro: 'Homologação não encontrada' }

  const socios: Socio[] = hom.docs_socios || []
  const novosSocios = socios.filter((s) => s.id !== input.socioId)

  await supabaseAdmin
    .from('homologacoes')
    .update({ docs_socios: novosSocios })
    .eq('id', input.homologacaoId)

  revalidatePath(`/homologacoes/${input.homologacaoId}`)
  return { sucesso: true }
}

export async function uploadDocumentoSocioAction(input: {
  homologacaoId: string
  socioId: string
  campo: 'cnh_url' | 'procuracao_url'
  arquivoBase64: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const match = input.arquivoBase64.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return { erro: 'Arquivo inválido' }
  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabaseAdmin = createAdminClient()

  const { data: hom } = await supabaseAdmin
    .from('homologacoes')
    .select('projeto_id, docs_socios')
    .eq('id', input.homologacaoId)
    .single()

  if (!hom) return { erro: 'Homologação não encontrada' }

  const ext = mimeType === 'application/pdf' ? 'pdf'
    : mimeType.startsWith('image/') ? mimeType.split('/')[1] : 'bin'
  const nomeArquivo = input.campo === 'cnh_url' ? 'cnh' : 'procuracao'
  const caminho = `${hom.projeto_id}/${input.homologacaoId}/socios/${input.socioId}-${nomeArquivo}.${ext}`

  const { error: upErr } = await supabaseAdmin.storage
    .from('homologacao-consultor')
    .upload(caminho, buffer, { contentType: mimeType, upsert: true })

  if (upErr) return { erro: upErr.message }

  const { data: signed } = await supabaseAdmin.storage
    .from('homologacao-consultor')
    .createSignedUrl(caminho, 60 * 60 * 24 * 365)

  const url = signed?.signedUrl || ''
  const timestampCampo = input.campo === 'cnh_url' ? 'cnh_enviado_em' : 'procuracao_enviado_em'

  const socios: Socio[] = hom.docs_socios || []
  const novosSocios = socios.map((s) =>
    s.id === input.socioId
      ? { ...s, [input.campo]: url, [timestampCampo]: new Date().toISOString() }
      : s
  )

  await supabaseAdmin
    .from('homologacoes')
    .update({ docs_socios: novosSocios })
    .eq('id', input.homologacaoId)

  revalidatePath(`/homologacoes/${input.homologacaoId}`)
  return { sucesso: true, url }
}

// ═══════════════════ REMOVER DOCUMENTO ═══════════════════

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
    .select(`
      projeto_id,
      foto_disjuntor_url, foto_padrao_entrada_url, foto_fachada_url, pdf_fatura_instalacao_url,
      cnh_cliente_url, procuracao_cliente_url,
      cartao_cnpj_url, contrato_social_url,
      docs_socios,
      projeto:projetos(cliente_cpf_cnpj, analise_fatura)
    `)
    .eq('id', homologacaoId)
    .single()

  if (!hom) return { erro: 'Homologação não encontrada' }

  if (!todosDocumentosCompletos(hom)) {
    return {
      erro: 'Envie todos os documentos obrigatórios antes de gerar os arquivos (infraestrutura + CNH/procuração do cliente' +
        (ehPJ((hom as any).projeto?.cliente_cpf_cnpj) ? ' + CNPJ + contrato + sócios' : '') + ').',
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
