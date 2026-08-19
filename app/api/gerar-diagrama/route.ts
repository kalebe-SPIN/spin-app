import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executarProjetista } from '@/lib/projetista/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

const BUCKET_DIAGRAMAS = 'projetos-diagramas'

export async function POST(req: NextRequest) {
  let diagramaId: string | null = null

  try {
    const body = await req.json()
    const { diagrama_id, projeto_id, tipo_desenho } = body

    if (!diagrama_id || !projeto_id) {
      return NextResponse.json({ erro: 'diagrama_id e projeto_id obrigatórios' }, { status: 400 })
    }

    diagramaId = diagrama_id
    const supabaseAdmin = createAdminClient()

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      await marcarErro(supabaseAdmin, diagrama_id, 'ANTHROPIC_API_KEY não configurada no Vercel')
      return NextResponse.json({ erro: 'ANTHROPIC_API_KEY faltando' }, { status: 500 })
    }

    // 1. Carrega projeto
    const { data: projeto, error: pErr } = await supabaseAdmin
      .from('projetos').select('*').eq('id', projeto_id).maybeSingle()

    if (pErr || !projeto) {
      const msg = pErr?.message || `Projeto ${projeto_id} não existe`
      await marcarErro(supabaseAdmin, diagrama_id, `Projeto não encontrado: ${msg}`)
      return NextResponse.json({ erro: 'Projeto não encontrado', detalhes: msg }, { status: 404 })
    }

    // 2. Carrega config empresa
    const { data: configEmpresa } = await supabaseAdmin
      .from('configuracoes_empresa').select('*').eq('singleton', true).maybeSingle()

    if (!configEmpresa || !configEmpresa.rt_nome) {
      await marcarErro(supabaseAdmin, diagrama_id, 'Configuração da empresa incompleta')
      return NextResponse.json({ erro: 'Config empresa incompleta' }, { status: 400 })
    }

    // 3. Injeta telhado
    const { data: telhadoSecoes } = await supabaseAdmin
      .from('projetos_telhado_secoes').select('*').eq('projeto_id', projeto_id)
      .order('ordem', { ascending: true })
    ;(projeto as any).telhado_secoes = telhadoSecoes || []

    // 4. Se HÍBRIDO, busca dimensionamento + análise
    let hibridoDimensionamento: any = null
    let hibridoAnalise: any = null
    if (tipo_desenho === 'unifilar_hibrido') {
      const { data: dim } = await supabaseAdmin
        .from('projeto_hibrido_dimensionamento').select('*').eq('projeto_id', projeto_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      hibridoDimensionamento = dim

      const { data: ana } = await supabaseAdmin
        .from('projeto_hibrido_analise').select('*').eq('projeto_id', projeto_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      hibridoAnalise = ana
    }

    // 5. Se refinamento de versão anterior, carrega instrução
    const { data: diagramaRegistro } = await supabaseAdmin
      .from('projetos_diagramas').select('instrucao_ajuste, baseado_em_id')
      .eq('id', diagrama_id).maybeSingle()

    const instrucaoAjuste = diagramaRegistro?.instrucao_ajuste || undefined

    // 6. ═══ EXECUTA PIPELINE PROJETISTA SPIN (skill completa multi-etapa) ═══
    let resultado: Awaited<ReturnType<typeof executarProjetista>>
    try {
      resultado = await executarProjetista(
        {
          projeto,
          configEmpresa,
          tipoDesenho: tipo_desenho as 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao',
          hibridoDimensionamento,
          hibridoAnalise,
          instrucaoAjuste,
        },
        anthropicKey,
      )
    } catch (pipErr: any) {
      console.error('[gerar-diagrama] pipeline error:', pipErr)
      await marcarErro(supabaseAdmin, diagrama_id, `Pipeline projetista falhou: ${pipErr.message}`)
      return NextResponse.json({ erro: pipErr.message }, { status: 500 })
    }

    // 7. Valida SVG
    if (!resultado.svg || !resultado.svg.includes('<svg')) {
      await marcarErro(supabaseAdmin, diagrama_id, 'SVG ausente ou inválido no retorno do pipeline')
      return NextResponse.json({ erro: 'SVG inválido' }, { status: 500 })
    }

    // 8. Corrige namespaces XML antes de subir
    const svgLimpo = corrigirNamespacesSvg(resultado.svg)

    // 9. Upload do SVG
    const path = `${projeto_id}/${diagrama_id}/unifilar.svg`
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET_DIAGRAMAS)
      .upload(path, svgLimpo, { contentType: 'image/svg+xml', upsert: true })

    if (upErr) {
      console.error('[gerar-diagrama] upload error:', upErr)
      await marcarErro(supabaseAdmin, diagrama_id, `Upload falhou: ${upErr.message}`)
      return NextResponse.json({ erro: upErr.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET_DIAGRAMAS).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    // 10. Atualiza registro como PRONTO — incluindo relatório de auditoria
    const avisosFinais = [
      ...(resultado.avisos || []),
      ...(!resultado.auditoria.passou && resultado.auditoria.itens_falhados.length > 0
        ? [`🔍 Auditoria: ${resultado.auditoria.itens_falhados.length} pontos falharam após ${resultado.auditoria.tentativas} tentativa(s). Verifique visualmente.`]
        : []),
    ]

    const { error: updErr } = await supabaseAdmin
      .from('projetos_diagramas')
      .update({
        status: 'pronto',
        url_svg: publicUrl,
        memoria_calculo: {
          ...resultado.memoria_calculo,
          _meta: {
            template_usado: resultado.meta.template_usado,
            auditoria_passou: resultado.auditoria.passou,
            auditoria_tentativas: resultado.auditoria.tentativas,
            auditoria_itens_falhados: resultado.auditoria.itens_falhados,
            tempo_geracao_ms: resultado.meta.tempo_ms,
          },
        },
        avisos: avisosFinais,
        erro_mensagem: null,
      })
      .eq('id', diagrama_id)

    if (updErr) {
      console.error('[gerar-diagrama] update error:', updErr)
      return NextResponse.json({ erro: updErr.message }, { status: 500 })
    }

    // 11. Bidirecional: linkar homologação se existir
    try {
      const { data: hom } = await supabaseAdmin
        .from('homologacoes').select('id').eq('projeto_id', projeto_id).maybeSingle()

      if (hom) {
        await supabaseAdmin
          .from('homologacao_etapas')
          .update({
            status: 'em_andamento',
            iniciado_em: new Date().toISOString(),
            url_arquivo_svg: publicUrl,
            observacoes: `✓ Unifilar gerado via Projetista SPIN (template: ${resultado.meta.template_usado}, auditoria: ${resultado.auditoria.passou ? 'passou' : 'com ressalvas'}). Revise antes de marcar concluído.`,
          })
          .eq('homologacao_id', hom.id)
          .eq('chave', 'diagrama_unifilar')
      }
    } catch (linkErr) {
      console.error('[gerar-diagrama] falha ao vincular homologação:', linkErr)
    }

    return NextResponse.json({
      sucesso: true,
      url_svg: publicUrl,
      memoria_calculo: resultado.memoria_calculo,
      avisos: avisosFinais,
      auditoria: resultado.auditoria,
      meta: resultado.meta,
    })
  } catch (e: any) {
    console.error('[gerar-diagrama] exception:', e)
    if (diagramaId) {
      try {
        const supabaseAdmin = createAdminClient()
        await marcarErro(supabaseAdmin, diagramaId, `Exception: ${e.message}`)
      } catch {}
    }
    return NextResponse.json({ erro: e.message || 'Erro desconhecido' }, { status: 500 })
  }
}

async function marcarErro(supabaseAdmin: any, diagramaId: string, mensagem: string) {
  await supabaseAdmin
    .from('projetos_diagramas')
    .update({ status: 'erro', erro_mensagem: mensagem })
    .eq('id', diagramaId)
}

/**
 * Garante que o <svg root> tem xmlns padrão E xmlns:xlink quando usa xlink:href.
 * Sem xmlns:xlink declarado, browser recusa com "Namespace prefix xlink not defined".
 */
function corrigirNamespacesSvg(svg: string): string {
  const usaXlink = /xlink:href/.test(svg)
  const jaTemXmlnsXlink = /xmlns:xlink\s*=/.test(svg)
  const jaTemXmlns = /xmlns\s*=/.test(svg)

  return svg.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let novosAttrs = attrs
    if (!jaTemXmlns) novosAttrs = ' xmlns="http://www.w3.org/2000/svg"' + novosAttrs
    if (usaXlink && !jaTemXmlnsXlink) novosAttrs = ' xmlns:xlink="http://www.w3.org/1999/xlink"' + novosAttrs
    return `<svg${novosAttrs}>`
  })
}
