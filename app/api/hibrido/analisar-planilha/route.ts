import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recebe uma planilha (Excel, CSV, ODS) com dados de:
 *   • Memória de massa (CELESC) OU
 *   • Análise de rede com equipamento
 *
 * Usa Claude Sonnet multimodal pra extrair:
 *   • Demanda média (kW)
 *   • Demanda pico (kW)
 *   • Perfil de uso
 *   • Pontos críticos
 *   • Recomendação técnica
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const arquivo = formData.get('arquivo') as File | null
    const metodo = (formData.get('metodo') as string) || 'memoria_massa'
    const projetoId = formData.get('projeto_id') as string

    if (!arquivo) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    if (!projetoId) return NextResponse.json({ error: 'projeto_id obrigatório' }, { status: 400 })

    // Upload pro storage
    const nomeArquivo = `${projetoId}-${Date.now()}-${arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const buffer = Buffer.from(await arquivo.arrayBuffer())

    const { data: upload, error: uploadErr } = await supabase.storage
      .from('analise-demanda')
      .upload(nomeArquivo, buffer, { contentType: arquivo.type, upsert: false })

    if (uploadErr) {
      console.error('[hibrido] Upload falhou:', uploadErr)
      return NextResponse.json({ error: 'Falha no upload: ' + uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = await supabase.storage
      .from('analise-demanda')
      .createSignedUrl(nomeArquivo, 60 * 60 * 24 * 7) // 7 dias

    // Parse do Excel via xlsx pra virar texto/JSON
    let conteudoTexto = ''
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      // Pega até 3 sheets e converte pra CSV concatenado
      const sheets = wb.SheetNames.slice(0, 3)
      const partes: string[] = []
      for (const nomeSheet of sheets) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nomeSheet], { blankrows: false })
        partes.push(`━━━ Aba: ${nomeSheet} ━━━\n${csv.slice(0, 15000)}`) // 15KB por sheet
      }
      conteudoTexto = partes.join('\n\n')
    } catch (e: any) {
      console.error('[hibrido] Parse Excel falhou:', e?.message)
      return NextResponse.json({
        error: 'Não consegui ler o arquivo. Formatos aceitos: .xlsx, .xls, .csv, .ods',
      }, { status: 400 })
    }

    // Chama Claude Sonnet pra analisar
    const anthropic = new Anthropic({ apiKey })

    const systemPrompt = `Você é o Mestre da Elétrica da Spin Solar — engenheiro sênior especializado em análise de demanda pra dimensionamento de sistemas fotovoltaicos híbridos com BESS.

Recebe planilha de ${metodo === 'memoria_massa' ? 'memória de massa CELESC (curva de carga em intervalos de 15min ou 1h)' : metodo === 'analise_rede_medido' ? 'análise de rede medida por analisador de qualidade de energia (dados de amperagem, tensão, potência ativa/reativa)' : 'levantamento de carga por listagem'}.

Sua tarefa: extrair da planilha bruta os valores críticos pra dimensionar sistema híbrido com armazenamento e devolver um JSON estruturado.

CAMPOS DO JSON DE RETORNO (ordem obrigatória):
{
  "demanda_media_kw": number,           // média histórica (equivalente ao consumo médio)
  "demanda_pico_kw": number,             // pico observado
  "demanda_carga_critica_kw_sugerida": number,  // sua sugestão pra carga crítica de backup (~30-50% da média em residencial, 15-25% em comercial)
  "autonomia_horas_sugerida": number,   // sugestão de horas de autonomia (residencial 4-6h; comercial 2-4h)
  "perfil_uso": string,                  // "residencial 24h", "comercial 8-18h", "industrial diurno" etc
  "picos_horarios": string,              // quando ocorrem os picos (ex: "18h-22h")
  "resumo": string,                      // 3-5 frases sobre o perfil
  "pontos_criticos": [
    { "titulo": string, "detalhe": string, "severidade": "info" | "alerta" | "critico" }
  ],
  "recomendacao": string                 // 2-4 frases: estratégia sugerida (peak shaving? backup carga crítica? complementação demanda?)
}

REGRAS:
- Retorne SÓ JSON válido, sem markdown, sem texto extra
- Se dados forem inconclusivos, use null e coloque em pontos_criticos
- Considere que carga crítica é o mínimo pra manter geladeira, wifi, iluminação essencial e computadores (residencial); ou processos que não podem parar (comercial)
- Alerte se demanda pico > 3× média (indica motor de bomba/ar condicionado partindo)
- Alerte se há intermitências ou lacunas na leitura`

    const userPrompt = `Analise esta planilha (${metodo}) e devolva o JSON:

${conteudoTexto}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textoResposta = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    // Parse robusto do JSON
    const jsonMatch = textoResposta.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        error: 'Análise sem JSON válido — resposta bruta anexada',
        raw: textoResposta,
      }, { status: 500 })
    }

    const analise = JSON.parse(jsonMatch[0])

    // Salva análise no banco
    const { data: registro, error: dbErr } = await supabase
      .from('projeto_hibrido_analise')
      .insert({
        projeto_id: projetoId,
        metodo_demanda: metodo,
        arquivo_url: urlData?.signedUrl,
        arquivo_nome: arquivo.name,
        arquivo_tamanho_bytes: arquivo.size,
        arquivo_tipo: arquivo.name.split('.').pop()?.toLowerCase(),
        demanda_media_kw: analise.demanda_media_kw,
        demanda_pico_kw: analise.demanda_pico_kw,
        demanda_carga_critica_kw: analise.demanda_carga_critica_kw_sugerida,
        autonomia_desejada_horas: analise.autonomia_horas_sugerida,
        resumo_analise_ia: analise.resumo,
        pontos_criticos_ia: analise.pontos_criticos || [],
        recomendacao_ia: analise.recomendacao,
        criado_por: user.id,
      })
      .select()
      .single()

    if (dbErr) console.error('[hibrido] DB insert falhou:', dbErr)

    return NextResponse.json({ analise, registro_id: registro?.id })
  } catch (e: any) {
    console.error('[hibrido] Erro:', e)
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}
