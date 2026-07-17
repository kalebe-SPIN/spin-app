import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(_request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
  }

  try {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('nome_completo')
      .eq('id', user.id)
      .single()
    const primeiroNome = (perfil?.nome_completo || 'chefe').split(' ')[0]

    const inicioHoje = new Date()
    inicioHoje.setHours(0, 0, 0, 0)
    const fimHoje = new Date(inicioHoje)
    fimHoje.setDate(fimHoje.getDate() + 1)
    const fimSemana = new Date(inicioHoje)
    fimSemana.setDate(fimSemana.getDate() + 7)

    const [
      { data: eventosHoje },
      { data: eventosSemana },
      { data: tarefasHoje },
      { data: tarefasVencidas },
      { data: tarefasPendentes },
    ] = await Promise.all([
      supabase
        .from('agenda_eventos')
        .select('titulo, data_hora_inicio, local, tipo, projeto:projeto_id (cliente_razao_social)')
        .eq('usuario_id', user.id)
        .gte('data_hora_inicio', inicioHoje.toISOString())
        .lt('data_hora_inicio', fimHoje.toISOString())
        .order('data_hora_inicio', { ascending: true }),
      supabase
        .from('agenda_eventos')
        .select('titulo, data_hora_inicio')
        .eq('usuario_id', user.id)
        .gte('data_hora_inicio', fimHoje.toISOString())
        .lt('data_hora_inicio', fimSemana.toISOString())
        .order('data_hora_inicio', { ascending: true }),
      supabase
        .from('agenda_tarefas')
        .select('titulo, prioridade')
        .eq('usuario_id', user.id)
        .eq('status', 'pendente')
        .eq('data_prazo', inicioHoje.toISOString().slice(0, 10)),
      supabase
        .from('agenda_tarefas')
        .select('titulo, prioridade, data_prazo')
        .eq('usuario_id', user.id)
        .eq('status', 'pendente')
        .lt('data_prazo', inicioHoje.toISOString().slice(0, 10)),
      supabase
        .from('agenda_tarefas')
        .select('titulo, prioridade')
        .eq('usuario_id', user.id)
        .eq('status', 'pendente')
        .in('prioridade', ['alta', 'urgente'])
        .limit(5),
    ])

    const agora = new Date()
    const hora = parseInt(agora.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    }), 10)
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

    const dadosResumo = {
      saudacao,
      nome: primeiroNome,
      eventos_hoje: (eventosHoje || []).map((e: any) => ({
        titulo: e.titulo,
        hora: new Date(e.data_hora_inicio).toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
        }),
        local: e.local,
        cliente: e.projeto?.cliente_razao_social,
      })),
      eventos_proximos_dias: (eventosSemana || []).slice(0, 3).map((e: any) => ({
        titulo: e.titulo,
        quando: new Date(e.data_hora_inicio).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          weekday: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })),
      tarefas_hoje: (tarefasHoje || []).length,
      tarefas_vencidas: (tarefasVencidas || []).length,
      tarefas_urgentes: (tarefasPendentes || [])
        .filter((t: any) => t.prioridade === 'urgente')
        .map((t: any) => t.titulo)
        .slice(0, 3),
    }

    const anthropic = new Anthropic({ apiKey })

    const systemPrompt = `Você é Bianca, secretária executiva IA da Spin Solar. Vai narrar um resumo do dia pro ${primeiroNome}. Este texto será CONVERTIDO EM FALA por text-to-speech — escreva pra ser OUVIDO, não lido.

REGRAS:
- Comece com "${saudacao}, ${primeiroNome}!"
- Português brasileiro natural e amistoso, como uma secretária real falando
- SEM emojis (não faz sentido em áudio)
- SEM markdown, símbolos ou listas com bullet — use frases corridas conectadas com "e", "além disso", "também"
- Se não tem eventos nem tarefas: uma frase curta tipo "Sua agenda tá limpa hoje. Bom descanso!"
- Se tem coisas: menciona compromissos de hoje com hora, depois pendências urgentes
- Máximo 5-6 frases naturais no total
- Tom: profissional mas leve, como se fosse falar cara a cara
- Termine com uma frase curta motivacional ou "conta comigo pra qualquer coisa"

DADOS:`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Aqui estão os dados pra você narrar:\n\n${JSON.stringify(dadosResumo, null, 2)}`,
        },
      ],
    })

    const resumo = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || `${saudacao}, ${primeiroNome}!`

    return NextResponse.json({
      resumo,
      metadados: {
        eventos_hoje: dadosResumo.eventos_hoje.length,
        tarefas_vencidas: dadosResumo.tarefas_vencidas,
        tarefas_urgentes: dadosResumo.tarefas_urgentes.length,
      },
    })
  } catch (e: any) {
    console.error('[Bianca resumo] Erro:', e)
    const { traduzirErroAnthropic } = await import('@/lib/bianca/erros')
    const t = traduzirErroAnthropic(e)
    const httpStatus =
      t.codigo === 'sem_creditos' ? 402 :
      t.codigo === 'rate_limit' ? 429 :
      t.codigo === 'chave_invalida' ? 401 :
      t.codigo === 'servidor' ? 503 : 500
    return NextResponse.json(
      { error: t.mensagem, error_code: t.codigo, error_acao: t.acao },
      { status: httpStatus },
    )
  }
}
