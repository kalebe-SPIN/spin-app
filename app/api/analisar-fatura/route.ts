import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

/**
 * POST /api/analisar-fatura
 *
 * Recebe um PDF/imagem de fatura CELESC e usa Claude API multimodal
 * pra extrair TODOS os dados estruturados (cliente, UC, endereço,
 * dados técnicos, consumo, demanda, histórico, geração própria).
 *
 * Vantagens vs OCR + regex:
 *  - Lê PDF nativamente (multimodal)
 *  - Entende contexto (endereço completo mesmo abreviado na fatura)
 *  - Robusto a variações de layout
 *  - Custo: ~R$ 0,05-0,15 por análise
 *
 * Requer env: ANTHROPIC_API_KEY no Vercel
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
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

    // Converte arquivo pra base64
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Chama Claude API multimodal
    const anthropic = new Anthropic({ apiKey })

    const isPdf = file.type === 'application/pdf'

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',  // bom equilíbrio custo/qualidade
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: isPdf ? 'document' : 'image',
              source: {
                type: 'base64',
                media_type: file.type as any,
                data: base64,
              },
            } as any,
            {
              type: 'text',
              text: PROMPT_ANALISTA_FATURA,
            },
          ],
        },
      ],
    })

    // Extrai texto da resposta
    const responseText = message.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')

    // Encontra o bloco JSON na resposta
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseText.match(/(\{[\s\S]*\})/)

    if (!jsonMatch) {
      console.error('[analisar-fatura] Claude não retornou JSON. Resposta:', responseText.slice(0, 500))
      return NextResponse.json({
        error: 'Não foi possível extrair dados estruturados da fatura.',
        resposta_claude: responseText.slice(0, 1000),
      }, { status: 500 })
    }

    let dados: any
    try {
      dados = JSON.parse(jsonMatch[1])
    } catch (e: any) {
      console.error('[analisar-fatura] JSON inválido:', e.message)
      return NextResponse.json({
        error: 'Claude retornou JSON inválido',
        json_bruto: jsonMatch[1].slice(0, 500),
      }, { status: 500 })
    }

    // Calcula média server-side como fallback (garantia)
    const historico = Array.isArray(dados.historico_12_meses) ? dados.historico_12_meses : []
    const mesesValidos = historico.filter((h: any) => Number(h.consumo_kwh) > 0)
    const somaConsumo = mesesValidos.reduce((sum: number, h: any) => sum + Number(h.consumo_kwh), 0)
    const mediaCalculada = mesesValidos.length > 0
      ? Math.round(somaConsumo / mesesValidos.length)
      : Number(dados.consumo_mes_kwh) || 0

    // Se Claude não retornou média, usa a calculada. Se retornou, mantém.
    const consumoMedio12m = Number(dados.consumo_medio_12m_kwh) || mediaCalculada
    const mesesComDados = Number(dados.meses_com_dados) || mesesValidos.length || 1

    // Avisos automáticos
    const avisos: string[] = []
    if (mesesComDados < 12) {
      avisos.push(
        `Histórico com apenas ${mesesComDados} mês(es) de dados. Ideal usar 12 meses pra média confiável — considere pedir mais faturas ao cliente.`
      )
    }
    if (mesesComDados === 1) {
      avisos.push(
        `Média calculada a partir de UM único mês (o atual). Dimensionamento pode não refletir consumo real do cliente ao longo do ano.`
      )
    }

    // Normaliza estrutura pro formato do frontend
    return NextResponse.json({
      sucesso: true,
      provider: 'claude-api',
      dados: {
        uc: dados.uc || '',
        razao_social: dados.razao_social || '',
        cpf_cnpj: dados.cpf_cnpj || '',
        endereco: {
          logradouro: dados.endereco?.logradouro || '',
          bairro: dados.endereco?.bairro || '',
          cidade: dados.endereco?.cidade || '',
          uf: dados.endereco?.uf || 'SC',
          cep: dados.endereco?.cep || '',
        },
        // Dados técnicos (usados nos próximos passos)
        grupo: dados.grupo,
        subgrupo: dados.subgrupo,
        classe: dados.classe,
        tipo_ligacao: dados.tipo_ligacao,
        modalidade_tarifaria: dados.modalidade_tarifaria,
        bandeira_tarifaria: dados.bandeira_tarifaria,
        tensao_fornecimento_kv: dados.tensao_fornecimento_kv,
        mes_referencia: dados.mes_referencia,
        data_vencimento: dados.data_vencimento,
        valor_total_reais: dados.valor_total_reais,
        consumo_mes_kwh: dados.consumo_mes_kwh,
        consumo_medio_12m_kwh: consumoMedio12m,
        meses_com_dados: mesesComDados,
        demanda_contratada_kw: dados.demanda_contratada_kw,
        demanda_medida_fp_kw: dados.demanda_medida_fp_kw,
        demanda_medida_ponta_kw: dados.demanda_medida_ponta_kw,
        historico_12_meses: historico,
        tem_geracao_propria: dados.tem_geracao_propria,
        // Aviso sobre endereço — sempre mostrar
        _aviso_endereco: 'Endereço extraído pode estar abreviado. Confira atentamente antes de salvar.',
        _avisos: avisos,
      },
      meta: {
        model: 'claude-sonnet-4-6',
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    })
  } catch (error: any) {
    console.error('[analisar-fatura] Erro:', error)
    return NextResponse.json({
      error: `Erro ao processar arquivo: ${error?.message || 'desconhecido'}`,
      stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
    }, { status: 500 })
  }
}

// =================================================================
// PROMPT — baseado na skill /analista-de-faturas
// =================================================================

const PROMPT_ANALISTA_FATURA = `Você é um analista sênior de faturas de energia elétrica brasileiras (especialmente CELESC).
Analise esta fatura e extraia os dados estruturados em formato JSON.

INSTRUÇÕES IMPORTANTES:
1. Use o ENDEREÇO COMPLETO da fatura — se vier abreviado (ex: "JOAO SAMPAIO DA SILVA S/N 4 LO"), expanda quando possível ("Rua João Sampaio da Silva, S/N, 4º andar, Loja XX"). Se não conseguir expandir, mantenha como está mas SEM CORTAR.
2. CPF/CNPJ deve vir com máscara: 000.000.000-00 ou 00.000.000/0000-00
3. Para "tipo_ligacao": olhe a linha header acima de "UNIDADE CONSUMIDORA". Aparece como última palavra após "demais classes -" ou após a modalidade. Sempre vem "MONOFÁSICO", "BIFÁSICO" ou "TRIFÁSICO" (mesmo se encoding ruim).
4. Para "grupo": A ou B (do campo "Grupo/Subgrupo Tensão")
5. Para "modalidade_tarifaria": "convencional" | "branca" | "horosazonal_verde" | "horosazonal_azul"
6. Para "bandeira_tarifaria": "verde" | "amarela" | "vermelha_1" | "vermelha_2"
7. Para detectar GERAÇÃO PRÓPRIA: procure códigos (0J), (0K), (0I), (0L) OU seção "Geradora no Período" OU "Energia Injetada"
8. Datas em formato AAAA-MM-DD
9. Valores monetários como número (sem R$, sem milhares com ponto). Ex: 1994.77 (não "1.994,77")
10. Se algum campo não estiver visível ou claro, use null.

RETORNE APENAS UM BLOCO JSON, sem texto antes ou depois:

\`\`\`json
{
  "uc": "string",
  "razao_social": "string",
  "cpf_cnpj": "000.000.000-00 ou 00.000.000/0000-00",
  "endereco": {
    "logradouro": "string completa",
    "bairro": "string",
    "cidade": "string",
    "uf": "SC",
    "cep": "00000-000"
  },
  "grupo": "A" | "B",
  "subgrupo": "B1" | "B2" | "B3" | "A4" | "A3a" | etc,
  "classe": "RESIDENCIAL" | "COMERCIAL" | "INDUSTRIAL" | "RURAL" | etc,
  "tipo_ligacao": "monofasico" | "bifasico" | "trifasico",
  "modalidade_tarifaria": "convencional" | "branca" | "horosazonal_verde" | "horosazonal_azul",
  "bandeira_tarifaria": "verde" | "amarela" | "vermelha_1" | "vermelha_2",
  "tensao_fornecimento_kv": number | null,
  "mes_referencia": "MM/AAAA",
  "data_vencimento": "AAAA-MM-DD",
  "valor_total_reais": number,
  "consumo_mes_kwh": number,
  "consumo_medio_12m_kwh": number,
  "meses_com_dados": number,
  "demanda_contratada_kw": number | null,
  "demanda_medida_fp_kw": number | null,
  "demanda_medida_ponta_kw": number | null,
  "historico_12_meses": [
    { "mes_ano": "MMM/AA", "consumo_kwh": number }
  ],
  "tem_geracao_propria": boolean
}
\`\`\`

INSTRUÇÃO EXTRA PARA MÉDIA:
- "consumo_medio_12m_kwh": média aritmética dos consumos válidos (>0) do histórico dos últimos 12 meses. Ignore meses zerados ou nulos.
- "meses_com_dados": quantos meses do histórico têm consumo válido (>0). Se a fatura só mostra 6 meses, retorne 6.
- Se a fatura NÃO mostrar histórico, "consumo_medio_12m_kwh" = valor do "consumo_mes_kwh" e "meses_com_dados" = 1.`
