import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

/**
 * API do Mestre da Elétrica — recebe o levantamento por listagem
 * feito pelo consultor Spin e retorna considerações técnicas + chat.
 *
 * Modos:
 *   1. Análise inicial: recebe lista de equipamentos → retorna resumo estruturado
 *   2. Chat: consultor pergunta algo → Mestre responde texto livre
 */

const MODEL = 'claude-sonnet-4-5-20250929'

type ItemPayload = {
  nome: string
  potenciaW: number
  tipoCarga: 'indutiva' | 'resistiva' | 'capacitiva'
  quantidade: number
  horasUsoDia?: number
  ehCargaCritica: boolean
}

const PROMPT_MESTRE_ANALISE = `Você é o Mestre da Elétrica, consultor técnico sênior da Spin Solar (empresa de energia solar em Tijucas/SC).

Sua missão: analisar um levantamento de equipamentos feito por consultor no site do cliente e produzir uma análise técnica pra dimensionar um sistema híbrido (solar + baterias WEG).

CONTEXTO TÉCNICO:
- Inversor híbrido WEG SIW200H (mono 3-8kW) ou SIW400H (tri 10-30kW)
- Bateria SBW CB050 (5kWh) ou SBW CB100 (10kWh) LiFePO4
- Fator de simultaneidade típico brasileiro: 0.5-0.7 (raramente 100% ligado ao mesmo tempo)
- Motores/ar cond têm pico de partida 3-5× a potência nominal — o inversor precisa suportar
- Cargas ESSENCIAIS pro backup: iluminação, geladeira, roteador, alarme, portão, bombas
- Cargas OPCIONAIS pro backup: chuveiro, ferro, secadora (alta potência, uso intermitente)

RESPONDA APENAS COM JSON VÁLIDO NO FORMATO:
{
  "potenciaEfetivaSugeridaKw": number,
  "cargaCriticaSugeridaKw": number,
  "autonomiaSugeridaHoras": number,
  "composicao": { "indutiva": number, "resistiva": number, "capacitiva": number },
  "fatorSimultaneidade": number (entre 0.5 e 0.8),
  "observacoes": [
    "3-6 considerações técnicas curtas e diretas em português brasileiro"
  ],
  "alertaPicoPartida": "string ou null — só se houver motor/ar cond significativo",
  "resumoTexto": "1-2 parágrafos em português brasileiro conversacional pro consultor, dando um veredicto do levantamento e as próximas perguntas que ele deve fazer ao cliente"
}

DIRETRIZES:
1. potenciaEfetivaSugeridaKw = potência instalada × fator simultaneidade (ajustado ao perfil)
2. cargaCriticaSugeridaKw = só as cargas marcadas como críticas (o que o cliente quer manter no backup)
3. autonomiaSugeridaHoras = média das quedas de energia em SC (2-6h) — sugerir 4h para residencial, 2h comercial, 3h industrial
4. Sempre calcular a composição real do que foi selecionado
5. Se tiver motor/ar cond acima de 1kW, incluir alertaPicoPartida
6. observacoes: seja técnico, prático e curto
7. resumoTexto: converse com o consultor como um mentor experiente — use "você", explique o porquê`

const PROMPT_MESTRE_CHAT = `Você é o Mestre da Elétrica da Spin Solar — engenheiro sênior conversando com um consultor Spin no campo.

Você acabou de analisar um levantamento de equipamentos e apresentou considerações. Agora o consultor tá te perguntando algo. Responda de forma:
- Direta e conversacional (português brasileiro)
- Técnica mas acessível
- Curta (2-4 frases)
- Prática — sugerindo o que perguntar ao cliente ou o que ajustar no dimensionamento
- Se necessário, mencione peças WEG específicas (SIW200H, SIW400H, SBW CB050/CB100, EMBOX, MMW03-M22CH)`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    // ─── MODO CHAT ───
    if (body.modo === 'chat') {
      const { pergunta, contextoResumo, conversa = [] } = body
      const historicoTexto = conversa
        .map((m: any) => `${m.quem === 'consultor' ? 'Consultor' : 'Mestre'}: ${m.texto}`)
        .join('\n\n')

      const contexto = `Contexto do levantamento analisado:
- Potência efetiva: ${contextoResumo.potenciaEfetivaSugeridaKw?.toFixed(1)}kW
- Carga crítica: ${contextoResumo.cargaCriticaSugeridaKw?.toFixed(1)}kW
- Autonomia sugerida: ${contextoResumo.autonomiaSugeridaHoras?.toFixed(1)}h
- Composição: ${contextoResumo.composicao?.indutiva?.toFixed(0)}% indutiva / ${contextoResumo.composicao?.resistiva?.toFixed(0)}% resistiva / ${contextoResumo.composicao?.capacitiva?.toFixed(0)}% capacitiva
- Fator simultaneidade: ${(contextoResumo.fatorSimultaneidade * 100)?.toFixed(0)}%

${historicoTexto ? `Conversa até agora:\n${historicoTexto}\n\n` : ''}Nova pergunta do consultor: ${pergunta}`

      const resposta = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: PROMPT_MESTRE_CHAT,
        messages: [{ role: 'user', content: contexto }],
      })

      const texto = resposta.content
        .filter((c) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n')

      return NextResponse.json({ resposta: texto })
    }

    // ─── MODO ANÁLISE INICIAL ───
    const { itens, resumo } = body as {
      itens: ItemPayload[]
      resumo: {
        potenciaInstaladaW: number
        potenciaCargaCriticaW: number
        percIndutiva: number
        percResistiva: number
        percCapacitiva: number
        consumoEstimadoMensalKwh: number
      }
    }

    if (!itens || itens.length === 0) {
      return NextResponse.json({ error: 'Lista de equipamentos vazia' }, { status: 400 })
    }

    const listaTexto = itens
      .map(
        (i) =>
          `- ${i.quantidade}× ${i.nome} (${i.potenciaW}W · ${i.tipoCarga})${i.ehCargaCritica ? ' [BACKUP]' : ''}${i.horasUsoDia ? ` · ${i.horasUsoDia}h/dia` : ''}`,
      )
      .join('\n')

    const contexto = `LEVANTAMENTO DO CONSULTOR SPIN:

${listaTexto}

CÁLCULOS AUTOMÁTICOS:
- Potência total instalada: ${(resumo.potenciaInstaladaW / 1000).toFixed(2)} kW
- Potência marcada como crítica: ${(resumo.potenciaCargaCriticaW / 1000).toFixed(2)} kW
- Composição: ${resumo.percIndutiva.toFixed(1)}% indutiva · ${resumo.percResistiva.toFixed(1)}% resistiva · ${resumo.percCapacitiva.toFixed(1)}% capacitiva
- Consumo estimado: ${resumo.consumoEstimadoMensalKwh.toFixed(0)} kWh/mês

Analise esse levantamento e retorne o JSON estruturado.`

    const resposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: PROMPT_MESTRE_ANALISE,
      messages: [{ role: 'user', content: contexto }],
    })

    const jsonTexto = resposta.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')

    // Extrai JSON da resposta (Claude às vezes envolve em ```json)
    const match = jsonTexto.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: 'Resposta do Mestre inválida', raw: jsonTexto }, { status: 500 })
    }

    const consideracoes = JSON.parse(match[0])
    return NextResponse.json({ consideracoes })
  } catch (e: any) {
    console.error('[consultar-mestre-eletrica]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
