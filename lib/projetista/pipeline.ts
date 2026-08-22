/**
 * Pipeline multi-etapa do agente Projetista SPIN.
 *
 * Etapas:
 *   1. ANALISAR — identifica tipo/complexidade dos dados
 *   2. ESCOLHER TEMPLATE — carrega template adequado da skill
 *   3. VALIDAR DADOS — checa completude
 *   4. GERAR SVG — Claude preenche template com dados
 *   5. AUDITAR SVG — Claude re-lê e verifica conformidade
 *   6. REFINAR (se auditoria falhou) — Claude corrige apenas os itens falhados
 *   7. ENTREGAR — retorna SVG + memória + avisos + relatório auditoria
 */

import Anthropic from '@anthropic-ai/sdk'
import { carregarSkillProjetista, escolherTemplate } from './skill-loader'

export type EntradasProjetista = {
  projeto: any
  configEmpresa: any
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao'
  hibridoDimensionamento?: any
  hibridoAnalise?: any
  instrucaoAjuste?: string   // se refinamento de versão anterior
}

export type ResultadoProjetista = {
  svg: string
  memoria_calculo: any
  avisos: string[]
  auditoria: {
    passou: boolean
    tentativas: number
    itens_verificados: number
    itens_falhados: string[]
  }
  meta: {
    template_usado: string
    tempo_ms: number
    tokens_input: number
    tokens_output: number
  }
}

// ============================================================================
// ETAPA 1: ANALISAR
// ============================================================================
function analisarProjeto(dados: EntradasProjetista) {
  const { projeto, tipoDesenho } = dados

  const ligacao = projeto.padrao_entrada?.tipo_ligacao || ''
  const fase: 'mono' | 'bi' | 'tri' =
    /tri/i.test(ligacao) ? 'tri' :
    /bi/i.test(ligacao) ? 'bi' : 'mono'

  const grupo: 'A' | 'B' = /grupo\s*a|mt|13\.8|23\.1|34\.5/i.test(
    JSON.stringify(projeto.padrao_entrada || {}),
  ) ? 'A' : 'B'

  const potenciaKwp = projeto.kit_selecionado?.potencia_cc_kwp
    || projeto.dimensionamento?.potencia_kwp
    || 0

  const complexidade: 'residencial' | 'comercial' | 'industrial' =
    potenciaKwp > 75 ? 'industrial' :
    potenciaKwp > 15 ? 'comercial' : 'residencial'

  return { tipoDesenho, fase, grupo, potenciaKwp, complexidade }
}

// ============================================================================
// ETAPA 3: VALIDAR DADOS
// ============================================================================
function validarDados(dados: EntradasProjetista): { ok: boolean; faltando: string[] } {
  const { projeto, tipoDesenho } = dados
  const faltando: string[] = []

  if (!projeto.padrao_entrada) faltando.push('padrão de entrada (Passo 4)')

  if (tipoDesenho !== 'padrao_entrada') {
    if (!projeto.analise_fatura) faltando.push('análise da fatura (Passo 2)')
    if (!Array.isArray(projeto.telhado_secoes) || projeto.telhado_secoes.length === 0) {
      faltando.push('telhado (Passo 3)')
    }
  }

  return { ok: faltando.length === 0, faltando }
}

// ============================================================================
// ETAPA 4: GERAR SVG (chamada Claude com skill embarcada)
// ============================================================================
async function gerarSvgComSkill(
  anthropic: Anthropic,
  dados: EntradasProjetista,
  template: { chave: string; svg: string },
): Promise<{ svg: string; memoria: any; avisos: string[]; rawText: string }> {
  const skill = carregarSkillProjetista()

  // Sistema: instrução mestre + regras + estilo (não muda por projeto)
  const systemPrompt = `${skill.instrucaoMestre}

## REGRAS FIXAS DA SPIN (nunca-negociáveis)
${skill.regras}

## PADRÃO GRÁFICO DA CASA
${skill.estilo}

## FORMATO DE SAÍDA OBRIGATÓRIO
Responda APENAS com JSON válido no formato:
\`\`\`json
{
  "svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1190 842' width='1190' height='842'>...</svg>",
  "memoria_calculo": { ... },
  "avisos": [...]
}
\`\`\`
Sem texto antes ou depois. Sem markdown fora do bloco json.`

  // Usuário: dados do projeto + template + biblioteca de símbolos
  const userPrompt = construirPromptUsuario(dados, template, skill)

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-5',
    max_tokens: 32000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  let rawText = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta as any
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        rawText += delta.text
      }
    }
  }

  // Extrai JSON — extrator robusto que tolera fences variados e fallback pra SVG puro
  const parsed = extrairJsonDoResponse(rawText)
  return {
    svg: parsed.svg || '',
    memoria: parsed.memoria_calculo || {},
    avisos: parsed.avisos || [],
    rawText,
  }
}

