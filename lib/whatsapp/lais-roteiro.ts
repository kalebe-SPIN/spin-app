import Anthropic from '@anthropic-ai/sdk'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from './config'
import { enviarTextoPeloCanal, enviarInterativoPeloCanal } from './enviar-canal'
import { NOME_SDR, URL_PORTAL } from '@/lib/agentes/nomes'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { SERVICOS_LAIS, TEXTOS_LAIS, type ServicoLais } from './lais-textos'
import { horariosLivres, agendarLigacao, rotuloHorario, type HorarioLivre, type ParteDoDia } from '@/lib/spinzap/agenda-comercial'

/**
 * Roteiro da Laís pra lead novo (Kalebe 2026-10-10):
 *   RECEPCIONAR → boas-vindas + o que a Spin faz + "como posso ajudar" (lista)
 *   ETIQUETAR   → tipo de atendimento (escolhido pelo lead), cidade; a data de
 *                 início é a entrada do contato
 *   ENERGIA SOLAR → sugere ligação (orçamento entregue na ligação, ~15 min)
 *     aceita  → 2 horários livres do Comercial (hoje; senão próximo dia útil)
 *               → escolhe → confirmação com botão → agenda + lembrete 5 min
 *     não quer as opções → "melhor momento": hora exata ou parte do dia
 *   O que o roteiro ainda não cobre (outros serviços; lead que não quer
 *   ligação) segue o fluxo de qualificação de hoje (fila dos representantes).
 * A IA só INTERPRETA o que o lead escreveu; as mensagens são fixas (aprovadas)
 * e os cliques de botão/lista são lidos direto, sem IA.
 * Liga/desliga: wa_config.lais_roteiro_ativo (mig 149).
 */

type Admin = ReturnType<typeof createAdminClient>
type Passo = 'servico' | 'cidade' | 'oferta_ligacao' | 'escolha_horario' | 'quando_prefere' | 'confirmar' | 'agendado' | 'concluido' | 'legado'
export type EstadoRoteiro = {
  passo: Passo
  servico?: ServicoLais
  opcoes?: HorarioLivre[]
  proposto?: HorarioLivre
  agendado?: { evento_id: string; inicio: string; consultor_id: string; consultor_nome: string }
}

const TIPO_SISTEMA: Record<ServicoLais, string> = {
  srv_solar: 'on_grid', srv_ve: 've_recarga', srv_bess: 'bess', srv_suporte: 'revisao', srv_limpeza: 'limpeza',
}
const primeiroNome = (s: string | null | undefined) => String(s || '').trim().split(/\s+/)[0] || ''
const diaBRT = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Botão de horário (até 20 caracteres): "Hoje 14:30", "Amanhã 09:00", "Seg 13/10 09:00". */
function rotuloCurto(iso: string): string {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  if (diaBRT(d) === diaBRT(new Date())) return `Hoje ${hora}`
  if (diaBRT(d) === diaBRT(new Date(Date.now() + 86_400_000))) return `Amanhã ${hora}`
  const sem = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).replace('.', '')
  const dm = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  return `${sem.charAt(0).toUpperCase()}${sem.slice(1, 3)} ${dm} ${hora}`
}

export async function roteiroAtivo(admin: Admin): Promise<boolean> {
  const { data, error } = await admin.from('wa_config').select('lais_roteiro_ativo').limit(1).maybeSingle()
  return !error && !!(data as any)?.lais_roteiro_ativo
}

type Interpretacao = {
  servico?: ServicoLais | null
  cidade?: string | null
  uf?: string | null
  aceita_ligacao?: boolean | null
  escolha?: number | null
  quer_outro_horario?: boolean | null
  hora?: string | null
  dia?: string | null
  parte_do_dia?: ParteDoDia | null
  confirma?: boolean | null
  quer_reagendar?: boolean | null
  resposta?: string | null
}

