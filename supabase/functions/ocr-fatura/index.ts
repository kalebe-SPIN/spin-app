// =================================================================
// Edge Function: ocr-fatura (v2 — extração completa)
// Substitui a v1 que só extraía valor + consumo.
// Roda no runtime Deno do Supabase Edge Functions.
//
// Endpoint: https://<seu-projeto>.supabase.co/functions/v1/ocr-fatura
// Método: POST
// Body: FormData com campo 'file' (PDF, JPG, PNG da fatura CELESC)
//
// Deploy via Supabase CLI:
//   supabase functions deploy ocr-fatura
//
// Secrets necessárias:
//   supabase secrets set GOOGLE_VISION_API_KEY=<sua-chave>
// =================================================================

// @ts-ignore — deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY")

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

// =================================================================
// HANDLER PRINCIPAL
// =================================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ sucesso: false, erro: "Use POST" }, 405)
  }

  if (!GOOGLE_VISION_API_KEY) {
    return json({ sucesso: false, erro: "GOOGLE_VISION_API_KEY não configurada" }, 500)
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return json({ sucesso: false, erro: "Arquivo não enviado (campo 'file')" }, 400)
    }

    if (file.size > 10 * 1024 * 1024) {
      return json({ sucesso: false, erro: "Arquivo > 10MB" }, 400)
    }

    // Lê arquivo como base64
    const buf = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))

    // Chama Google Vision
    const visionUrl = file.type === "application/pdf"
      ? `https://vision.googleapis.com/v1/files:annotate?key=${GOOGLE_VISION_API_KEY}`
      : `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`

    const requestBody = file.type === "application/pdf"
      ? {
          requests: [{
            inputConfig: { content: base64, mimeType: file.type },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages: [1, 2, 3],
          }],
        }
      : {
          requests: [{
            image: { content: base64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          }],
        }

    const visionRes = await fetch(visionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })

    if (!visionRes.ok) {
      const errText = await visionRes.text()
      return json({
        sucesso: false,
        erro: `Google Vision ${visionRes.status}: ${errText.slice(0, 500)}`,
      }, 500)
    }

    const visionJson = await visionRes.json()
    const fullText = extractFullText(visionJson)

    if (!fullText || fullText.length < 100) {
      return json({
        sucesso: false,
        erro: "Não foi possível extrair texto da fatura",
        texto_bruto: fullText,
      }, 200)
    }

    // Extrai TODOS os campos via regex
    const dados = {
      uc: extractUC(fullText),
      razao_social: extractRazaoSocial(fullText),
      cpf_cnpj: extractCpfCnpj(fullText),
      endereco: extractEndereco(fullText),
      grupo: extractGrupo(fullText),
      subgrupo: extractSubgrupo(fullText),
      classe: extractClasse(fullText),
      tipo_ligacao: extractTipoLigacao(fullText),
      modalidade_tarifaria: extractModalidade(fullText),
      bandeira_tarifaria: extractBandeira(fullText),
      tensao_fornecimento_kv: extractTensaoKV(fullText),
      mes_referencia: extractMesReferencia(fullText),
      data_vencimento: extractDataVencimento(fullText),
      valor_total_reais: extractValorTotal(fullText),
      consumo_mes_kwh: extractConsumoMes(fullText),
      demanda_contratada_kw: extractDemandaContratada(fullText),
      demanda_medida_fp_kw: extractDemandaMedidaFP(fullText),
      demanda_medida_ponta_kw: extractDemandaMedidaPonta(fullText),
      historico_12_meses: extractHistorico12Meses(fullText),
      tem_geracao_propria: extractTemGeracao(fullText),
    }

    return json({
      sucesso: true,
      dados,
      meta: {
        versao_edge_function: "v2",
        tamanho_texto_extraido: fullText.length,
      },
    })
  } catch (err: any) {
    return json({ sucesso: false, erro: err.message || "Erro desconhecido" }, 500)
  }
})

// =================================================================
// UTILITÁRIOS
// =================================================================

