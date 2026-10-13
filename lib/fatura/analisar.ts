import Anthropic from '@anthropic-ai/sdk'
import { getWaConfig } from '@/lib/whatsapp/config'

/**
 * Leitura de fatura de energia (CELESC) por IA — comum à tela (rota
 * /api/analisar-fatura, com usuário logado) e à Laís no WhatsApp (sem login,
 * pelo link da mídia salva). Kalebe 2026-10-10: tirado de dentro da rota.
 */

export type DadosFatura = {
  uc: string
  razao_social: string
  cpf_cnpj: string
  endereco: { logradouro: string; bairro: string; cidade: string; uf: string; cep: string }
  grupo: string | null
  subgrupo: string | null
  classe: string | null
  tipo_ligacao: 'monofasico' | 'bifasico' | 'trifasico' | null
  modalidade_tarifaria: string | null
  bandeira_tarifaria: string | null
  tensao_fornecimento_kv: number | null
  mes_referencia: string | null
  data_vencimento: string | null
  valor_total_reais: number | null
  consumo_mes_kwh: number | null
  consumo_medio_12m_kwh: number
  meses_com_dados: number
  demanda_contratada_kw: number | null
  demanda_medida_fp_kw: number | null
  demanda_medida_ponta_kw: number | null
  historico_12_meses: any[]
  tem_geracao_propria: boolean | null
  geracao: any
  _aviso_endereco: string
  _avisos: string[]
}

export const MIMES_FATURA = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
export const MODELO_FATURA = 'claude-sonnet-4-6'

export async function analisarFatura(entrada: { base64: string; mime: string }): Promise<
  { dados: DadosFatura; uso: { input_tokens: number; output_tokens: number } } | { erro: string; detalhe?: string }
> {
  const apiKey = (await getWaConfig()).anthropic_api_key
  if (!apiKey) return { erro: 'Chave da IA (Anthropic) não configurada no servidor.' }
  const isPdf = entrada.mime === 'application/pdf'
  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model: MODELO_FATURA,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: isPdf ? 'document' : 'image', source: { type: 'base64', media_type: (entrada.mime === 'image/jpg' ? 'image/jpeg' : entrada.mime) as any, data: entrada.base64 } } as any,
        { type: 'text', text: PROMPT_ANALISTA_FATURA },
      ],
    }],
  })
  const texto = message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
  const jsonMatch = texto.match(/```json\s*([\s\S]*?)\s*```/) || texto.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) return { erro: 'Não foi possível extrair dados estruturados da fatura.', detalhe: texto.slice(0, 1000) }
  let d: any
  try { d = JSON.parse(jsonMatch[1]) } catch { return { erro: 'A IA retornou JSON inválido', detalhe: jsonMatch[1].slice(0, 500) } }

  // Média calculada aqui como garantia
  const historico = Array.isArray(d.historico_12_meses) ? d.historico_12_meses : []
  const validos = historico.filter((h: any) => Number(h.consumo_kwh) > 0)
  const media = validos.length ? Math.round(validos.reduce((s: number, h: any) => s + Number(h.consumo_kwh), 0) / validos.length) : Number(d.consumo_mes_kwh) || 0
  const consumoMedio = Number(d.consumo_medio_12m_kwh) || media
  const meses = Number(d.meses_com_dados) || validos.length || 1
  const avisos: string[] = []
  if (meses < 12) avisos.push(`Histórico com apenas ${meses} mês(es) de dados. Ideal usar 12 meses pra média confiável — considere pedir mais faturas ao cliente.`)
  if (meses === 1) avisos.push('Média calculada a partir de UM único mês (o atual). Dimensionamento pode não refletir consumo real do cliente ao longo do ano.')

  return {
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
      grupo: d.grupo ?? null,
      subgrupo: d.subgrupo ?? null,
      classe: d.classe ?? null,
      tipo_ligacao: ['monofasico', 'bifasico', 'trifasico'].includes(d.tipo_ligacao) ? d.tipo_ligacao : null,
      modalidade_tarifaria: d.modalidade_tarifaria ?? null,
      bandeira_tarifaria: d.bandeira_tarifaria ?? null,
      tensao_fornecimento_kv: d.tensao_fornecimento_kv ?? null,
      mes_referencia: d.mes_referencia ?? null,
      data_vencimento: d.data_vencimento ?? null,
      valor_total_reais: d.valor_total_reais ?? null,
      consumo_mes_kwh: d.consumo_mes_kwh ?? null,
      consumo_medio_12m_kwh: consumoMedio,
      meses_com_dados: meses,
      demanda_contratada_kw: d.demanda_contratada_kw ?? null,
      demanda_medida_fp_kw: d.demanda_medida_fp_kw ?? null,
      demanda_medida_ponta_kw: d.demanda_medida_ponta_kw ?? null,
      historico_12_meses: historico,
      tem_geracao_propria: d.tem_geracao_propria ?? null,
      geracao: d.geracao || null,
      _aviso_endereco: 'Endereço extraído pode estar abreviado. Confira atentamente antes de salvar.',
      _avisos: avisos,
    },
    uso: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
  }
}

