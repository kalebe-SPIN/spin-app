/**
 * Motor de gatilhos reativos da Bianca.
 *
 * Fluxo:
 *   1. Algum ponto do sistema chama dispararGatilho('chave', contexto).
 *   2. Motor busca config do gatilho, aplica template com variaveis do contexto,
 *      opcionalmente refina com Claude, e executa a acao (whatsapp/tarefa/notif).
 *   3. Registra tudo em bianca_eventos_disparados pra auditoria.
 *
 * Kalebe escolheu:
 *   - Modo hibrido (alguns automaticos, outros sugeridos)
 *   - Templates com {variaveis} + Bianca refina com IA quando marcado
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export type ContextoEvento = {
  projeto_id?: string | null
  cliente_id?: string | null
  usuario_id?: string | null
  entidade_tipo?: 'projeto' | 'homologacao' | 'proposta' | 'comunicacao_wa' | 'item_projeto' | null
  entidade_id?: string | null
  // Variaveis do template
  variaveis: Record<string, string | number | null | undefined>
  // Instrucao adicional pra Bianca (opcional, sobrescreve contexto_ia do gatilho)
  instrucao_ia_extra?: string
}

export type ResultadoDisparo = {
  sucesso: boolean
  evento_id?: string
  gatilho_desativado?: boolean
  mensagem_gerada?: string
  status_final?: string
  comunicacao_id?: string
  tarefa_id?: string
  erro?: string
}

/**
 * Substitui {variaveis} no template pelos valores do contexto.
 * Variaveis nao encontradas viram "[?]" (evita quebrar mensagem).
 */
function substituirVariaveis(template: string, vars: Record<string, any>): string {
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_, chave) => {
    const valor = vars[chave]
    return valor != null && valor !== '' ? String(valor) : '[?]'
  })
}

/**
 * Refina o texto com Claude Haiku (rapido e barato pra ajustes de tom).
 * Se falhar, retorna o texto original — nao bloqueia o disparo.
 */
async function refinarComIA(
  textoBase: string,
  contextoIA: string | null,
  extraContexto: string | undefined,
): Promise<{ texto: string; refinou: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { texto: textoBase, refinou: false }

  try {
    const anthropic = new Anthropic({ apiKey })
    const instrucao = [contextoIA, extraContexto].filter(Boolean).join('\n')

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: `Voce e a Bianca, secretaria IA da Spin Solar. Refinamento de mensagem pra WhatsApp/canal cliente.
Retorne APENAS o texto refinado, sem explicacoes, sem aspas, sem prefixos.
Mantenha o portugues brasileiro natural, sem gerundios exagerados, sem "prezado".
Se o texto original ja esta bom, retorne ele mesmo com pequenos ajustes de tom.
Nao invente informacoes que nao estao no texto original.`,
      messages: [{
        role: 'user',
        content: `Texto original:\n"${textoBase}"\n\nInstrucao de refinamento:\n${instrucao || 'Ajuste o tom pra soar mais natural mantendo profissionalismo.'}\n\nRefine e devolva SO o texto pronto pra enviar:`,
      }],
    })

    const bloco = resp.content.find((b: any) => b.type === 'text') as any
    const refinado = bloco?.text?.trim() || textoBase
    return { texto: refinado, refinou: true }
  } catch (e: any) {
    console.error('[gatilhos] refinamento IA falhou:', e?.message)
    return { texto: textoBase, refinou: false }
  }
}

/**
 * Dispara um gatilho pelo nome. Chamada em qualquer lugar do backend.
 *
 * Exemplo:
 *   await dispararGatilho('proposta_aceita', {
 *     projeto_id: p.id,
 *     usuario_id: p.consultor_id,
 *     entidade_tipo: 'projeto',
 *     entidade_id: p.id,
 *     variaveis: {
 *       cliente_nome: p.cliente_razao_social,
 *       codigo_projeto: p.codigo,
 *       rt_nome: configEmpresa.rt_nome,
 *     },
 *   })
 */
export async function dispararGatilho(
  chave: string,
  contexto: ContextoEvento,
): Promise<ResultadoDisparo> {
  const supabase = createAdminClient()

  // 1. Busca config do gatilho
  const { data: gatilho } = await supabase
    .from('bianca_gatilhos')
    .select('*')
    .eq('chave', chave)
    .maybeSingle()

  if (!gatilho) {
    return { sucesso: false, erro: `Gatilho '${chave}' nao existe` }
  }
  if (!gatilho.ativo || gatilho.modo === 'desligado') {
    return { sucesso: true, gatilho_desativado: true, status_final: 'descartada' }
  }

  // 2. Cria registro do evento (status='processando')
  const { data: evento, error: evErr } = await supabase
    .from('bianca_eventos_disparados')
    .insert({
      gatilho_chave: chave,
      projeto_id: contexto.projeto_id ?? null,
      cliente_id: contexto.cliente_id ?? null,
      usuario_id: contexto.usuario_id ?? null,
      entidade_tipo: contexto.entidade_tipo ?? null,
      entidade_id: contexto.entidade_id ?? null,
      dados_evento: contexto.variaveis,
      status: 'processando',
    })
    .select('id')
    .single()

  if (evErr || !evento) {
    return { sucesso: false, erro: evErr?.message || 'Falha ao registrar evento' }
  }

  // 3. Substitui variaveis
  let mensagem = substituirVariaveis(gatilho.template_base, contexto.variaveis)

  // 4. Refina com IA se marcado (nao bloqueia se falhar)
  let refinada = false
  if (gatilho.refinar_com_ia) {
    const r = await refinarComIA(mensagem, gatilho.contexto_ia, contexto.instrucao_ia_extra)
    mensagem = r.texto
    refinada = r.refinou
  }

  // 5. Executa acao conforme canal + modo
  const acao = await executarAcao({
    gatilho,
    mensagem,
    contexto,
  })

  // 6. Atualiza registro final
  await supabase
    .from('bianca_eventos_disparados')
    .update({
      mensagem_gerada: mensagem,
      refinada_por_ia: refinada,
      status: acao.status_final,
      erro: acao.erro,
      comunicacao_id: acao.comunicacao_id ?? null,
      tarefa_id: acao.tarefa_id ?? null,
      processado_em: new Date().toISOString(),
    })
    .eq('id', evento.id)

  return {
    sucesso: !acao.erro,
    evento_id: evento.id,
    mensagem_gerada: mensagem,
    status_final: acao.status_final,
    comunicacao_id: acao.comunicacao_id,
    tarefa_id: acao.tarefa_id,
    erro: acao.erro,
  }
}