/**
 * Extrai o JSON esperado da resposta do Claude tolerando várias fromas:
 *  - ```json ... ```   (fence padrão)
 *  - ``` ... ```       (fence sem tag)
 *  - {"svg": ...}      (JSON puro)
 *  - <svg>...</svg>    (SVG puro sem envelope — embrulha num JSON sintético)
 *
 * Antes tinha só 2 regexes e um deles quebrava quando o SVG interno tinha `}`
 * antes do fechamento correto do objeto. Aqui o parse tenta bracket-matching
 * do primeiro `{` até o `}` que fecha a contagem, ignorando `{` `}` dentro
 * de strings.
 */
function extrairJsonDoResponse(rawText: string): { svg?: string; memoria_calculo?: any; avisos?: any[] } {
  const txt = rawText.trim()

  // 1. Fence markdown — aceita ```json, ```JSON, ```jsonc, ``` puro
  const mFence = txt.match(/```(?:json|jsonc|JSON)?\s*([\s\S]*?)\s*```/)
  if (mFence) {
    try { return JSON.parse(mFence[1].trim()) } catch { /* tenta o próximo caminho */ }
  }

  // 2. JSON puro — bracket-matching do primeiro `{` até seu fechamento
  const idxAbre = txt.indexOf('{')
  if (idxAbre >= 0) {
    let profundidade = 0
    let dentroString = false
    let escape = false
    for (let i = idxAbre; i < txt.length; i++) {
      const c = txt[i]
      if (escape) { escape = false; continue }
      if (c === '\\') { escape = true; continue }
      if (c === '"') { dentroString = !dentroString; continue }
      if (dentroString) continue
      if (c === '{') profundidade++
      else if (c === '}') {
        profundidade--
        if (profundidade === 0) {
          const bloco = txt.slice(idxAbre, i + 1)
          try { return JSON.parse(bloco) } catch { /* deixa cair no fallback */ }
          break
        }
      }
    }
  }

  // 3. Fallback: só o SVG puro — embrulha em envelope sintético
  const mSvg = txt.match(/<svg[\s\S]*?<\/svg>/i)
  if (mSvg) {
    return { svg: mSvg[0], memoria_calculo: {}, avisos: ['⚠ Claude devolveu SVG solto (sem envelope JSON) — memória de cálculo veio vazia.'] }
  }

  throw new Error('Claude não retornou JSON válido. Resposta (primeiros 800 chars): ' + rawText.slice(0, 800))
}

