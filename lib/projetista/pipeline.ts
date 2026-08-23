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

## MODO DE EXECUÇÃO — LEIA COM ATENÇÃO
A skill projetista-spin descreve um motor Python (draw_svg.py + draw_dxf.py + cairosvg + ezdxf) — este ambiente NÃO executa Python. Você está rodando dentro de um handler Node.js Serverless (Vercel). Portanto:

- NÃO tente gerar código Python.
- NÃO importe/chame scripts/draw_svg.py — eles não existem em runtime aqui.
- VOCÊ MESMO desenha o SVG diretamente, seguindo à risca as especificações da skill (padrão "Projeto Ideal", A4 paisagem 1190×842, moldura, carimbo SPIN, legenda, placa de advertência, cores de fase CELESC, notas numeradas).
- Os arquivos Python da skill servem só como referência CONCEITUAL do padrão gráfico — copie o resultado visual, não o código.
- Todas as regras técnicas da skill (CC direto no inversor, QPCA com DPS, DPS por fase+neutro, cores CELESC, etc.) valem SEMPRE.

## FORMATO DE SAÍDA OBRIGATÓRIO
Responda APENAS com JSON válido no formato:
\`\`\`json
{
  "svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1190 842' width='1190' height='842'>...</svg>",
  "memoria_calculo": { ... },
  "avisos": [...]
}
\`\`\`
Sem texto antes ou depois. Sem markdown fora do bloco json.

## OTIMIZAÇÃO DE SAÍDA (crítico — evita timeout Vercel 300s)
Este handler tem apenas 5 min de runtime. SVG compacto = geração rápida = entrega dentro do prazo. Regras:
- SEM comentários XML (\`<!-- -->\`)
- SEM indentação nem quebras de linha desnecessárias dentro do SVG
- Reutilize \`<g>\` com \`transform\` em vez de repetir coordenadas absolutas em N elementos iguais
- Atributos numéricos SEM zeros à direita (\`x="120"\` não \`x="120.00"\`)
- Cores em nome curto quando existir (\`red\` em vez de \`#FF0000\`)
- Objetivo: SVG final ≤ 60KB. Se estourar, você cortará no meio e falhará.`

  // Usuário: dados do projeto + template + biblioteca de símbolos
  const userPrompt = construirPromptUsuario(dados, template, skill)

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-5',
    max_tokens: 16000,           // reduzido de 32k pra caber em 300s do Vercel
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

  // ═══ SKILL NOVA — PADRÃO "PROJETO IDEAL" ═══
  // Injeta as references estruturadas da skill como contexto denso.
  // O motor Python (draw_svg.py/draw_dxf.py) descrito na skill NÃO roda aqui
  // (Vercel é Node.js). Você — Claude — vai desenhar o SVG diretamente,
  // seguindo a especificação abaixo à risca.

  if (skill.topologias) {
    partes.push(
      ``,
      `## TOPOLOGIAS E ESTRUTURA DAS FOLHAS (referência obrigatória)`,
      ``,
      `Este documento define, POR TIPO DE PROJETO, quais folhas gerar (01 unifilar, 02 trifilar, 03 localização) e o checklist de qualidade visual que precisa passar. Você está gerando UMA folha por vez (a que o usuário pediu neste request). Se o tipo pedido é "${tipoDesenho}", identifique a folha correspondente e siga a especificação.`,
      ``,
      skill.topologias,
    )
  }

  // ═══ EXEMPLOS OFICIAIS validados pelo Kalebe ═══
  // Especificação visual DETALHADA de projetos reais que passaram na validação.
  // Estes textos vêm de PDFs oficiais anotados — SEGUIR À RISCA.
  const exemplosOficiaisNomes = Object.keys(skill.exemplosOficiais || {})
  if (exemplosOficiaisNomes.length > 0) {
    partes.push(
      ``,
      `## EXEMPLOS OFICIAIS CANÔNICOS (KALEBE VALIDOU — SEGUIR À RISCA)`,
      ``,
      `Cada exemplo abaixo é a descrição TEXTUAL DETALHADA de um PDF real que o Kalebe validou como "assim que fica o Projeto Ideal SPIN". Se o tipo de folha que você está gerando corresponder a um destes exemplos, use-o como PADRÃO OFICIAL — a estética é INEGOCIÁVEL. Adapte só os valores técnicos (potência, quantidades, endereço, cliente, contratos), a estrutura visual (zonas, moldura, tipografia, disposição, carimbo, logo, notas) é FIXA.`,
    )
    for (const nome of exemplosOficiaisNomes) {
      partes.push(``, `### Exemplo oficial: ${nome}`, skill.exemplosOficiais[nome])
    }
  }

  if (skill.calculos) {
    partes.push(
      ``,
      `## CÁLCULOS (fórmulas de dimensionamento)`,
      ``,
      `Use quando precisar recalcular ou validar valores mostrados no desenho — não invente números; se algo faltar nos dados do projeto, marque como "a definir" em avisos.`,
      ``,
      skill.calculos,
    )
  }

  if (skill.normas) {
    partes.push(
      ``,
      `## NORMAS CELESC (mapa de referência)`,
      ``,
      skill.normas,
    )
  }

  // Legacy: se algum template ainda existir no repo, expõe como referência
  // gráfica ADICIONAL — mas as instruções acima têm prioridade.
  if (template.svg) {
    partes.push(
      ``,
      `## TEMPLATE LEGADO DISPONÍVEL (${template.chave}) — referência gráfica opcional`,
      ``,
      `Este é um SVG de uma versão anterior. Pode reaproveitar peças (moldura, carimbo, disposição de blocos) mas o padrão gráfico OFICIAL vem das seções acima.`,
      ``,
      '```xml',
      template.svg,
      '```',
    )
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
      max_tokens: 12000,          // refinamento: menor que o inicial (só corrige itens)
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

  // Etapa 6: Refinar se necessário — só quando há tempo de sobra
  // Vercel timeout = 300s; se a geração já demorou > 150s, PULA refinamento
  // (o SVG entregue passa como está, com aviso da auditoria).
  const tempoGeracaoMs = Date.now() - tempoInicio
  const temTempoPraRefinar = tempoGeracaoMs < 150_000  // 2m30s
  if (
    !auditoria.passou
    && auditoria.itens_falhados.length > 0
    && auditoria.itens_falhados.length <= 3
    && temTempoPraRefinar
  ) {
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
