import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { BIANCA_TOOLS } from '@/lib/bianca/tools'
import { executarTool } from '@/lib/bianca/executor'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY não configurada no servidor.' },
      { status: 500 },
    )
  }

  try {
    const { mensagem, historico } = await request.json()
    if (!mensagem || typeof mensagem !== 'string') {
      return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 })
    }

    const { data: perfil } = await supabase
      .from('profiles')
      .select('nome_completo')
      .eq('id', user.id)
      .single()
    const nomeUsuario = (perfil?.nome_completo || 'usuário').split(' ')[0]

    await supabase.from('bianca_conversas').insert({
      usuario_id: user.id,
      papel: 'usuario',
      conteudo: mensagem,
      canal: 'chat',
    })

    const anthropic = new Anthropic({ apiKey })

    const messages: Anthropic.MessageParam[] = [
      ...(Array.isArray(historico) ? historico : [])
        .filter((h: any) => h?.conteudo)
        .map((h: any) => ({
          role: (h.papel === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: h.conteudo as string,
        })),
      { role: 'user', content: mensagem },
    ]

    const agora = new Date()
    const dataAtualStr = agora.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const dataAtualISO = agora.toISOString()

    const systemPrompt = `Você é Bianca, secretária executiva IA da Spin Solar. Está conversando com ${nomeUsuario}.

DATA/HORA ATUAL: ${dataAtualStr} (fuso America/Sao_Paulo, -03:00)
ISO atual: ${dataAtualISO}

VOCÊ PODE:
- Criar eventos na agenda (reuniões, visitas, ligações)
- Criar tarefas (to-dos com prazo e prioridade)
- Listar eventos futuros
- Listar tarefas pendentes
- Marcar tarefas como concluídas
- Deletar eventos (com cautela)

PERSONALIDADE:
- Direta, prática, profissional, amigável
- Português brasileiro informal (sem gerundismo, sem "estarei enviando")
- Curta nas respostas — máximo 2-3 frases
- Quando cria evento/tarefa, confirma resumindo (ex: "Marquei visita ao Vanildo pra amanhã 14h ✓")
- Quando lista, formata em bullet points curtos com bullet "-"
- Use emojis com moderação (📅 ✓ 🔔 sim; 🎉 🚀 não)

REGRAS PRA CRIAR EVENTOS:
- SEMPRE use timezone -03:00 nas datas ISO
- Se o usuário disser "amanhã 14h", calcule o ISO baseado na DATA ATUAL acima
- Se disser "sexta que vem", "próxima quarta" etc — calcule a data específica
- Se faltar o horário, pergunte objetivamente ("Que horas?")
- Duração padrão: 1h se não especificar fim

REGRAS PRA CRIAR TAREFAS:
- Se o usuário disser "até sexta", converta pra YYYY-MM-DD
- Prioridade padrão: 'media'. Se falar "urgente", use 'urgente'

INTERAÇÕES CASUAIS:
- Se só cumprimentar, apresente-se em uma frase e liste 2-3 exemplos do que pode fazer
- Se pergunta ambígua, peça uma clarificação SIMPLES em uma linha`

    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      tools: BIANCA_TOOLS,
      messages,
    })

    let iteracoes = 0
    const MAX_ITER = 6
    const itensCriados: { tipo: 'evento' | 'tarefa'; id: string }[] = []

    while (response.stop_reason === 'tool_use' && iteracoes < MAX_ITER) {
      iteracoes++

      messages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const resultado = await executarTool(
            supabase,
            user.id,
            block.name,
            block.input as any,
          )

          if (resultado.sucesso && resultado.dados?.id) {
            if (block.name === 'criar_evento') {
              itensCriados.push({ tipo: 'evento', id: resultado.dados.id })
            } else if (block.name === 'criar_tarefa') {
              itensCriados.push({ tipo: 'tarefa', id: resultado.dados.id })
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(resultado),
            is_error: !resultado.sucesso,
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        tools: BIANCA_TOOLS,
        messages,
      })
    }

    const textoResposta = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || 'Não consegui gerar uma resposta agora. Tenta reformular?'

    await supabase.from('bianca_conversas').insert({
      usuario_id: user.id,
      papel: 'bianca',
      conteudo: textoResposta,
      canal: 'chat',
    })

    // Se criou algum evento/tarefa, arquiva a conversa nesse item
    let chatArquivado = false
    if (itensCriados.length > 0) {
      const { data: msgsAtivas } = await supabase
        .from('bianca_conversas')
        .select('id, papel, conteudo, created_at')
        .eq('usuario_id', user.id)
        .eq('canal', 'chat')
        .eq('arquivada', false)
        .order('created_at', { ascending: false })
        .limit(20)

      if (msgsAtivas && msgsAtivas.length > 0) {
        const textoContexto = msgsAtivas
          .slice()
          .reverse()
          .map((m: any) => {
            const quem = m.papel === 'usuario' ? nomeUsuario : 'Bianca'
            const quando = new Date(m.created_at).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
            return `[${quando}] ${quem}: ${m.conteudo}`
          })
          .join('\n\n')

        for (const item of itensCriados) {
          const tabela = item.tipo === 'evento' ? 'agenda_eventos' : 'agenda_tarefas'
          await supabase
            .from(tabela)
            .update({ contexto_conversa: textoContexto })
            .eq('id', item.id)
        }

        await supabase
          .from('bianca_conversas')
          .update({ arquivada: true })
          .in('id', msgsAtivas.map((m: any) => m.id))

        chatArquivado = true
      }
    }

    return NextResponse.json({
      resposta: textoResposta,
      iteracoes,
      chatArquivado,
      itensCriados: itensCriados.length,
    })
  } catch (e: any) {
    console.error('[Bianca] Erro:', e)
    return NextResponse.json(
      { error: e?.message || 'Erro na Bianca' },
      { status: 500 },
    )
  }
}