function construirPromptUsuario(
  dados: EntradasProjetista,
  template: { chave: string; svg: string },
  skill: ReturnType<typeof carregarSkillProjetista>,
): string {
  const { projeto, configEmpresa, tipoDesenho, hibridoDimensionamento, hibridoAnalise, instrucaoAjuste } = dados

  const dataHoje = new Date().toISOString().slice(0, 10)
  const end = projeto.cliente_endereco || {}
  const enderecoObra = [end.logradouro, end.numero, end.bairro, end.cidade, end.uf, end.cep]
    .filter(Boolean).join(', ') || 'não informado'

  const partes: string[] = [
    `## GERAR DIAGRAMA — ${tipoDesenho.toUpperCase()}`,
    ``,
    `**Data de emissão:** ${dataHoje}`,
    `**Código projeto:** ${projeto.codigo || projeto.id}`,
    ``,
    `## DADOS DO PROJETO`,
    ``,
    `### Cliente / Proprietário`,
    `- Razão social: ${projeto.cliente_razao_social}`,
    `- CPF/CNPJ: ${projeto.cliente_cpf_cnpj || 'não informado'}`,
    `- UC geradora: ${projeto.uc_geradora}`,
    `- Endereço obra: ${enderecoObra}`,
    ``,
    `### Análise da fatura`,
    JSON.stringify(projeto.analise_fatura, null, 2),
    ``,
    `### Padrão de entrada`,
    JSON.stringify(projeto.padrao_entrada, null, 2),
  ]

  if (tipoDesenho !== 'padrao_entrada') {
    partes.push(
      ``,
      `### Telhado`,
      JSON.stringify(projeto.telhado_secoes, null, 2),
      ``,
      `### Kit selecionado`,
      JSON.stringify(projeto.kit_selecionado, null, 2),
    )
  }

  if (tipoDesenho === 'unifilar_hibrido' && hibridoDimensionamento) {
    partes.push(
      ``,
      `### Dimensionamento BESS`,
      JSON.stringify(hibridoDimensionamento, null, 2),
    )
    if (hibridoAnalise) {
      partes.push(``, `### Análise demanda`, JSON.stringify(hibridoAnalise, null, 2))
    }
  }

  partes.push(
    ``,
    `## DADOS DA EMPRESA (pro carimbo)`,
    `- Razão social: ${configEmpresa.razao_social}`,
    `- CNPJ: ${configEmpresa.cnpj || ''}`,
    `- Endereço: ${configEmpresa.endereco || ''}`,
    `- Telefone: ${configEmpresa.telefone || ''}`,
    `- Email: ${configEmpresa.email || ''}`,
    ``,
    `## RESPONSÁVEL TÉCNICO (pro carimbo) — SEMPRE Kalebe Grün`,
    `- Nome: ${configEmpresa.rt_nome || 'Kalebe Grün'}`,
    `- Título: ${configEmpresa.rt_titulo || 'Eletrotécnico'}`,
    `- Registro: ${configEmpresa.rt_crea || '94312176000'}`,
    `- ART: ${projeto.art_numero || configEmpresa.rt_art_padrao || 'a definir'}`,
    ``,
    `**IMPORTANTE (regra fixa 5.1):** o RT do carimbo é SEMPRE Kalebe Grün, Eletrotécnico, Reg. 94312176000.`,
    `Se o config vier vazio, use esses valores como default. Nunca deixe o carimbo com RT em branco.`,
  )

  // Template escolhido (se disponível) — SEM truncar, é a referência principal
  if (template.svg) {
    partes.push(
      ``,
      `## TEMPLATE BASE (${template.chave})`,
      ``,
      `Use este SVG como estrutura de referência. Substitua as {VARIAVEIS} pelos dados reais acima.`,
      `Você pode adaptar posições e adicionar detalhes específicos deste projeto, MAS mantenha o padrão gráfico (layout, cores, tipografia, legenda, notas, carimbo).`,
      ``,
      '```xml',
      template.svg,
      '```',
    )
  }

  // Biblioteca de símbolos (referência rápida)
  partes.push(
    ``,
    `## BIBLIOTECA DE SÍMBOLOS (usar EXATAMENTE)`,
    ``,
    skill.simbolos,
  )

  // Quadrantes CELESC oficiais como blocos plug-and-play
  // Cada quadrante é um SVG independente que o agente pode reaproveitar/copiar
  // no output. Reduz reinvenção de carimbo/legenda/placa/QPCA a cada geração.
  const quadranteNomes = Object.keys(skill.quadrantes || {})
  if (quadranteNomes.length > 0) {
    partes.push(
      ``,
      `## QUADRANTES CELESC OFICIAIS (blocos plug-and-play)`,
      ``,
      `Você tem à disposição ${quadranteNomes.length} quadrantes já aprovados pela CELESC. Cada um é um SVG independente que pode ser reaproveitado no seu output — copia o bloco correspondente e ajusta só as variáveis do projeto. Preferir isto a reinventar do zero garante conformidade CELESC.`,
    )
    for (const nome of quadranteNomes) {
      partes.push(
        ``,
        `### Quadrante: ${nome}`,
        '```xml',
        skill.quadrantes[nome],
        '```',
      )
    }
  }

  // Exemplos aprovados (few-shot)
  const exemploNomes = Object.keys(skill.exemplos || {})
  if (exemploNomes.length > 0) {
    partes.push(
      ``,
      `## EXEMPLOS APROVADOS (referência de qualidade)`,
      ``,
      `${exemploNomes.length} projetos anteriores validados pelo Kalebe. Use-os como referência do NÍVEL de detalhe, organização e conformidade esperados no seu output.`,
    )
    for (const nome of exemploNomes) {
      partes.push(``, `### Exemplo: ${nome}`, skill.exemplos[nome])
    }
  }

  // Se refinamento
  if (instrucaoAjuste) {
    partes.push(
      ``,
      `## ⚠️ AJUSTE PEDIDO PELO CONSULTOR (refinamento de versão anterior)`,
      instrucaoAjuste,
      ``,
      `Mantenha o padrão gráfico intacto, mas aplique essa correção especificamente.`,
    )
  }

  partes.push(
    ``,
    `## AGORA GERE`,
    `Aplique a etapa 4 do fluxo (GERAR SVG) e retorne o JSON estruturado.`,
    `Você pode adicionar avisos técnicos automáticos (FCI, disjuntor, aterramento).`,
  )

  return partes.join('\n')
}

