import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

/**
 * Extrai as informações de um produto a partir do DATASHEET (PDF/imagem)
 * usando Claude com leitura nativa de documento. Retorna JSON alinhado ao
 * shape que o catálogo/montador de kit usa (specs.potencia_wp p/ placa,
 * specs.potencia_kw p/ inversor, etc).
 *
 * Fluxo: admin escolhe a categoria, sobe o datasheet, a IA preenche os campos,
 * o admin confere e informa o preço (de tabela WEG, sem o fator de desconto).
 */

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BYTES = 10 * 1024 * 1024
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/** Campos de specs esperados por categoria (nomes que o app já consome). */
const SPECS_POR_CATEGORIA: Record<string, string> = {
  placa: `"potencia_wp": number (Wp, OBRIGATÓRIO — usado no montador de kit),
  "tipo_celula": string ou null (ex: "n-TYPE TOPCon", "PERC", "bifacial"),
  "eficiencia_perc": number ou null,
  "voc_v": number ou null (tensão de circuito aberto),
  "vmp_v": number ou null (tensão de máxima potência),
  "isc_a": number ou null (corrente de curto),
  "imp_a": number ou null (corrente de máxima potência),
  "area_m2": number ou null,
  "largura_mm": number ou null,
  "comprimento_mm": number ou null,
  "peso_kg": number ou null,
  "garantia_produto_anos": number ou null,
  "garantia_geracao_anos": number ou null`,
  inversor: `"potencia_kw": number (kW nominal CA, OBRIGATÓRIO — usado no montador de kit),
  "potencia_max_cc_kwp": number ou null,
  "qtd_mppt": number ou null,
  "entradas_mppt": number ou null (total de entradas de string),
  "faixa_mppt_min_v": number ou null,
  "faixa_mppt_max_v": number ou null,
  "tensao_max_cc_v": number ou null,
  "tensao_partida_v": number ou null,
  "fases": string ou null ("monofásico"/"trifásico"),
  "tensao_desc": string ou null (ex: "Trifásico 380V"),
  "eficiencia_max_perc": number ou null,
  "ip_protecao": string ou null (ex: "IP66"),
  "garantia_anos": number ou null`,
  bateria: `"capacidade_kwh": number (OBRIGATÓRIO),
  "potencia_kw": number ou null,
  "tensao_desc": string ou null,
  "tecnologia": string ou null (ex: "LiFePO4"),
  "ciclos_garantidos": number ou null,
  "garantia_anos": number ou null`,
}

const SPECS_GENERICO = `"descricao": string (resumo técnico do item),
  "potencia_kw": number ou null (se aplicável),
  "tensao_desc": string ou null,
  "corrente_a": number ou null,
  "norma": string ou null`

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return NextResponse.json({ erro: 'Apenas admin' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ erro: 'ANTHROPIC_API_KEY não configurada. Preencha manualmente.' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const arquivo = formData.get('arquivo') as File | null
    const categoria = String(formData.get('categoria') || '').trim()

    if (!arquivo) return NextResponse.json({ erro: 'Datasheet faltando' }, { status: 400 })
    if (!categoria) return NextResponse.json({ erro: 'Categoria faltando' }, { status: 400 })
    if (arquivo.size > MAX_BYTES) {
      return NextResponse.json({ erro: `Arquivo grande demais (máx ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` }, { status: 400 })
    }
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      return NextResponse.json({ erro: `Tipo não aceito: ${arquivo.type}. Use PDF, PNG, JPG ou WEBP.` }, { status: 400 })
    }

    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString('base64')
    const anthropic = new Anthropic({ apiKey })

    const contentDoc: any = arquivo.type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: arquivo.type, data: base64 } }

    const specsSchema = SPECS_POR_CATEGORIA[categoria] || SPECS_GENERICO

    const systemPrompt = `Você é o cadastrador técnico do catálogo da Spin Solar (integrador WEG).
Recebeu o DATASHEET de um produto da categoria "${categoria}".
Extraia as informações para cadastro. Responda APENAS com JSON válido, SEM texto ao redor:

{
  "modelo": string (modelo/SKU técnico do produto),
  "fabricante": string (ex: "WEG", "Canadian Solar"),
  "codigo_weg": string ou null (código/SKU do fabricante, se houver),
  "subcategoria": string ou null (ex: "monofacial 575W", "string trifásico"),
  "descricao_curta": string (1 linha, ex: "Módulo 575W n-TYPE bifacial"),
  "descricao_tecnica": string ou null (2-4 linhas com os destaques),
  "specs": {
  ${specsSchema}
  },
  "confianca": "alta" | "media" | "baixa",
  "observacoes": string curta (o que leu / incertezas)
}

Regras:
- NUNCA invente. Campo não encontrado = null (ou omita a chave em specs).
- Números sem unidade nem separador de milhar (ex: 575, não "575 Wp").
- Use exatamente os nomes de chave em "specs" indicados acima.
- Se o datasheet tiver várias variantes (ex: 570/575/580W), escolha a que o documento destaca e cite as demais em observacoes.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [contentDoc, { type: 'text', text: `Extraia os dados de cadastro deste datasheet (categoria: ${categoria}) e retorne o JSON.` }],
      }],
    })

    const textBlock = response.content.find((b: any) => b.type === 'text') as any
    const rawText = textBlock?.text || ''
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) {
      return NextResponse.json({ erro: 'A IA não retornou JSON. Preencha manualmente.', raw: rawText.slice(0, 400) }, { status: 500 })
    }

    let parsed: any
    try {
      parsed = JSON.parse(jsonMatch[1])
    } catch (e: any) {
      return NextResponse.json({ erro: `Falha ao ler o JSON da IA: ${e.message}`, raw: jsonMatch[1].slice(0, 400) }, { status: 500 })
    }

    return NextResponse.json({ sucesso: true, dados: parsed })
  } catch (e: any) {
    console.error('[extrair-datasheet]', e)
    return NextResponse.json({ erro: e?.message || 'Erro na extração' }, { status: 500 })
  }
}
