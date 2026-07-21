import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompts/gerar-diagrama'

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
    const supabase = createClient()
    const supabaseAdmin = createAdminClient()

    // Chave Anthropic
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      await marcarErro(supabaseAdmin, diagrama_id, 'ANTHROPIC_API_KEY não configurada no Vercel. Configure em Settings → Environment Variables.')
      return NextResponse.json({ erro: 'ANTHROPIC_API_KEY faltando' }, { status: 500 })
    }

    // 1. Carrega projeto — usa ADMIN client (bypass RLS)
    // Rota interna acionada por action autorizada, seguro usar admin aqui
    const { data: projeto, error: pErr } = await supabaseAdmin
      .from('projetos')
      .select('*')
      .eq('id', projeto_id)
      .maybeSingle()

    if (pErr || !projeto) {
      const msg = pErr?.message || `Projeto ${projeto_id} não existe no banco`
      await marcarErro(supabaseAdmin, diagrama_id, `Projeto não encontrado: ${msg}`)
      return NextResponse.json({ erro: 'Projeto não encontrado', detalhes: msg }, { status: 404 })
    }

    // 2. Carrega config empresa
    const { data: configEmpresa } = await supabaseAdmin
      .from('configuracoes_empresa')
      .select('*')
      .eq('singleton', true)
      .maybeSingle()

    if (!configEmpresa || !configEmpresa.rt_nome) {
      await marcarErro(supabaseAdmin, diagrama_id, 'Configuração da empresa incompleta')
      return NextResponse.json({ erro: 'Config empresa incompleta' }, { status: 400 })
    }

    // 3.0 Busca seções do telhado (tabela separada) e injeta no projeto
    // pra que o prompt Claude tenha acesso via projeto.telhado_secoes
    const { data: telhadoSecoes } = await supabaseAdmin
      .from('projetos_telhado_secoes')
      .select('*')
      .eq('projeto_id', projeto_id)
      .order('ordem', { ascending: true })

    ;(projeto as any).telhado_secoes = telhadoSecoes || []

    // 3. Validação mínima
    const faltando: string[] = []
    if (!projeto.analise_fatura) faltando.push('análise da fatura (Passo 2)')
    if (!telhadoSecoes || telhadoSecoes.length === 0) faltando.push('telhado (Passo 3)')
    if (!projeto.padrao_entrada) faltando.push('padrão de entrada (Passo 4)')
    // kit_selecionado é ideal mas não bloqueia — Claude pode sugerir a partir do dimensionado

    if (faltando.length > 0) {
      const msg = `Dados incompletos: falta ${faltando.join(', ')}. Preencha antes de gerar o diagrama.`
      await marcarErro(supabaseAdmin, diagrama_id, msg)
      return NextResponse.json({ erro: msg }, { status: 400 })
    }

    // 3.5. Se HÍBRIDO, busca dimensionamento + análise do wizard híbrido
    let hibridoDimensionamento: any = null
    let hibridoAnalise: any = null
    if (tipo_desenho === 'unifilar_hibrido') {
      const { data: dim } = await supabaseAdmin
        .from('projeto_hibrido_dimensionamento')
        .select('*')
        .eq('projeto_id', projeto_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      hibridoDimensionamento = dim

      const { data: ana } = await supabaseAdmin
        .from('projeto_hibrido_analise')
        .select('*')
        .eq('projeto_id', projeto_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      hibridoAnalise = ana
    }

    // 4. Chama Claude API
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt({
      projeto,
      configEmpresa,
      tipoDesenho: tipo_desenho as 'unifilar_ongrid' | 'unifilar_hibrido',
      hibridoDimensionamento,
      hibridoAnalise,
    })

    let response
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
    } catch (aiErr: any) {
      console.error('[gerar-diagrama] Anthropic error:', aiErr)
      await marcarErro(supabaseAdmin, diagrama_id, `Erro na API Claude: ${aiErr.message}`)
      return NextResponse.json({ erro: aiErr.message }, { status: 500 })
    }

    // 5. Extrai JSON da resposta
    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
    const rawText = textBlock?.text || ''

    // Extrai bloco JSON (dentro de ```json ... ``` ou solto)
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) {
      await marcarErro(supabaseAdmin, diagrama_id, 'Claude não retornou JSON válido')
      return NextResponse.json({ erro: 'Resposta inválida do Claude', raw: rawText.slice(0, 500) }, { status: 500 })
    }

    let parsed: { svg: string; memoria_calculo: any; avisos: string[] }
    try {
      parsed = JSON.parse(jsonMatch[1])
    } catch (parseErr: any) {
      await marcarErro(supabaseAdmin, diagrama_id, `JSON inválido: ${parseErr.message}`)
      return NextResponse.json({ erro: 'JSON parse failed', raw: jsonMatch[1].slice(0, 500) }, { status: 500 })
    }

    if (!parsed.svg || !parsed.svg.includes('<svg')) {
      await marcarErro(supabaseAdmin, diagrama_id, 'SVG ausente ou inválido na resposta')
      return NextResponse.json({ erro: 'SVG inválido' }, { status: 500 })
    }

    // 5.5 Pos-processa o SVG:
    // - Se usa xlink:href mas nao declarou xmlns:xlink no root, adiciona.
    //   Sem isso, o SVG quebra ao abrir direto no browser (parser estrito).
    // - Se nao tem xmlns padrao, adiciona tambem (defesa em profundidade).
    const svgLimpo = corrigirNamespacesSvg(parsed.svg)

    // 6. Upload do SVG
    const path = `${projeto_id}/${diagrama_id}/unifilar.svg`
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET_DIAGRAMAS)
      .upload(path, svgLimpo, {
        contentType: 'image/svg+xml',
        upsert: true,
      })

    if (upErr) {
      console.error('[gerar-diagrama] upload error:', upErr)
      await marcarErro(supabaseAdmin, diagrama_id, `Upload falhou: ${upErr.message}`)
      return NextResponse.json({ erro: upErr.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET_DIAGRAMAS).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    // 7. Atualiza registro como PRONTO
    const { error: updErr } = await supabaseAdmin
      .from('projetos_diagramas')
      .update({
        status: 'pronto',
        url_svg: publicUrl,
        memoria_calculo: parsed.memoria_calculo,
        avisos: parsed.avisos || [],
        erro_mensagem: null,
      })
      .eq('id', diagrama_id)

    if (updErr) {
      console.error('[gerar-diagrama] update error:', updErr)
      return NextResponse.json({ erro: updErr.message }, { status: 500 })
    }

    // 8. Bidirecional: se este projeto tem homologação, atualiza a etapa
    // 'diagrama_unifilar' com a URL do SVG gerado
    try {
      const { data: hom } = await supabaseAdmin
        .from('homologacoes')
        .select('id')
        .eq('projeto_id', projeto_id)
        .maybeSingle()

      if (hom) {
        await supabaseAdmin
          .from('homologacao_etapas')
          .update({
            status: 'em_andamento',
            iniciado_em: new Date().toISOString(),
            url_arquivo_svg: publicUrl,
            observacoes: '✓ Unifilar gerado via IA (Claude). Revise antes de marcar concluído.',
          })
          .eq('homologacao_id', hom.id)
          .eq('chave', 'diagrama_unifilar')
      }
    } catch (linkErr) {
      console.error('[gerar-diagrama] falha ao vincular à homologação:', linkErr)
      // Não bloqueia — o diagrama já foi gerado
    }

    return NextResponse.json({
      sucesso: true,
      url_svg: publicUrl,
      memoria_calculo: parsed.memoria_calculo,
      avisos: parsed.avisos,
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
 * Garante que o <svg root> tem xmlns padrao E xmlns:xlink quando usa xlink:href.
 * Sem xmlns:xlink declarado, o browser recusa o arquivo com:
 *   "Namespace prefix xlink for href on image is not defined"
 * (bug real reportado pelo Kalebe em 21/07/2026)
 */
function corrigirNamespacesSvg(svg: string): string {
  const usaXlink = /xlink:href/.test(svg)
  const jaTemXmlnsXlink = /xmlns:xlink\s*=/.test(svg)
  const jaTemXmlns = /xmlns\s*=/.test(svg)

  return svg.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let novosAttrs = attrs
    if (!jaTemXmlns) {
      novosAttrs = ' xmlns="http://www.w3.org/2000/svg"' + novosAttrs
    }
    if (usaXlink && !jaTemXmlnsXlink) {
      novosAttrs = ' xmlns:xlink="http://www.w3.org/1999/xlink"' + novosAttrs
    }
    return `<svg${novosAttrs}>`
  })
}
