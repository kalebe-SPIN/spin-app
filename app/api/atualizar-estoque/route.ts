import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/atualizar-estoque
 *
 * Recebe PDF de estoque WEG e:
 * 1. Faz upload
 * 2. Registra histórico
 * 3. Extrai texto do PDF
 * 4. Para cada SKU encontrado (com 🟢 ou 🔴), atualiza produtos.disponivel_estoque
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (perfil?.role !== 'admin') {
    return NextResponse.json({ erro: 'Apenas admin' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient()

  try {
    const formData = await req.formData()
    const file = formData.get('arquivo') as File | null
    if (!file) return NextResponse.json({ erro: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    const path = `estoque/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    const { error: upErr } = await supabaseAdmin.storage
      .from('catalogo-uploads')
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (upErr) throw upErr

    const { data: histRow, error: histErr } = await supabaseAdmin
      .from('catalogo_uploads_historico')
      .insert({
        tipo: 'pdf_estoque',
        arquivo_nome_original: file.name,
        arquivo_url: path,
        arquivo_tamanho_kb: Math.round(buffer.length / 1024),
        status: 'processando',
        enviado_por: user.id,
      })
      .select()
      .single()
    if (histErr) throw histErr

    const historicoId = histRow!.id

    // Parse PDF — dynamic import
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const { text } = await parser.getText()

    // Extrai linhas com SAP + status
    const estoqueMap = new Map<string, { disponivel: boolean; previsao: string | null }>()
    for (const linha of (text || '').split('\n')) {
      const m = linha.match(/^(\d{7,8})\s+(.+?)\s+(🟢|🔴)\s*(.*?)$/)
      if (m) {
        const [, sap, _desc, status, previsao] = m
        const disponivel = status === '🟢'
        const prevMatch = previsao.match(/(\d{2}\/\d{2}\/\d{4})/)
        estoqueMap.set(sap, {
          disponivel,
          previsao: prevMatch ? prevMatch[1] : null,
        })
      }
    }

    // Atualiza cada produto
    let atualizados = 0
    for (const [sap, info] of estoqueMap.entries()) {
      const { error } = await supabaseAdmin
        .from('produtos')
        .update({ disponivel_estoque: info.disponivel })
        .eq('codigo_weg', sap)
      if (!error) atualizados++
    }

    await supabaseAdmin
      .from('catalogo_uploads_historico')
      .update({
        status: 'concluido',
        produtos_atualizados: atualizados,
        detalhes: { total_skus_no_pdf: estoqueMap.size },
        processado_em: new Date().toISOString(),
      })
      .eq('id', historicoId)

    return NextResponse.json({
      sucesso: true,
      produtos_atualizados: atualizados,
      total_skus_no_pdf: estoqueMap.size,
    })
  } catch (e: any) {
    console.error('[atualizar-estoque]', e)
    return NextResponse.json({ erro: e.message || 'Erro desconhecido' }, { status: 500 })
  }
}
