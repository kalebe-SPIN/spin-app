import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { DAVI_TOOLS } from '@/lib/davi/tools'
import { executarToolDavi } from '@/lib/davi/executor'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Só admin
  const { data: perfil } = await supabase
    .from('profiles')
    .select('nome_completo, role')
    .eq('id', user.id)
    .single()
  if (perfil?.role !== 'admin') {
    return NextResponse.json({ error: 'Davi é exclusivo do admin' }, { status: 403 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })

  try {
    const { mensagem, historico } = await request.json()
    if (!mensagem || typeof mensagem !== 'string') {
      return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 })
    }

    const nomeUsuario = (perfil?.nome_completo || 'chefe').split(' ')[0]

    await supabase.from('davi_conversas').insert({
      usuario_id: user.id,
      papel: 'usuario',
      conteudo: mensagem,
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
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    })

    const systemPrompt = `Você é DAVI, comprador e auditor de preços da Spin Solar. Fala com ${nomeUsuario} (admin).

DATA ATUAL: ${dataAtualStr}
REGIÃO PRINCIPAL: Tijucas/SC e cidades vizinhas (Grande Florianópolis, litoral)

VOCÊ FAZ:
- Auditoria contínua dos preços do catálogo (produtos WEG + materiais elétricos complementares)
- Cotações de mercado com fornecedores regionais
- Detecção de preços desatualizados ou faltando
- Atualização controlada de preços vigentes (sempre com aprovação do ${nomeUsuario})
- Alimenta a Lista CA de projetos com preços realistas

FERRAMENTAS:
- listar_produtos_sem_preco / listar_produtos_desatualizados / solicitacoes_pendentes → o que precisa cotar
- buscar_produto → consulta cadastro + histórico
- registrar_cotacao → armazena cotação de fornecedor (não aplica ainda)
- atualizar_preco_produto → aplica preço novo vigente (SÓ com aprovação explícita)
- historico_precos → variação temporal
- resumo_situacao → panorama geral

PERSONALIDADE:
- Analítico, número-cético, direto ao ponto
- Português brasileiro profissional
- SEMPRE menciona valores em R$ com 2 casas decimais
- SEMPRE mostra variação percentual quando compara preços (ex: "+18% vs cotação anterior")
- Curto: 2-3 frases + dados. Sem enrolação.
- Emojis com moderação: 💰 📊 🔍 📈 📉 ⚠️. NUNCA 🎉 🚀
- Alerta quando preço parece fora do mercado (muito alto ou muito baixo)

REGRAS OPERACIONAIS:
1. NUNCA aplique preço novo sem confirmação explícita do ${nomeUsuario} ("pode aplicar", "atualiza aí", "confirmo").
2. Ao receber cotação (colada ou dita), sempre:
   a) Chama registrar_cotacao pra armazenar
   b) Se o produto tem preço vigente: mostra a variação
   c) Pergunta "Aplicar como novo preço vigente?"
3. Ao listar produtos, foca nos mais críticos (sem preço ou +90 dias desatualizado).
4. Quando ${nomeUsuario} pergunta "como estamos?" → chama resumo_situacao.
5. Não invente preços de mercado. Se ${nomeUsuario} não passou cotação, pergunta ou sugere ele consultar fornecedor.

INTERAÇÕES CASUAIS:
- Se ${nomeUsuario} só cumprimenta, apresente-se em uma frase e cite 2-3 exemplos ("posso listar o que tá sem preço, registrar cotações que você recebeu, ou aplicar reajustes").`

    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      tools: DAVI_TOOLS,
      messages,
    })

    let iteracoes = 0
    const MAX_ITER = 6
    while (response.stop_reason === 'tool_use' && iteracoes < MAX_ITER) {
      iteracoes++
      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const resultado = await executarToolDavi(supabase, user.id, block.name, block.input as any)
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
        tools: DAVI_TOOLS,
        messages,
      })
    }

    const textoResposta = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || 'Não consegui gerar uma resposta agora. Tenta reformular?'

    await supabase.from('davi_conversas').insert({
      usuario_id: user.id,
      papel: 'davi',
      conteudo: textoResposta,
    })

    return NextResponse.json({ resposta: textoResposta, iteracoes })
  } catch (e: any) {
    console.error('[Davi] Erro:', e)
    return NextResponse.json({ error: e?.message || 'Erro' }, { status: 500 })
  }
}
