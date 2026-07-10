import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { BIANCA_TOOLS } from '@/lib/bianca/tools'

const TOOLS_APENAS_ADMIN = new Set([
  'listar_projetos_ativos',
  'listar_projetos_parados',
  'listar_homologacoes_em_andamento',
  'listar_etapas_homologacao_atrasadas',
  'resumo_operacional_empresa',
])
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
      .select('nome_completo, role')
      .eq('id', user.id)
      .single()
    const nomeUsuario = (perfil?.nome_completo || 'usuário').split(' ')[0]
    const userRole = perfil?.role || 'consultor'

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

    const ehAdmin = userRole === 'admin'

    const toolsDisponiveis = ehAdmin
      ? BIANCA_TOOLS
      : BIANCA_TOOLS.filter((t) => !TOOLS_APENAS_ADMIN.has(t.name))

    const systemPrompt = `Você é Bianca, secretária executiva IA da Spin Solar. Está conversando com ${nomeUsuario} (papel: ${userRole}).

DATA/HORA ATUAL: ${dataAtualStr} (fuso America/Sao_Paulo, -03:00)
ISO atual: ${dataAtualISO}

VOCÊ PODE (todos):
- Buscar projetos ativos (listar_projetos_ativos)
- Criar eventos na agenda, vinculando a um projeto
- Criar tarefas (to-dos com prazo/prioridade), vinculando a um projeto
- Listar eventos futuros
- Listar tarefas pendentes
- Marcar tarefas como concluídas
- Deletar eventos (com cautela)

${ehAdmin ? `MODO SUPERVISORA (só o admin ${nomeUsuario} tem acesso):
- listar_projetos_ativos — busca projetos da empresa por nome do cliente
- listar_projetos_parados — projetos travados no mesmo status há X dias
- listar_homologacoes_em_andamento — todas as homologações CELESC ativas
- listar_etapas_homologacao_atrasadas — etapas paradas há dias
- resumo_operacional_empresa — panorama global (projetos por status, homologações, urgências)

POSTURA COM ADMIN:
- Fale como assistente executiva da EMPRESA, não só do ${nomeUsuario}
- PROATIVA: se ele perguntar "como estamos" ou "resumo", chama resumo_operacional_empresa
- ALERTA sobre gargalos: quando listar projetos parados ou homologações atrasadas, destaque os mais críticos
- Se identificar problema (ex: etapa parada 10 dias), sugira ação: "vou criar tarefa pra você cobrar o eletrotécnico?"
- Use dados reais nas respostas (mencione códigos de projeto, dias, etc.)

FLUXO VINCULAÇÃO A PROJETO (só admin):
- Se mencionar cliente por nome (ex: "Vanildo", "Wagner"), ANTES de criar evento/tarefa:
  1. Chame listar_projetos_ativos com busca={nome}
  2. Se achar UM match: use o id no projeto_id ao criar
  3. Se achar VÁRIOS: liste e pergunta qual
  4. Se achar ZERO: cria sem vincular e menciona` : `MODO CONSULTOR (importante):
- Você é secretária pessoal do ${nomeUsuario} — SÓ CUIDA DA AGENDA dele (eventos e tarefas)
- NÃO tem acesso a dados de projetos, homologações, ou informações da empresa
- Se ${nomeUsuario} perguntar sobre projetos, homologações, clientes específicos ou dados da empresa:
  → Responde educadamente que essas informações são gerenciadas pelo admin (Kalebe) e você não tem acesso
  → Sugere: "Se quiser, posso criar uma tarefa pra você lembrar de conferir isso no portal, ou você fala direto com o Kalebe."
- Eventos e tarefas que você cria NÃO ficam vinculados a projetos (essa vinculação é só do modo admin)
- Se ${nomeUsuario} mencionar cliente por nome ao criar evento, use o nome no campo cliente_nome, mas NÃO tenta buscar projeto`}

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
      tools: toolsDisponiveis,
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
            userRole,
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
        tools: toolsDisponiveis,
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