/** A Laís lê a fatura que veio no WhatsApp (mídia já salva no Storage). */
export async function analisarFaturaPorUrl(url: string, mime: string | null): Promise<
  { dados: DadosFatura } | { erro: string }
> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return { erro: `Não consegui baixar o arquivo (${resp.status})` }
    const tipo = (mime || resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!MIMES_FATURA.includes(tipo)) return { erro: `Formato não aceito pra fatura: ${tipo || 'desconhecido'}` }
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length > 10 * 1024 * 1024) return { erro: 'Arquivo acima de 10 MB' }
    const r = await analisarFatura({ base64: buf.toString('base64'), mime: tipo })
    return 'erro' in r ? { erro: r.erro } : { dados: r.dados }
  } catch (e: any) {
    const { avisarFalhaIA } = await import('@/lib/ia/erros')
    await avisarFalhaIA(e, 'leitura de fatura (Laís)')
    return { erro: e?.message || 'Falha na leitura da fatura' }
  }
}

// =================================================================
// PROMPT — baseado na skill /analista-de-faturas
// =================================================================

export const PROMPT_ANALISTA_FATURA = `Você é um analista sênior de faturas de energia elétrica brasileiras (especialmente CELESC).
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
    { "mes_ano": "MMM/AA", "consumo_kwh": number, "injetado_kwh": number | null, "saldo_final_kwh": number | null }
  ],
  "tem_geracao_propria": boolean,
  "geracao": {
    "injetado_mes_kwh": number | null,
    "compensado_mes_kwh": number | null,
    "saldo_creditos_kwh": number | null,
    "creditos_a_expirar_kwh": number | null,
    "creditos_expiram_em": "MM/AAAA" | null
  }
}
\`\`\`

GERAÇÃO PRÓPRIA (quando a UC já tem solar — tabela "Geradora no Período", "Injeção no Período Atual",
"Saldo Final Geradora", "Energia Injetada", códigos (0J)/(0K)/(0I)/(0L)):
- "consumo_kwh" de cada mês = energia ATIVA CONSUMIDA DA REDE (a registrada no medidor), sem descontar compensação.
- "injetado_kwh" de cada mês = energia INJETADA/exportada na rede naquele mês ("Injeção no Período"). Some fora ponta + ponta.
  Se o mês não mostra injeção, use null (NUNCA 0 por suposição). Sem geração própria: null em todos.
- "saldo_final_kwh" = "Saldo Final Geradora" (créditos acumulados) daquele mês, quando aparecer.
- "geracao.injetado_mes_kwh" = injeção do mês de referência; "compensado_mes_kwh" = energia compensada/abatida no mês;
  "saldo_creditos_kwh" = saldo total de créditos no fechamento do mês; "creditos_a_expirar_kwh"/"creditos_expiram_em" se a fatura avisar.
- Sem geração própria: "geracao" com todos os campos null.

INSTRUÇÃO EXTRA PARA MÉDIA:
- "consumo_medio_12m_kwh": média aritmética dos consumos válidos (>0) do histórico dos últimos 12 meses. Ignore meses zerados ou nulos.
- "meses_com_dados": quantos meses do histórico têm consumo válido (>0). Se a fatura só mostra 6 meses, retorne 6.
- Se a fatura NÃO mostrar histórico, "consumo_medio_12m_kwh" = valor do "consumo_mes_kwh" e "meses_com_dados" = 1.`