async function interpretar(passo: Passo, estado: EstadoRoteiro, historico: string[], novas: string): Promise<Interpretacao> {
  const { anthropic_api_key } = await getWaConfig()
  if (!anthropic_api_key) return {}
  const agora = new Date()
  const hoje = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  const opcoes = (estado.opcoes || []).map((o, i) => `${i + 1}) ${rotuloHorario(o.inicio)}`).join('  ')
  const system = `Você interpreta mensagens de um cliente no WhatsApp da Spin Solar (energia solar, carregador de carro elétrico, baterias/BESS, suporte técnico, manutenção e limpeza de placas) para um roteiro de atendimento. Responda SOMENTE um JSON.
Hoje é ${hoje}, agora são ${hora} (horário de Brasília). Passo atual do roteiro: ${passo}.${opcoes ? `\nOpções de horário de ligação oferecidas: ${opcoes}.` : ''}${estado.proposto ? `\nHorário proposto aguardando confirmação: ${rotuloHorario(estado.proposto.inicio)}.` : ''}
Campos (null quando não souber):
- servico: "srv_solar" (energia solar, placas, orçamento solar, conta de luz alta) | "srv_ve" (carregador de carro elétrico) | "srv_bess" (bateria, armazenamento) | "srv_suporte" (problema/dúvida num sistema que já tem) | "srv_limpeza" (limpeza ou manutenção de placas) | null
- cidade e uf (2 letras) se o cliente disse a cidade
- aceita_ligacao: true/false se respondeu à proposta de ligação
- escolha: 1 ou 2 se escolheu uma das opções de horário
- quer_outro_horario: true se não serve nenhuma opção
- hora: "HH:MM" se disse um horário exato; dia: "AAAA-MM-DD" se disse o dia (hoje, amanhã, dia da semana → converta)
- parte_do_dia: "manha" | "tarde" | "noite" se só disse a parte do dia
- confirma: true/false se confirmou ou desistiu do horário proposto
- quer_reagendar: true se pediu pra mudar a ligação já marcada
- resposta: se o cliente fez uma PERGUNTA fora do roteiro, uma resposta curta e cordial (até 2 frases, português do Brasil). Nunca diga preço, prazo, desconto, condição de pagamento nem detalhe técnico que você não sabe — nesses casos diga que o consultor explica na ligação. Sem pergunta: null.`
  try {
    const anthropic = new Anthropic({ apiKey: anthropic_api_key })
    const r: any = await Promise.race([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: `CONVERSA ATÉ AQUI:\n${historico.slice(-12).join('\n') || '(início)'}\n\nMENSAGEM NOVA DO CLIENTE:\n${novas}` }],
      }),
      new Promise((_, falha) => setTimeout(() => falha(new Error('tempo esgotado')), 15_000)),
    ])
    const txt = (r?.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join('')
    const ini = txt.indexOf('{'); const fim = txt.lastIndexOf('}')
    const j = JSON.parse(txt.slice(ini, fim + 1))
    if (j.servico && !SERVICOS_LAIS.some((s) => s.id === j.servico)) j.servico = null
    if (j.parte_do_dia && !['manha', 'tarde', 'noite'].includes(j.parte_do_dia)) j.parte_do_dia = null
    return j
  } catch (e) {
    console.error('[lais-roteiro] interpretar', e)
    const { avisarFalhaIA } = await import('@/lib/ia/erros')
    await avisarFalhaIA(e, 'Laís (roteiro do lead)')
    return {}
  }
}

/**
 * Uma rodada do roteiro. `tratou: false` = o fluxo de qualificação de hoje
 * segue (com as etiquetas já preenchidas no contexto).
 */
