import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/analisar-fatura
 *
 * Encaminha o arquivo da fatura pra Edge Function `ocr-fatura` (v2) do Supabase,
 * que faz OCR via Google Vision + extração via regex CELESC.
 *
 * Resposta normalizada pro frontend (passo 1 do form de projeto).
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

    const validMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!validMimes.includes(file.type)) {
      return NextResponse.json({
        error: 'Formato inválido. Aceitos: PDF, JPG, PNG',
      }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({
        error: 'Arquivo muito grande. Máximo 10MB.',
      }, { status: 400 })
    }

    // Encaminha pra Edge Function ocr-fatura v2
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const edgeUrl = `${supabaseUrl}/functions/v1/ocr-fatura`

    // Recria FormData com campo nomeado 'file' (que a Edge Function espera)
    const edgeFormData = new FormData()
    edgeFormData.append('file', file)

    const edgeRes = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnon}`,
        apikey: supabaseAnon,
      },
      body: edgeFormData,
    })

    const edgeJson = await edgeRes.json()

    // Log no servidor pra debug
    console.log('[/api/analisar-fatura] Edge Function status:', edgeRes.status)
    console.log('[/api/analisar-fatura] Edge Function response:', JSON.stringify(edgeJson).slice(0, 500))

    // Detecta versão antiga (v1) — retornava apenas { sucesso, valor, mediaConsumoKwh, ... }
    if (edgeJson.sucesso && !edgeJson.dados && (edgeJson.valor != null || edgeJson.mediaConsumoKwh != null)) {
      console.warn('[/api/analisar-fatura] Edge Function ainda está na v1 — campo "dados" ausente')
      // Repassa o JSON da v1 pro frontend tratar
      return NextResponse.json({
        sucesso: true,
        edge_function_versao: 'v1',
        edge_function_aviso: 'Edge Function ocr-fatura ainda está na versão antiga. Deploy a v2 pra extração completa.',
        // Dados originais v1 (consumo + valor)
        valor: edgeJson.valor,
        mediaConsumoKwh: edgeJson.mediaConsumoKwh,
        valorFaturaAtual: edgeJson.valorFaturaAtual,
        historico: edgeJson.historico,
      })
    }

    if (!edgeRes.ok || !edgeJson.sucesso) {
      return NextResponse.json({
        error: edgeJson.erro || 'Edge Function falhou',
        edge_status: edgeRes.status,
        edge_response: edgeJson,
      }, { status: 500 })
    }

    // Estrutura normalizada pro frontend (compatível com NovoProjetoForm)
    const d = edgeJson.dados || {}

    return NextResponse.json({
      sucesso: true,
      stub: false,
      dados: {
        uc: d.uc || '',
        razao_social: d.razao_social || '',
        cpf_cnpj: d.cpf_cnpj || '',
        endereco: {
          logradouro: d.endereco?.logradouro || '',
          bairro: d.endereco?.bairro || '',
          cidade: d.endereco?.cidade || '',
          uf: d.endereco?.uf || 'SC',
          cep: d.endereco?.cep || '',
        },
        // Campos técnicos que vão ser usados nos próximos passos
        grupo: d.grupo,
        subgrupo: d.subgrupo,
        classe: d.classe,
        tipo_ligacao: d.tipo_ligacao,
        modalidade_tarifaria: d.modalidade_tarifaria,
        bandeira_tarifaria: d.bandeira_tarifaria,
        tensao_fornecimento_kv: d.tensao_fornecimento_kv,
        mes_referencia: d.mes_referencia,
        data_vencimento: d.data_vencimento,
        valor_total_reais: d.valor_total_reais,
        consumo_mes_kwh: d.consumo_mes_kwh,
        demanda_contratada_kw: d.demanda_contratada_kw,
        demanda_medida_fp_kw: d.demanda_medida_fp_kw,
        demanda_medida_ponta_kw: d.demanda_medida_ponta_kw,
        historico_12_meses: d.historico_12_meses,
        tem_geracao_propria: d.tem_geracao_propria,
      },
      meta: edgeJson.meta,
    })
  } catch (error: any) {
    console.error('Erro ao analisar fatura:', error)
    return NextResponse.json({
      error: `Erro ao processar arquivo: ${error?.message || 'desconhecido'}`,
    }, { status: 500 })
  }
}
