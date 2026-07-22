import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

/**
 * Analisa um orcamento de fornecedor concorrente (PDF ou imagem) usando
 * Claude Sonnet com Vision. Extrai dados estruturados:
 *   - marca / modelo da placa
 *   - qtd, preco unitario, preco total
 *   - estrutura (se orcada junto)
 *   - outros itens do orcamento
 *
 * Kalebe pediu no fluxo srv_instalacao_placas modo 'outro fornecedor':
 * consultor sobe o PDF/imagem do orcamento concorrente, Bianca le e
 * ja preenche os campos do form.
 */

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BYTES = 10 * 1024 * 1024  // 10 MB
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      erro: 'ANTHROPIC_API_KEY nao configurada. Preencha os campos manualmente.',
    }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const arquivo = formData.get('arquivo') as File | null

    if (!arquivo) {
      return NextResponse.json({ erro: 'Arquivo faltando' }, { status: 400 })
    }
    if (arquivo.size > MAX_BYTES) {
      return NextResponse.json({ erro: `Arquivo grande demais (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` }, { status: 400 })
    }
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      return NextResponse.json({
        erro: `Tipo nao aceito: ${arquivo.type}. Use PDF, PNG, JPG ou WEBP.`,
      }, { status: 400 })
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer())
    const base64 = buffer.toString('base64')

    const anthropic = new Anthropic({ apiKey })

    // Monta content: document (PDF) ou image
    const contentDocOuImg: any = arquivo.type === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: arquivo.type, data: base64 },
        }

    const systemPrompt = `Voce e um analista de orcamentos fotovoltaicos da Spin Solar.
Recebeu um orcamento de fornecedor CONCORRENTE (nao WEG) enviado pelo cliente ou consultor.
Sua tarefa: extrair dados estruturados PRA COMPARACAO de preco.

Formatos comuns: PDF de proposta, print de tela, foto de tabela impressa.
As marcas mais comuns no Brasil: Canadian Solar, Trina Solar, LONGi, JA Solar, Jinko, WEG,
BYD, Astro, Risen, Sunova, Yingli, Q Cells.

Responda APENAS com JSON valido, SEM texto ao redor, no formato:
{
  "marca_fornecedor": "string ou null se nao identificar",
  "modelo_placa": "string ou null (ex: CS7L-580MS)",
  "potencia_placa_wp": number ou null,
  "qtd_placas": number,
  "preco_placa_unitario": number (R$ por placa),
  "preco_placa_total": number,
  "possui_estrutura": boolean,
  "preco_estrutura_por_modulo": number ou 0,
  "preco_estrutura_total": number ou 0,
  "possui_inversor": boolean,
  "preco_inversor": number ou 0,
  "outros_itens": [
    { "descricao": "string", "valor": number }
  ],
  "valor_total_orcamento": number,
  "confianca": "alta" | "media" | "baixa",
  "observacoes": "string curta explicando o que voce leu ou avisando incertezas"
}

Regras:
- Se nao conseguir identificar algum campo, use null (nunca invente).
- preco_placa_unitario: se o orcamento so tem total, divida por qtd.
- Se so tem valor total sem detalhamento, marque confianca=baixa e preencha
  o que der (deixe outros_itens vazio se nao souber discriminar).
- Se estrutura veio dentro do preco da placa sem separar, marque
  possui_estrutura=false e coloque nas observacoes.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          contentDocOuImg,
          {
            type: 'text',
            text: 'Analise este orcamento de fornecedor de placas solares e retorne o JSON estruturado.',
          },
        ],
      }],
    })

    const textBlock = response.content.find((b: any) => b.type === 'text') as any
    const rawText = textBlock?.text || ''

    // Extrai bloco JSON
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) {
      return NextResponse.json({
        erro: 'Claude nao retornou JSON valido',
        raw: rawText.slice(0, 500),
      }, { status: 500 })
    }

    let parsed: any
    try {
      parsed = JSON.parse(jsonMatch[1])
    } catch (parseErr: any) {
      return NextResponse.json({
        erro: `JSON parse: ${parseErr.message}`,
        raw: jsonMatch[1].slice(0, 500),
      }, { status: 500 })
    }

    return NextResponse.json({
      sucesso: true,
      dados: parsed,
    })
  } catch (e: any) {
    console.error('[analisar-orcamento-fornecedor]', e)
    return NextResponse.json({
      erro: e?.message || 'Erro desconhecido na analise',
    }, { status: 500 })
  }
}
