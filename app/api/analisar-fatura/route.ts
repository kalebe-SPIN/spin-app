import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/analisar-fatura
 *
 * Recebe arquivo PDF/imagem da fatura CELESC e retorna dados estruturados
 * pra preenchimento automático do form do projeto.
 *
 * ⚠️ STUB inicial — a integração completa com Claude API (skill /analista-de-faturas)
 * está pendente. Por enquanto retorna estrutura mock pra desenvolvimento do frontend.
 *
 * Fluxo planejado (V2):
 *   1. Upload arquivo → Supabase Storage
 *   2. Extrair texto (pdftotext server-side ou OCR Google Vision)
 *   3. Chamar Claude API com prompt da skill analista-de-faturas
 *   4. Validar JSON retornado
 *   5. Devolver pro frontend
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('arquivo') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    }

    // Valida tipo
    const validMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!validMimes.includes(file.type)) {
      return NextResponse.json({
        error: 'Formato inválido. Aceitos: PDF, JPG, PNG'
      }, { status: 400 })
    }

    // Valida tamanho (máx 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({
        error: 'Arquivo muito grande. Máximo 10MB.'
      }, { status: 400 })
    }

    // ===== STUB — retorna mock por enquanto =====
    // Em produção: passa pra Claude API com skill analista-de-faturas
    //
    // TODO: implementar integração real:
    //   const response = await fetch('https://api.anthropic.com/v1/messages', {
    //     method: 'POST',
    //     headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, ... },
    //     body: JSON.stringify({
    //       model: 'claude-opus-4-8',
    //       messages: [{
    //         role: 'user',
    //         content: [
    //           { type: 'document', source: { type: 'base64', media_type: file.type, data: base64 } },
    //           { type: 'text', text: 'Analise esta fatura conforme skill analista-de-faturas. Retorne JSON.' }
    //         ]
    //       }]
    //     })
    //   })

    return NextResponse.json({
      sucesso: true,
      stub: true,
      mensagem: 'Análise de fatura via Claude API ainda não implementada. Dados retornados são exemplo (mock).',
      dados: {
        uc: '',
        razao_social: '',
        cpf_cnpj: '',
        endereco: {
          logradouro: '',
          bairro: '',
          cidade: '',
          uf: 'SC',
          cep: '',
        },
        consumo_medio_mensal_kwh: null,
        grupo: null,
        subgrupo: null,
        classe: null,
        tipo_ligacao: null,
        modalidade_tarifaria: null,
      }
    })
  } catch (error: any) {
    console.error('Erro ao analisar fatura:', error)
    return NextResponse.json({
      error: `Erro ao processar arquivo: ${error?.message || 'desconhecido'}`
    }, { status: 500 })
  }
}