/**
 * Executa a acao concreta baseada no canal + modo do gatilho.
 * Cria registro correspondente (comunicacao / tarefa) e retorna vinculo.
 */
async function executarAcao(args: {
  gatilho: any
  mensagem: string
  contexto: ContextoEvento
}): Promise<{
  status_final: string
  erro?: string
  comunicacao_id?: string
  tarefa_id?: string
}> {
  const supabase = createAdminClient()
  const { gatilho, mensagem, contexto } = args

  try {
    // === Canal: whatsapp (mensagem pro cliente) ===
    if (gatilho.canal === 'whatsapp') {
      const telefone = String(contexto.variaveis.cliente_telefone || '').replace(/\D/g, '')
      const nomeDestino = String(contexto.variaveis.cliente_nome || 'Cliente')

      if (!telefone) {
        return { status_final: 'falhou', erro: 'Telefone nao informado no contexto' }
      }

      const link_wa = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
      const status = gatilho.modo === 'automatico' ? 'enviada_bianca' : 'sugerida'

      const { data: com, error } = await supabase
        .from('bianca_comunicacoes')
        .insert({
          usuario_id: contexto.usuario_id || null,
          projeto_id: contexto.projeto_id || null,
          destinatario_nome: nomeDestino,
          destinatario_telefone: telefone,
          canal: 'whatsapp',
          mensagem,
          link_wa,
          status,
          gatilho_chave: gatilho.chave,
        })
        .select('id')
        .single()

      if (error) return { status_final: 'falhou', erro: error.message }
      return {
        status_final: gatilho.modo === 'automatico' ? 'enviada_auto' : 'sugerida',
        comunicacao_id: com?.id,
      }
    }

    // === Canal: tarefa_agenda (tarefa pro consultor ou admin) ===
    if (gatilho.canal === 'tarefa_agenda') {
      const usuarioDestino = gatilho.publico_alvo === 'admin'
        ? await buscarAdminMaisRecente(supabase)
        : contexto.usuario_id

      if (!usuarioDestino) {
        return { status_final: 'falhou', erro: 'Sem destinatario pra tarefa' }
      }

      const amanha = new Date()
      amanha.setDate(amanha.getDate() + 1)
      const dataPrazo = amanha.toISOString().slice(0, 10)

      const { data: tarefa, error } = await supabase
        .from('agenda_tarefas')
        .insert({
          usuario_id: usuarioDestino,
          titulo: gatilho.nome,
          descricao: mensagem,
          data_prazo: dataPrazo,
          prioridade: gatilho.chave.includes('notif_admin') ? 'alta' : 'media',
          projeto_id: contexto.projeto_id || null,
          criada_por_bianca: true,
        })
        .select('id')
        .single()

      if (error) return { status_final: 'falhou', erro: error.message }
      return { status_final: 'enviada_auto', tarefa_id: tarefa?.id }
    }

    // === Canal: chat_bianca (aparece no chat como sugestao) ===
    if (gatilho.canal === 'chat_bianca') {
      // Registra como comunicacao interna canal='chat' (aparece no historico Bianca)
      const { data: com, error } = await supabase
        .from('bianca_comunicacoes')
        .insert({
          usuario_id: contexto.usuario_id || null,
          projeto_id: contexto.projeto_id || null,
          destinatario_nome: 'Consultor',
          canal: 'chat',
          mensagem,
          status: 'sugerida',
          gatilho_chave: gatilho.chave,
        })
        .select('id')
        .single()

      if (error) return { status_final: 'falhou', erro: error.message }
      return { status_final: 'sugerida', comunicacao_id: com?.id }
    }

    // === Canal: email (nao implementado ainda) ===
    if (gatilho.canal === 'email') {
      return { status_final: 'falhou', erro: 'Canal email ainda nao implementado' }
    }

    return { status_final: 'falhou', erro: `Canal desconhecido: ${gatilho.canal}` }
  } catch (e: any) {
    return { status_final: 'falhou', erro: e?.message || 'Erro desconhecido' }
  }
}

async function buscarAdminMaisRecente(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'eletrotecnico'])
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