export async function processarRoteiroLais(admin: Admin, entrada: {
  conversa_id: string
  contato: { id: string; telefone: string; nome_exibicao: string | null; projeto_id: string | null; cliente_id: string | null }
  contexto: Record<string, any>
  cidadeEtiqueta: string | null
}): Promise<{ tratou: boolean; contexto: Record<string, any> }> {
  const { conversa_id, contato } = entrada
  const ctx: Record<string, any> = { ...entrada.contexto }
  const estado: EstadoRoteiro = ctx.roteiro || { passo: 'servico' }
  if (estado.passo === 'legado' || estado.passo === 'concluido') return { tratou: estado.passo === 'concluido', contexto: ctx }
  const nome = primeiroNome(ctx.nome_cliente || contato.nome_exibicao)
  // Conversa nova passa a "em qualificação" com a Laís no comando (setor Laís no Spinzap)
  await admin.from('wa_conversas').update({ status: 'em_qualificacao', agente_ativo: 'qualificacao' }).eq('id', conversa_id).eq('status', 'nova')

  // Mensagens do cliente desde a última nossa (cliques chegam com o id da opção)
  const { data: ult } = await admin.from('wa_mensagens')
    .select('direcao, tipo, texto, dados, criada_em, origem_agente_nome')
    .eq('conversa_id', conversa_id).neq('tipo', 'system')
    .order('criada_em', { ascending: false }).limit(30)
  const msgs = ((ult || []) as any[]).reverse()
  const ehPrimeiraVez = !ctx.roteiro && !msgs.some((m) => m.direcao === 'outbound')
  const novas: any[] = []
  for (let i = msgs.length - 1; i >= 0 && msgs[i].direcao === 'inbound'; i--) novas.unshift(msgs[i])
  const clique: string | null = [...novas].reverse().find((m) => m.dados?.resposta_id)?.dados?.resposta_id || null
  const textoNovo = novas.map((m) => m.texto || `[${m.tipo}]`).join('\n')
  const historico = msgs.map((m) => `${m.direcao === 'inbound' ? 'Cliente' : (m.origem_agente_nome || 'Spin')}: ${m.texto || `[${m.tipo}]`}`)

  const salvar = async (novo: EstadoRoteiro, extra: Record<string, any> = {}) => {
    Object.assign(ctx, extra, { roteiro: novo })
    await admin.from('wa_conversas').update({ contexto_qualificacao: ctx }).eq('id', conversa_id)
  }
  // Humano assumiu no meio? A Laís não fala por cima
  const podeFalar = async () => {
    const { data } = await admin.from('wa_conversas').select('status').eq('id', conversa_id).maybeSingle()
    return !['em_atendimento', 'encerrada'].includes((data as any)?.status)
  }
  const texto = async (t: string) => { if (await podeFalar()) await enviarTextoPeloCanal({ conversa_id, telefone: contato.telefone, texto: t, remetente_agente: 'qualificacao', origem_agente_nome: NOME_SDR }) }
  const botoes = async (t: string, b: Array<{ id: string; titulo: string }>) => {
    if (!(await podeFalar())) return
    const r = await enviarInterativoPeloCanal({ conversa_id, telefone: contato.telefone, texto: t, origem_agente_nome: NOME_SDR, botoes: b })
    // Sem botão (erro da Meta)? Manda o texto com as opções numeradas
    if ('erro' in r) await texto(`${t}\n\n${b.map((x, i) => `${i + 1}) ${x.titulo}`).join('\n')}`)
  }
  const listaServicos = async (t: string) => {
    if (!(await podeFalar())) return
    const r = await enviarInterativoPeloCanal({
      conversa_id, telefone: contato.telefone, texto: t, origem_agente_nome: NOME_SDR,
      lista: { botao: TEXTOS_LAIS.botaoListaServicos, titulo_secao: 'Atendimento', opcoes: SERVICOS_LAIS.map((s) => ({ id: s.id, titulo: s.titulo, descricao: s.descricao })) },
    })
    if ('erro' in r) await texto(`${t}\n\n${SERVICOS_LAIS.map((s, i) => `${i + 1}) ${s.titulo}`).join('\n')}`)
  }
  const legado = async () => { await salvar({ ...estado, passo: 'legado' }); return { tratou: false, contexto: ctx } }

  // Etiqueta "tipo de atendimento" + o que a qualificação de hoje entende
  const definirServico = async (s: ServicoLais) => {
    const prod = SERVICOS_LAIS.find((x) => x.id === s)!.produto
    await admin.from('wa_conversas').update({ produto: prod }).eq('id', conversa_id)
    estado.servico = s
    ctx.tipo_sistema = TIPO_SISTEMA[s]
  }
  const definirCidade = async (cidade: string, uf?: string | null) => {
    const patch: Record<string, any> = { cidade: cidade.trim() }
    if (uf) patch.uf = uf.trim().toUpperCase().slice(0, 2)
    await admin.from('wa_conversas').update(patch).eq('id', conversa_id)
    ctx.cidade = patch.cidade
    if (patch.uf) ctx.uf = patch.uf
  }

  const oferecerHorarios = async (introducao: string, filtro: Parameters<typeof horariosLivres>[1] = {}) => {
    const opcoes = await horariosLivres(admin, { quantidade: 2, ...filtro })
    if (!opcoes.length) { await texto(TEXTOS_LAIS.semHorario); return legado() }
    await botoes(introducao, [
      ...opcoes.map((o, i) => ({ id: `h${i + 1}`, titulo: rotuloCurto(o.inicio) })),
      { id: 'h_outro', titulo: TEXTOS_LAIS.botaoOutroHorario },
    ])
    await salvar({ ...estado, passo: 'escolha_horario', opcoes, proposto: undefined })
    return { tratou: true, contexto: ctx }
  }
  const propor = async (h: HorarioLivre) => {
    await botoes(TEXTOS_LAIS.confirmarLigacao(primeiroNome(h.consultor_nome), rotuloHorario(h.inicio)), [{ id: 'confirmar', titulo: TEXTOS_LAIS.botaoConfirmar }])
    await salvar({ ...estado, passo: 'confirmar', proposto: h })
    return { tratou: true, contexto: ctx }
  }
  const depoisDaCidade = async () => {
    if (estado.servico !== 'srv_solar') return legado()
    await botoes(TEXTOS_LAIS.ofertaLigacao(nome), [
      { id: 'lig_sim', titulo: TEXTOS_LAIS.botaoAceitaLigacao },
      { id: 'lig_nao', titulo: TEXTOS_LAIS.botaoRecusaLigacao },
    ])
    await salvar({ ...estado, passo: 'oferta_ligacao' })
    return { tratou: true, contexto: ctx }
  }
  const depoisDoServico = async () => {
    if (!ctx.cidade && !entrada.cidadeEtiqueta) {
      await texto(TEXTOS_LAIS.pedirCidade)
      await salvar({ ...estado, passo: 'cidade' })
      return { tratou: true, contexto: ctx }
    }
    ctx.cidade ||= entrada.cidadeEtiqueta
    return depoisDaCidade()
  }

  // Cliques resolvem sem IA; texto livre passa pelo intérprete
  const it: Interpretacao = clique ? {} : await interpretar(estado.passo, estado, historico, textoNovo)
  if (it.cidade && !ctx.cidade) await definirCidade(it.cidade, it.uf)

  // ── RECEPCIONAR ──
  if (estado.passo === 'servico') {
    const escolhido = (SERVICOS_LAIS.find((s) => s.id === clique)?.id || it.servico || null) as ServicoLais | null
    if (ehPrimeiraVez) {
      if (!escolhido) { await listaServicos(TEXTOS_LAIS.boasVindas(nome)); await salvar({ passo: 'servico' }); return { tratou: true, contexto: ctx } }
      // Já disse o que quer na 1ª mensagem: boas-vindas sem a lista e segue
      await texto(TEXTOS_LAIS.boasVindas(nome).replace(/\n\nComo posso te ajudar hoje\?$/, ''))
    }
    if (!escolhido) {
      if (it.resposta) await texto(it.resposta)
      await listaServicos(TEXTOS_LAIS.pedirEscolhaServico)
      return { tratou: true, contexto: ctx }
    }
    await definirServico(escolhido)
    return depoisDoServico()
  }

  if (estado.passo === 'cidade') {
    if (!ctx.cidade) {
      if (it.resposta) await texto(it.resposta)
      await texto(TEXTOS_LAIS.pedirCidade)
      return { tratou: true, contexto: ctx }
    }
    return depoisDaCidade()
  }

  // ── ENERGIA SOLAR: CRIAR COMPROMISSO ──
  if (estado.passo === 'oferta_ligacao') {
    const aceita = clique === 'lig_sim' ? true : clique === 'lig_nao' ? false : it.aceita_ligacao ?? null
    if (aceita === true) return oferecerHorarios(TEXTOS_LAIS.opcoesHorario)
    // Sem ligação: por enquanto segue a qualificação de hoje (fatura + equipe)
    if (aceita === false) return legado()
    if (it.resposta) await texto(it.resposta)
    return depoisDaCidade()
  }

  if (estado.passo === 'escolha_horario') {
    const n = clique === 'h1' ? 1 : clique === 'h2' ? 2 : it.escolha ?? null
    const opcao = n ? estado.opcoes?.[n - 1] : null
    if (opcao) return propor(opcao)
    if (clique === 'h_outro' || it.quer_outro_horario) {
      await texto(TEXTOS_LAIS.perguntarMelhorMomento)
      await salvar({ ...estado, passo: 'quando_prefere' })
      return { tratou: true, contexto: ctx }
    }
    if (it.hora || it.parte_do_dia) estado.passo = 'quando_prefere'   // já disse quando prefere
    else {
      if (it.resposta) await texto(it.resposta)
      return oferecerHorarios(TEXTOS_LAIS.opcoesHorario)
    }
  }

  if (estado.passo === 'quando_prefere') {
    const dia = it.dia && /^\d{4}-\d{2}-\d{2}$/.test(it.dia) ? it.dia : undefined
    if (it.hora && /^\d{1,2}:\d{2}$/.test(it.hora)) {
      const [hh, mm] = it.hora.split(':').map(Number)
      const quando = new Date(`${dia || diaBRT(new Date())}T${String(hh).padStart(2, '0')}:${String(mm >= 30 ? 30 : 0).padStart(2, '0')}:00-03:00`)
      const [livre] = await horariosLivres(admin, { quantidade: 1, horaExata: quando })
      if (livre) return propor(livre)
      return oferecerHorarios(TEXTOS_LAIS.horarioIndisponivel, { dia: dia || diaBRT(quando) })
    }
    if (it.parte_do_dia) {
      const [noDia] = await horariosLivres(admin, { quantidade: 1, parteDoDia: it.parte_do_dia, dia })
      const [proximo] = noDia ? [noDia] : await horariosLivres(admin, { quantidade: 1, parteDoDia: it.parte_do_dia })
      if (proximo) return propor(proximo)
      return oferecerHorarios(TEXTOS_LAIS.opcoesHorario)
    }
    if (it.resposta) await texto(it.resposta)
    await texto(TEXTOS_LAIS.perguntarMelhorMomento)
    await salvar({ ...estado, passo: 'quando_prefere' })
    return { tratou: true, contexto: ctx }
  }

  if (estado.passo === 'confirmar' && estado.proposto) {
    const confirma = clique === 'confirmar' ? true : it.confirma ?? null
    if (confirma === false || it.quer_outro_horario) {
      await texto(TEXTOS_LAIS.perguntarMelhorMomento)
      await salvar({ ...estado, passo: 'quando_prefere', proposto: undefined })
      return { tratou: true, contexto: ctx }
    }
    if (confirma !== true) {
      if (it.resposta) await texto(it.resposta)
      return propor(estado.proposto)
    }
    return confirmarLigacao(admin, { conversa_id, contato, ctx, estado, nome, salvar, texto, oferecerHorarios })
  }

  if (estado.passo === 'agendado' && estado.agendado) {
    // Passou a hora da ligação: o consultor assume a conversa
    if (Date.now() > new Date(estado.agendado.inicio).getTime() + 30 * 60_000) {
      await salvar({ ...estado, passo: 'concluido' })
      await admin.from('wa_conversas').update({ status: 'em_atendimento', agente_ativo: null }).eq('id', conversa_id)
      return { tratou: true, contexto: ctx }
    }
    if (it.quer_reagendar) {
      await admin.from('agenda_eventos').update({ status: 'adiado' }).eq('id', estado.agendado.evento_id)
      await admin.from('wa_conversas').update({ etapa: 'reagendamento', etapa_em: new Date().toISOString() }).eq('id', conversa_id)
      await avisarUsuario({
        destinatario_id: estado.agendado.consultor_id, agente: 'qualificacao', titulo: 'Ligação reagendada',
        mensagem: `🔁 *${contato.nome_exibicao || 'Cliente'}* pediu pra mudar a ligação de ${rotuloHorario(estado.agendado.inicio)}. A Laís está oferecendo novos horários.\n🔗 Conversa: ${URL_PORTAL}/spinzap?c=${conversa_id}`,
        conversa_id, projeto_id: contato.projeto_id,
      }).catch(() => {})
      return oferecerHorarios(TEXTOS_LAIS.opcoesHorario)
    }
    if (it.resposta) await texto(it.resposta)
    else await texto(TEXTOS_LAIS.lembrarAgendado(primeiroNome(estado.agendado.consultor_nome), rotuloHorario(estado.agendado.inicio)))
    return { tratou: true, contexto: ctx }
  }

  return legado()
}