function json(body: any, status: number = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function extractFullText(visionJson: any): string {
  // Google Vision pode retornar em formatos diferentes (PDF vs imagem)
  // PDF: responses[].responses[].fullTextAnnotation.text
  // Imagem: responses[].fullTextAnnotation.text

  try {
    // PDF
    if (visionJson.responses?.[0]?.responses?.[0]?.fullTextAnnotation) {
      return visionJson.responses[0].responses
        .map((r: any) => r.fullTextAnnotation?.text || "")
        .join("\n")
    }
    // Imagem
    if (visionJson.responses?.[0]?.fullTextAnnotation) {
      return visionJson.responses[0].fullTextAnnotation.text
    }
  } catch {}

  return ""
}

// =================================================================
// REGEX DE EXTRAÇÃO — CELESC
// =================================================================

function extractUC(text: string): string | null {
  // "Cliente: 56260820" ou "Unidade Consumidora 0046704525"
  const m1 = text.match(/Cliente[\s:]*(\d{6,12})/i)
  if (m1) return m1[1].replace(/^0+/, "") || m1[1]
  const m2 = text.match(/Unidade Consumidora[\s:]*\d{0,3}(\d{6,12})/i)
  if (m2) return m2[1].replace(/^0+/, "") || m2[1]
  return null
}

function extractRazaoSocial(text: string): string | null {
  // "NOME: BERKE COMERCIO DE VEICULOS LTDA"
  const m = text.match(/NOME[\s:]+([^\n]{3,80})/i)
  if (m) {
    return m[1].trim().replace(/\s+/g, " ")
  }
  return null
}

function extractCpfCnpj(text: string): string | null {
  // CNPJ tem mais dígitos, testa primeiro
  const mCnpj = text.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/)
  if (mCnpj) return mCnpj[1]
  const mCnpjNoMask = text.match(/CPF\/CNPJ[\s:]+(\d{14})\b/i)
  if (mCnpjNoMask) {
    const d = mCnpjNoMask[1]
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
  }
  const mCpf = text.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/)
  if (mCpf) return mCpf[1]
  return null
}

