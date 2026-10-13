import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWaConfig } from '@/lib/whatsapp/config'
import { analisarFatura, MIMES_FATURA, MODELO_FATURA } from '@/lib/fatura/analisar'

/**
 * POST /api/analisar-fatura
 *
 * Recebe um PDF/imagem de fatura CELESC e usa Claude API multimodal
 * pra extrair TODOS os dados estruturados (cliente, UC, endereço,
 * dados técnicos, consumo, demanda, histórico, geração própria).
 * A leitura em si mora em lib/fatura/analisar.ts (Kalebe 2026-10-10) — a
 * Laís usa a mesma pelo WhatsApp.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!(await getWaConfig()).anthropic_api_key) {
    return NextResponse.json({
      error: 'ANTHROPIC_API_KEY não configurada no servidor. Configure no Vercel: Settings > Environment Variables.',
      precisa_configurar_env: true,
    }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('arquivo') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    }
    if (!MIMES_FATURA.includes(file.type)) {
      return NextResponse.json({ error: 'Formato inválido. Aceitos: PDF, JPG, PNG' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 10MB.' }, { status: 400 })
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const r = await analisarFatura({ base64, mime: file.type })
    if ('erro' in r) {
      console.error('[analisar-fatura]', r.erro, r.detalhe?.slice(0, 300))
      return NextResponse.json({ error: r.erro, resposta_claude: r.detalhe }, { status: 500 })
    }

    return NextResponse.json({
      sucesso: true,
      provider: 'claude-api',
      dados: r.dados,
      meta: { model: MODELO_FATURA, ...r.uso },
    })
  } catch (error: any) {
    console.error('[analisar-fatura] Erro:', error)
    // Kalebe 2026-10-07: erro da IA em português + aviso ao admin se for crédito/chave
    const { mensagemErroIA, avisarFalhaIA, erroConhecidoIA } = await import('@/lib/ia/erros')
    await avisarFalhaIA(error, 'leitura de fatura')
    return NextResponse.json({
      error: erroConhecidoIA(error)
        ? `${mensagemErroIA(error)} Enquanto isso, use "Cadastrar dados manualmente".`
        : `Erro ao processar arquivo: ${error?.message || 'desconhecido'}`,
    }, { status: 500 })
  }
}