/** Aceite do lead: marca na agenda do consultor, cria o projeto e avisa todo mundo. */
async function confirmarLigacao(admin: Admin, a: {
  conversa_id: string
  contato: { id: string; telefone: string; nome_exibicao: string | null; projeto_id: string | null; cliente_id: string | null }
  ctx: Record<string, any>
  estado: EstadoRoteiro
  nome: string
  salvar: (novo: EstadoRoteiro, extra?: Record<string, any>) => Promise<void>
  texto: (t: string) => Promise<void>
  oferecerHorarios: (introducao: string) => Promise<{ tratou: boolean; contexto: Record<string, any> }>
}): Promise<{ tratou: boolean; contexto: Record<string, any> }> {
  const h = a.estado.proposto!
  const cliente = a.contato.nome_exibicao || a.nome || 'Cliente'

  // Projeto do lead (o consultor já abre o card com o item escolhido)
  let projetoId = a.contato.projeto_id || a.ctx.projeto_id || null
  if (!projetoId) {
    const { criarProjetoDoLead } = await import('./agente-qualificacao')
    projetoId = await criarProjetoDoLead(admin, a.contato, { ...a.ctx, nome_cliente: a.ctx.nome_cliente || cliente } as any)
    if (projetoId) await admin.from('wa_contatos').update({ projeto_id: projetoId, tipo: 'lead' }).eq('id', a.contato.id)
  }
  if (projetoId) await admin.from('projetos').update({ consultor_id: h.consultor_id }).eq('id', projetoId)

  const r = await agendarLigacao(admin, {
    inicio: h.inicio, consultor_id: h.consultor_id, conversa_id: a.conversa_id,
    projeto_id: projetoId, cliente_nome: cliente, telefone: a.contato.telefone,
  })
  if ('erro' in r) {
    if (r.erro === 'horario_ocupado') return a.oferecerHorarios(TEXTOS_LAIS.horarioOcupou)
    console.error('[lais-roteiro] agendar', r.erro)
    await a.texto(TEXTOS_LAIS.semHorario)
    await a.salvar({ ...a.estado, passo: 'legado' }, { projeto_id: projetoId })
    return { tratou: false, contexto: a.ctx }
  }

  // A conversa passa a ser do consultor (aparece no Spinzap dele); a Laís
  // segue respondendo até a hora da ligação
  await admin.from('wa_conversas').update({ responsavel_id: h.consultor_id }).eq('id', a.conversa_id)
  await admin.from('wa_conversas').update({ dono_id: h.consultor_id }).eq('id', a.conversa_id).is('dono_id', null)

  await a.texto(TEXTOS_LAIS.ligacaoConfirmada(primeiroNome(h.consultor_nome), rotuloHorario(h.inicio)))
  await avisarUsuario({
    destinatario_id: h.consultor_id, agente: 'qualificacao', titulo: 'Ligação de orçamento marcada',
    mensagem: [
      `📞 A Laís marcou uma ligação pra você: *${cliente}* · ${a.contato.telefone}`,
      `🗓️ ${rotuloHorario(h.inicio)}${a.ctx.cidade ? ` · 📍 ${a.ctx.cidade}` : ''}`,
      'O cliente espera receber o orçamento na própria ligação. Eu te lembro 5 min antes.',
      `🔗 Conversa: ${URL_PORTAL}/spinzap?c=${a.conversa_id}`,
      projetoId ? `🔗 Projeto: ${URL_PORTAL}/projetos/${projetoId}` : null,
    ].filter(Boolean).join('\n'),
    conversa_id: a.conversa_id, projeto_id: projetoId,
  }).catch((e) => console.error('[lais-roteiro] aviso consultor', e))

  await a.salvar({
    ...a.estado, passo: 'agendado', proposto: undefined, opcoes: undefined,
    agendado: { evento_id: r.evento_id, inicio: h.inicio, consultor_id: h.consultor_id, consultor_nome: h.consultor_nome },
  }, { projeto_id: projetoId, status_qualificacao: 'qualificada' })
  return { tratou: true, contexto: a.ctx }
}
