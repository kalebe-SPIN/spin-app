import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * API que orquestra a geração do diagrama.
 *
 * Fluxo (a ser implementado):
 *   1. Carrega projeto + kit + config empresa (snapshot já capturado em actions.ts)
 *   2. Chama Claude API com skill /mestre-da-eletrica → consolida dimensionamento
 *   3. Chama skill projetista-spin → produz SVG do unifilar
 *   4. Renderiza SVG em PDF (via headless chrome ou lib)
 *   5. Converte SVG em DXF (via svg2dxf ou geração direta com ezdxf)
 *   6. Upload no Supabase Storage → grava URLs em projetos_diagramas
 *   7. Atualiza status = 'pronto'
 *
 * Este stub apenas marca o registro como "aguardando_backend" pra provar o fluxo end-to-end.
 * Substitua o bloco TODO abaixo pela integração real com Claude API.
 */
export async function POST(req: NextRequest) {
  try {
    const { diagrama_id, projeto_id, tipo_desenho } = await req.json()

    if (!diagrama_id || !projeto_id) {
      return NextResponse.json({ erro: 'diagrama_id e projeto_id obrigatórios' }, { status: 400 })
    }

    const supabase = createClient()

    // 1. Carrega dados do projeto
    const { data: projeto, error: pErr } = await supabase
      .from('projetos')
      .select('*')
      .eq('id', projeto_id)
      .single()

    if (pErr || !projeto) {
      await marcarErro(supabase, diagrama_id, `Projeto não encontrado: ${pErr?.message}`)
      return NextResponse.json({ erro: 'Projeto não encontrado' }, { status: 404 })
    }

    // 2. Validação mínima — precisa dos dados dos 4 passos
    const faltando: string[] = []
    if (!projeto.analise_fatura) faltando.push('análise da fatura (Passo 2)')
    if (!projeto.telhado_secoes || projeto.telhado_secoes.length === 0) faltando.push('telhado (Passo 3)')
    if (!projeto.padrao_entrada) faltando.push('padrão de entrada (Passo 4)')
    if (!projeto.kit_selecionado) faltando.push('kit vendido')

    if (faltando.length > 0) {
      const msg = `Dados incompletos: falta ${faltando.join(', ')}`
      await marcarErro(supabase, diagrama_id, msg)
      return NextResponse.json({ erro: msg }, { status: 400 })
    }

    // TODO: integração real com Claude API + skills
    // Por ora, apenas marca como aguardando backend real
    const { error: upErr } = await supabase
      .from('projetos_diagramas')
      .update({
        status: 'erro',
        erro_mensagem: 'Backend de renderização ainda não conectado. Fluxo validado — próximo passo: acoplar Claude API com skills /mestre-da-eletrica + projetista-spin.',
      })
      .eq('id', diagrama_id)

    if (upErr) console.error('[gerar-diagrama] erro update:', upErr)

    return NextResponse.json({
      sucesso: true,
      status: 'aguardando_backend',
      mensagem: 'Fluxo validado. Backend real precisa ser conectado.',
      dados_projeto_ok: true,
    })
  } catch (e: any) {
    console.error('[gerar-diagrama] exception:', e)
    return NextResponse.json({ erro: e.message || 'Erro desconhecido' }, { status: 500 })
  }
}

async function marcarErro(supabase: any, diagramaId: string, mensagem: string) {
  await supabase
    .from('projetos_diagramas')
    .update({ status: 'erro', erro_mensagem: mensagem })
    .eq('id', diagramaId)
}