function extractEndereco(text: string): {
  logradouro: string | null
  bairro: string | null
  cidade: string | null
  uf: string
  cep: string | null
} {
  const result = {
    logradouro: null as string | null,
    bairro: null as string | null,
    cidade: null as string | null,
    uf: "SC",
    cep: null as string | null,
  }

  const mEnd = text.match(/ENDERE[CÇ]O[\s:]+([^\n]{5,100})/i)
  if (mEnd) result.logradouro = mEnd[1].trim().replace(/\s+/g, " ")

  const mCep = text.match(/CEP[\s:]*(\d{5}-?\d{3})/i)
  if (mCep) {
    const d = mCep[1].replace(/\D/g, "")
    result.cep = `${d.slice(0,5)}-${d.slice(5)}`
  }

  // "CIDADE: FLORIANOPOLIS SC" ou "Cidade: BRUSQUE SC"
  const mCid = text.match(/CIDADE[\s:]+([A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+?)\s+([A-Z]{2})\b/i)
  if (mCid) {
    result.cidade = mCid[1].trim()
    result.uf = mCid[2].toUpperCase()
  }

  return result
}

function extractGrupo(text: string): string | null {
  const m = text.match(/Grupo[\/\s]*Subgrupo[^A-Z]*([AB])\s*[\/\s]\s*[A-Za-z0-9]+/i)
  return m ? m[1].toUpperCase() : null
}

function extractSubgrupo(text: string): string | null {
  const m = text.match(/Grupo[\/\s]*Subgrupo[^A-Z]*[AB]\s*[\/\s]\s*([A-Za-z0-9]+)/i)
  return m ? m[1].toUpperCase() : null
}

function extractClasse(text: string): string | null {
  // Aparece no header, geralmente uma palavra isolada em maiúscula
  const m = text.match(/\b(RESIDENCIAL|COMERCIAL|INDUSTRIAL|RURAL|PODER\s+PUBLICO|ILUMINA[CÇ][AÃ]O\s+PUBLICA|SERVI[CÇ]O\s+PUBLICO)\b/i)
  if (!m) return null
  const c = m[1].toUpperCase().replace(/\s+/g, "_")
  if (c === "PODER_PUBLICO") return "PODER_PUBLICO"
  if (c.startsWith("ILUMINA")) return "ILUMINACAO_PUBLICA"
  if (c.startsWith("SERVI")) return "SERVICO_PUBLICO"
  return c
}

function extractTipoLigacao(text: string): "monofasico" | "bifasico" | "trifasico" | null {
  // Procura no header — última palavra após "demais classes -" ou após modalidade
  // Heurística robusta: olha as letras iniciais da palavra com "FASIC"
  const m = text.match(/-\s*(TR?I|BI|M[O0]N[O0])F[ÁA]?SI[CK]?[O0]?/i)
  if (m) {
    const prefix = m[1].toUpperCase()
    if (prefix.startsWith("T")) return "trifasico"
    if (prefix.startsWith("B")) return "bifasico"
    if (prefix.startsWith("M")) return "monofasico"
  }
  // Fallback: procura a palavra isolada
  if (/TRIF[ÁA]SIC/i.test(text)) return "trifasico"
  if (/BIF[ÁA]SIC/i.test(text)) return "bifasico"
  if (/MONOF[ÁA]SIC/i.test(text)) return "monofasico"
  return null
}

function extractModalidade(text: string): string {
  if (/horosazonal\s+verde/i.test(text)) return "horosazonal_verde"
  if (/horosazonal\s+azul/i.test(text)) return "horosazonal_azul"
  if (/tarifa\s+branca/i.test(text)) return "branca"
  return "convencional"
}

function extractBandeira(text: string): string {
  // Aparece geralmente próximo ao número do medidor
  if (/\bverde\b/i.test(text)) return "verde"
  if (/\bamarela\b/i.test(text)) return "amarela"
  if (/vermelha\s*[12]?/i.test(text)) {
    if (/vermelha\s*2/i.test(text)) return "vermelha_2"
    return "vermelha_1"
  }
  return "verde"
}

function extractTensaoKV(text: string): number | null {
  // "Tensão Fornecimento (kV) 23,1"
  const m = text.match(/Tens[ãa]o\s+Fornecimento\s*\(?\s*kV\s*\)?\s*([\d,.]+)/i)
  if (m) return parseFloat(m[1].replace(",", "."))
  return null
}

function extractMesReferencia(text: string): string | null {
  // "Referência 02/2026"
  const m = text.match(/Refer[êe]ncia\s+(\d{2}\/\d{4})/i)
  return m ? m[1] : null
}

function extractDataVencimento(text: string): string | null {
  // "Vencimento 11/03/2026"
  const m = text.match(/Vencimento[\s:]*(\d{2}\/\d{2}\/\d{4})/i)
  if (m) {
    const [d, mo, y] = m[1].split("/")
    return `${y}-${mo}-${d}`
  }
  return null
}

function extractValorTotal(text: string): number | null {
  // "Total a Pagar (R$) 1.994,77" ou "TOTAL 11.839,48"
  const m = text.match(/Total\s*a?\s*Pagar[^0-9]*R?\$?\s*([\d.,]+)/i) ||
            text.match(/^TOTAL[\s:]*R?\$?\s*([\d.,]+)/im)
  if (!m) return null
  const raw = m[1].replace(/\./g, "").replace(",", ".")
  const v = parseFloat(raw)
  if (v > 10 && v < 9999999) return v
  return null
}

function extractConsumoMes(text: string): number | null {
  // Pra grupo B: "(00) Consumo TE KWH 1.949"
  // Pra grupo A: "(03) Consumo Fora Ponta TE KWH 14.811,377"
  const matches = text.matchAll(/\(0[03][\s\)]+(?:Consumo\s+(?:Fora\s+Ponta\s+)?TE)?[\s\S]{0,40}?KWH\s+([\d.,]+)/gi)
  for (const m of matches) {
    const raw = m[1].replace(/\./g, "").replace(",", ".")
    const v = parseFloat(raw)
    if (v > 50 && v < 999999) return v
  }
  return null
}

function extractDemandaContratada(text: string): number | null {
  // "Demanda 130 KW" no rodapé
  const m = text.match(/Demanda[\s\S]{0,30}?(\d{2,4})\s*KW/i)
  if (m) return parseFloat(m[1])
  return null
}

function extractDemandaMedidaFP(text: string): number | null {
  // "Medida 99KW" ou "Demanda Medida Fora Ponta"
  const m = text.match(/Medida[\s\S]{0,20}?(?:Fora\s+Ponta\s+)?(\d{2,4})\s*KW/i)
  if (m) return parseFloat(m[1])
  return null
}

function extractDemandaMedidaPonta(text: string): number | null {
  const m = text.match(/Medida\s+(?:G\s+)?(?:Ponta\s+)?(\d{1,3})\s*KW/i)
  if (m) return parseFloat(m[1])
  return null
}

function extractHistorico12Meses(text: string): Array<{ mes_ano: string; consumo_kwh: number | null }> {
  // Padrão: "JAN/26 DEZ/25 NOV/25 ... " + valores em linhas abaixo
  // Difícil extrair com regex confiável — retorna lista de meses identificados
  const meses = text.match(/[A-Z]{3}\/\d{2}/g)
  if (!meses || meses.length < 3) return []

  const unique = Array.from(new Set(meses)).slice(0, 12)
  return unique.map(m => ({ mes_ano: m, consumo_kwh: null }))
}

function extractTemGeracao(text: string): boolean {
  // Códigos (0J) (0K) (0I) (0L) ou "Geradora no Período"
  if (/\(0[JKIL]\)/i.test(text)) return true
  if (/Consumo\s+Geradora\s+no\s+Per[ií]odo/i.test(text)) return true
  if (/Energia\s+Injetada/i.test(text)) return true
  return false
}
