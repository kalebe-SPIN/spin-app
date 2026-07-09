import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/importar-planilha-weg
 *
 * Recebe planilha Excel WEG (aba "Composição Preços") e:
 * 1. Faz upload no bucket catalogo-uploads
 * 2. Registra em catalogo_uploads_historico como 'processando'
 * 3. Parseia com xlsx
 * 4. Atualiza tabelas produtos + precos_produtos
 * 5. Atualiza histórico como 'concluido' com stats
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  // Confirma admin
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

    // 1. Upload no bucket
    const path = `planilhas/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    const { error: upErr } = await supabaseAdmin.storage
      .from('catalogo-uploads')
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (upErr) throw upErr

    // 2. Registra histórico
    const { data: histRow, error: histErr } = await supabaseAdmin
      .from('catalogo_uploads_historico')
      .insert({
        tipo: 'planilha_precos',
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

    // 3. Parse Excel — dynamic import (xlsx é pesado)
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const composicao = XLSX.utils.sheet_to_json(workbook.Sheets['Composição Preços'], {
      header: 1,
      defval: '',
    }) as any[][]

    // Parse produtos: linhas 1-4 são módulos, linhas 7+ são inversores
    const produtos: any[] = []
    const codigosVistos = new Set<string>()

    // Módulos
    for (let i = 1; i <= 4; i++) {
      const l = composicao[i]
      if (!l || !l[2]) continue
      const [nome, tipo, sap, unitario, unitarioComFrete, _fator, wp, _rsWp, fabricante, area, largura, modelo] = l
      if (!sap || codigosVistos.has(String(sap))) continue
      codigosVistos.add(String(sap))
      produtos.push({
        categoria: 'placa',
        subcategoria: 'modulo_fotovoltaico',
        codigo_weg: String(sap),
        modelo: modelo || nome,
        fabricante: fabricante || 'WEG',
        descricao_curta: nome,
        specs: {
          potencia_wp: Number(wp) || null,
          area_m2: Number(area) || null,
          largura_mm: Number(largura) || null,
          tipo_celula: tipo || null,
        },
        preco_unitario: Number(unitario) || null,
        preco_com_frete: Number(unitarioComFrete) || null,
      })
    }

    // Inversores
    for (let i = 7; i < composicao.length; i++) {
      const l = composicao[i]
      if (!l || !l[2]) break
      const [nome, tipo, sap, unitario, unitarioComFrete, _, kw, disjuntorEq, entradas] = l
      if (!sap || !nome) continue
      if (codigosVistos.has(String(sap))) continue
      codigosVistos.add(String(sap))

      let categoria: string = 'inversor'
      let subcategoria = 'inversor_string'
      const tipoLower = String(tipo).toLowerCase()
      if (tipoLower.includes('micro')) subcategoria = 'microinversor'
      if (tipoLower.includes('bomba')) subcategoria = 'inversor_bombeamento'
      if (tipoLower.includes('monitoramento')) { categoria = 'monitoramento'; subcategoria = 'gateway' }
      if (tipoLower.includes('otimizador')) subcategoria = 'otimizador'

      produtos.push({
        categoria,
        subcategoria,
        codigo_weg: String(sap),
        modelo: nome,
        fabricante: 'WEG',
        descricao_curta: `${nome} — ${tipo}`,
        specs: {
          potencia_kw: Number(kw) || null,
          tensao_desc: tipo || null,
          disjuntor_equivalente: disjuntorEq || null,
          entradas_mppt: Number(entradas) || null,
        },
        preco_unitario: Number(unitario) || null,
        preco_com_frete: Number(unitarioComFrete) || null,
      })
    }

    // 4. Upsert produtos (mantém url_datasheet se já existir!)
    let atualizados = 0, criados = 0
    for (const p of produtos) {
      const { data: existente } = await supabaseAdmin
        .from('produtos')
        .select('id, url_datasheet')
        .eq('codigo_weg', p.codigo_weg)
        .maybeSingle()

      if (existente) {
        const { error } = await supabaseAdmin
          .from('produtos')
          .update({
            modelo: p.modelo,
            fabricante: p.fabricante,
            categoria: p.categoria,
            subcategoria: p.subcategoria,
            descricao_curta: p.descricao_curta,
            specs: p.specs,
            ativo: true,
          })
          .eq('id', existente.id)
        if (!error) atualizados++
      } else {
        const { error } = await supabaseAdmin
          .from('produtos')
          .insert({
            codigo_weg: p.codigo_weg,
            modelo: p.modelo,
            fabricante: p.fabricante,
            categoria: p.categoria,
            subcategoria: p.subcategoria,
            descricao_curta: p.descricao_curta,
            specs: p.specs,
            ativo: true,
            disponivel_estoque: true,
          })
        if (!error) criados++
      }

      // Preço vigente
      if (p.preco_unitario || p.preco_com_frete) {
        const { data: prod } = await supabaseAdmin
          .from('produtos')
          .select('id')
          .eq('codigo_weg', p.codigo_weg)
          .single()
        if (prod) {
          // Encerra preço anterior vigente
          await supabaseAdmin
            .from('precos_produtos')
            .update({ vigente_ate: new Date().toISOString().slice(0, 10) })
            .eq('produto_id', prod.id)
            .is('vigente_ate', null)
          // Cria novo preço vigente
          await supabaseAdmin
            .from('precos_produtos')
            .insert({
              produto_id: prod.id,
              preco_venda: p.preco_com_frete || p.preco_unitario,
              preco_custo: p.preco_unitario || (p.preco_com_frete || 0.01),
              vigente_de: new Date().toISOString().slice(0, 10),
            })
        }
      }
    }

    // 5. Atualiza histórico
    await supabaseAdmin
      .from('catalogo_uploads_historico')
      .update({
        status: 'concluido',
        produtos_atualizados: atualizados,
        produtos_criados: criados,
        processado_em: new Date().toISOString(),
      })
      .eq('id', historicoId)

    return NextResponse.json({
      sucesso: true,
      produtos_atualizados: atualizados,
      produtos_criados: criados,
      total_processados: produtos.length,
    })
  } catch (e: any) {
    console.error('[importar-planilha-weg]', e)
    return NextResponse.json({ erro: e.message || 'Erro desconhecido' }, { status: 500 })
  }
}