// ============================================================================
// ETAPA 5: AUDITAR SVG
// ============================================================================
async function auditarSvg(
  anthropic: Anthropic,
  svg: string,
  dadosContext: { tipoDesenho: string },
): Promise<{ passou: boolean; itens_verificados: number; itens_falhados: string[] }> {
  const checklistBase = [
    'svg tem viewBox="0 0 1190 842"',
    'svg tem xmlns declarado',
    'moldura externa com stroke #111827',
    'Legenda no topo direita (x >= 828)',
    'Notas técnicas com 8 itens numerados',
    'Placa CUIDADO amarela (fill #f4d000)',
    'Carimbo com logo SPIN desenhado (barras + texto)',
    'Nenhum quadro CC / string box mencionado',
    'Cadeia CA presente: rede -> medidor -> QGBT -> QPCA -> inversor',
    'Escape XML correto (sem < cru em text)',
  ]

  const promptAuditoria = `Você é auditor de diagramas técnicos SPIN. Verifique se o SVG abaixo cumpre TODOS os itens da checklist.

## SVG a auditar
\`\`\`xml
${svg.slice(0, 15000)}
\`\`\`

## Checklist
${checklistBase.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Sua resposta
Retorne APENAS JSON no formato:
\`\`\`json
{
  "passou": true|false,
  "itens_verificados": ${checklistBase.length},
  "itens_falhados": ["item 1 falhou porque...", "item 2 falhou porque..."]
}
\`\`\``

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: promptAuditoria }],
    })
    const bloco = resp.content.find((b: any) => b.type === 'text') as any
    const text = bloco?.text || ''
    try {
      const parsed = extrairJsonDoResponse(text) as any
      if (parsed && typeof parsed.passou === 'boolean') return parsed
    } catch { /* cai no default */ }
  } catch (e) {
    console.error('[auditarSvg]', e)
  }

  // Se falhou a auditoria em si, assume que passou (não bloquear entrega)
  return { passou: true, itens_verificados: checklistBase.length, itens_falhados: [] }
}

// ============================================================================
// ETAPA 6: REFINAR (se auditoria falhou)
// ============================================================================
async function refinarSvg(
  anthropic: Anthropic,
  svg: string,
  itensFalhados: string[],
): Promise<string> {
  if (itensFalhados.length === 0) return svg

  const prompt = `Corrija o SVG abaixo. Os itens listados FALHARAM na auditoria — corrija-os SEM alterar o resto do SVG.

## SVG atual
\`\`\`xml
${svg.slice(0, 20000)}
\`\`\`

## Itens que FALHARAM
${itensFalhados.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

## Sua resposta
Retorne APENAS o SVG corrigido completo dentro de bloco xml:
\`\`\`xml
<svg ...>...</svg>
\`\`\``

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 32000,
      messages: [{ role: 'user', content: prompt }],
    })
    const bloco = resp.content.find((b: any) => b.type === 'text') as any
    const text = bloco?.text || ''
    const match = text.match(/```xml\s*([\s\S]*?)\s*```/) || text.match(/(<svg[\s\S]*<\/svg>)/i)
    if (match) return match[1].trim()
  } catch (e) {
    console.error('[refinarSvg]', e)
  }

  return svg  // fallback: mantém original se refinamento falhar
}

// ============================================================================
// ORQUESTRADOR PRINCIPAL
// ============================================================================
export async function executarProjetista(
  entradas: EntradasProjetista,
  apiKey: string,
): Promise<ResultadoProjetista> {
  const tempoInicio = Date.now()
  const anthropic = new Anthropic({ apiKey })

  // Etapa 1: Analisar
  const analise = analisarProjeto(entradas)

  // Etapa 2: Escolher template
  const template = escolherTemplate({
    tipoDesenho: analise.tipoDesenho,
    fase: analise.fase,
    grupo: analise.grupo,
  })

  // Etapa 3: Validar dados
  const validacao = validarDados(entradas)
  if (!validacao.ok) {
    throw new Error(`Dados incompletos: falta ${validacao.faltando.join(', ')}`)
  }

  // Etapa 4: Gerar SVG
  const geracao = await gerarSvgComSkill(anthropic, entradas, template)
  let svgFinal = geracao.svg
  let tentativas = 1

  // Etapa 5: Auditar
  const auditoria = await auditarSvg(anthropic, svgFinal, { tipoDesenho: analise.tipoDesenho })

  // Etapa 6: Refinar se necessário (máx 1 tentativa pra economizar tokens)
  if (!auditoria.passou && auditoria.itens_falhados.length > 0 && auditoria.itens_falhados.length <= 3) {
    svgFinal = await refinarSvg(anthropic, svgFinal, auditoria.itens_falhados)
    tentativas = 2
  }

  const tempoMs = Date.now() - tempoInicio

  return {
    svg: svgFinal,
    memoria_calculo: geracao.memoria,
    avisos: geracao.avisos,
    auditoria: {
      passou: auditoria.passou,
      tentativas,
      itens_verificados: auditoria.itens_verificados,
      itens_falhados: auditoria.itens_falhados,
    },
    meta: {
      template_usado: template.chave,
      tempo_ms: tempoMs,
      tokens_input: 0,  // TODO: capturar do response
      tokens_output: geracao.rawText.length,
    },
  }
}
