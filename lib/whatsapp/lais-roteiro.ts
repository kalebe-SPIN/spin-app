import Anthropic from '@anthropic-ai/sdk'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from './config'
import { enviarTextoPeloCanal, enviarInterativoPeloCanal } from './enviar-canal'
import { NOME_SDR, URL_PORTAL } from '@/lib/agentes/nomes'
import { avisarUsuario, avisarEquipe } from '@/lib/agentes/diretorio'
import { SERVICOS_LAIS, TEXTOS_LAIS, PERGUNTAS_LAIS, AREA_DA_FAIXA, type ServicoLais } from './lais-textos'
import { horariosLivres, agendarLigacao, rotuloHorario, type HorarioLivre, type ParteDoDia } from '@/lib/spinzap/agenda-comercial'
import { analisarFaturaPorUrl } from '@/lib/fatura/analisar'
import { registrarTarifaExtraida, tarifaDeReferencia } from '@/lib/fatura/tarifa'
import { mesclarPerfil, criarPendencia, anexarArquivoPerfil } from '@/lib/spinzap/perfil-servidor'
import { carregarPerfil, prepararOrcamentoDoLead } from '@/lib/spinzap/orcamento-lais'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** Primeiro número do texto, no formato brasileiro ("R$ 1.200,50" → 1200.5; "uns 450" → 450). */
function numeroDoTexto(t: string): number {
  const m = String(t || '').match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/)
  if (!m) return 0
  return Number(m[0].replace(/\./g, '').replace(',', '.')) || 0
}

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
type Passo = 'servico' | 'cidade' | 'oferta_ligacao' | 'escolha_horario' | 'quando_prefere' | 'confirmar' | 'agendado'
  // Lead que não quer ligação (orçamento por aqui)
  | 'sem_ligacao' | 'aguarda_fatura' | 'confirma_endereco' | 'modo_equipamentos' | 'config_equipamentos'
  | 'conta_inverno' | 'conta_verao' | 'fatura_tarifa' | 'email' | 'perguntas' | 'aguarda_aprovacao'
  | 'concluido' | 'legado'
export type EstadoRoteiro = {
  passo: Passo
  servico?: ServicoLais
  opcoes?: HorarioLivre[]
  proposto?: HorarioLivre
  agendado?: { evento_id: string; inicio: string; consultor_id: string; consultor_nome: string }
  /** Pergunta com opções em andamento (PERGUNTAS_LAIS) */
  pergunta?: string
  /** Quando entrou no passo atual (prazo pra confirmar endereço) */
  desde?: string
  conta_inverno?: number
  falhas_fatura?: number
  orcamento_id?: string
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
  email?: string | null
  endereco?: { rua?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null } | null
  endereco_confirmado?: boolean | null
  qtd_placas?: number | null
  inversor_kw?: number | null
  valor_reais?: number | null
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
- email: e-mail que o cliente informou
- endereco: {rua, numero, bairro, cidade, uf, cep} com o que o cliente informou do endereço da instalação (só os campos ditos)
- endereco_confirmado: true se confirmou que o endereço mostrado está certo
- qtd_placas e inversor_kw: números se o cliente disse quantas placas e/ou a potência do inversor (kW) que quer
- valor_reais: número em reais se informou um valor de conta de luz (ex.: "uns 450" → 450)
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
  /** Rodada sem mensagem nova do lead (prazo vencido, chamada pelo cron) */
  gatilho?: 'prazo_endereco'
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
    .select('id, direcao, tipo, texto, dados, criada_em, origem_agente_nome, midia_url, midia_mime')
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
  const it: Interpretacao = clique || entrada.gatilho || !textoNovo ? {} : await interpretar(estado.passo, estado, historico, textoNovo)
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
    // Sem ligação: orçamento por aqui — fatura ou perguntas
    if (aceita === false) {
      await botoes(TEXTOS_LAIS.semLigacao, [
        { id: 'via_fatura', titulo: TEXTOS_LAIS.botaoEnviarFatura },
        { id: 'via_perguntas', titulo: TEXTOS_LAIS.botaoResponderPerguntas },
      ])
      await salvar({ ...estado, passo: 'sem_ligacao' })
      return { tratou: true, contexto: ctx }
    }
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

  // ── SEM LIGAÇÃO: orçamento por aqui ──
  const ultimaMidia = [...novas].reverse().find((m) => ['document', 'image'].includes(m.tipo) && m.midia_url)
  const pedirEmailOuPerguntar = async (): Promise<{ tratou: boolean; contexto: Record<string, any> }> => {
    const perfil = await carregarPerfil(admin, contato.id)
    if (!perfil.contato.email) {
      await texto(TEXTOS_LAIS.pedirEmail)
      await salvar({ ...estado, passo: 'email' })
      return { tratou: true, contexto: ctx }
    }
    await texto(TEXTOS_LAIS.introPerguntas)
    return perguntarProxima()
  }
  const perguntarProxima = async (): Promise<{ tratou: boolean; contexto: Record<string, any> }> => {
    const p = await carregarPerfil(admin, contato.id)
    const respondida: Record<string, boolean> = {
      tipo_telhado: !!p.infra_civil.tipo_telhado,
      area: !!p.infra_civil.area_m2,
      aguas: !!p.infra_civil.aguas,
      material_estrutura: !!p.infra_civil.material_estrutura,
      sombreamento: p.peculiaridades.sombreamento === true || p.peculiaridades.sombreamento === false,
      tipo_rede: !!p.infra_eletrica.tipo_rede,
      disjuntor: !!p.infra_eletrica.disjuntor_a || !!ctx.disjuntor_nao_sei,
    }
    const q = PERGUNTAS_LAIS.find((x) => !respondida[x.chave])
    if (!q) return finalizarOrcamento()
    const opcoes = q.opcoes.map((o) => ({ id: `pq:${q.chave}:${o.id}`, titulo: o.titulo }))
    if (!(await podeFalar())) return { tratou: true, contexto: ctx }
    const r = opcoes.length <= 3
      ? await enviarInterativoPeloCanal({ conversa_id, telefone: contato.telefone, texto: q.texto, origem_agente_nome: NOME_SDR, botoes: opcoes })
      : await enviarInterativoPeloCanal({ conversa_id, telefone: contato.telefone, texto: q.texto, origem_agente_nome: NOME_SDR, lista: { botao: q.botao_lista || 'Ver opções', opcoes } })
    if ('erro' in r) await texto(`${q.texto}\n\n${q.opcoes.map((o, i) => `${i + 1}) ${o.titulo}`).join('\n')}`)
    await salvar({ ...estado, passo: 'perguntas', pergunta: q.chave })
    return { tratou: true, contexto: ctx }
  }
  const finalizarOrcamento = async (): Promise<{ tratou: boolean; contexto: Record<string, any> }> => {
    await texto(TEXTOS_LAIS.preparandoOrcamento)
    const r = await prepararOrcamentoDoLead(admin, {
      conversa_id, contato, entrada: ctx.orcamento_entrada, fatura: ctx.fatura || null, contexto: ctx,
    }).catch((e) => ({ erro: e?.message || 'falha' }))
    if ('erro' in r) {
      console.error('[lais-roteiro] orçamento', r.erro)
      await texto(TEXTOS_LAIS.falhaOrcamento)
      await avisarEquipe({
        agente: 'qualificacao',
        mensagem: `A Laís não conseguiu montar o orçamento de ${contato.nome_exibicao || contato.telefone} (${r.erro}). Alguém assume? ${URL_PORTAL}/spinzap?c=${conversa_id}`,
        conversa_id, projeto_id: contato.projeto_id || ctx.projeto_id || null,
      }).catch(() => {})
      await salvar({ ...estado, passo: 'concluido' })
      await admin.from('wa_conversas').update({ status: 'em_atendimento', agente_ativo: null }).eq('id', conversa_id)
      return { tratou: true, contexto: ctx }
    }
    await salvar({ ...estado, passo: 'aguarda_aprovacao', orcamento_id: r.orcamento_id, pergunta: undefined })
    return { tratou: true, contexto: ctx }
  }
  // Lead sem fatura no caminho "valor da conta": tarifa = mediana das faturas
  // reais lidas (tarifas_extraidas). Sem base, não chuta — passa pra equipe.
  const usarTarifaDaBase = async (): Promise<{ tratou: boolean; contexto: Record<string, any> }> => {
    const ref = await tarifaDeReferencia(admin, { classe: ctx.fatura?.classe || null })
    if (!ref || !ctx.valor_conta_media) {
      await texto(TEXTOS_LAIS.falhaOrcamento)
      await avisarEquipe({
        agente: 'qualificacao',
        mensagem: `${contato.nome_exibicao || contato.telefone} informou conta média de R$ ${Number(ctx.valor_conta_media || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, mas não mandou fatura e ainda não há base de tarifas pra calcular o kWh. Alguém assume? ${URL_PORTAL}/spinzap?c=${conversa_id}`,
        conversa_id, projeto_id: contato.projeto_id || ctx.projeto_id || null,
      }).catch(() => {})
      await salvar({ ...estado, passo: 'concluido' })
      await admin.from('wa_conversas').update({ status: 'em_atendimento', agente_ativo: null }).eq('id', conversa_id)
      return { tratou: true, contexto: ctx }
    }
    // Valor da CONTA (com CIP etc.) ÷ tarifa da conta; sem ela, a tarifa de energia
    ctx.orcamento_entrada = {
      modo: 'valor_mensal', valor_mensal: ctx.valor_conta_media,
      tarifa: { tarifa_kwh: ref.tarifa_conta_kwh || ref.tarifa_kwh, fonte: 'base', amostras: ref.amostras },
    }
    return pedirEmailOuPerguntar()
  }
  const lerFatura = async (m: any): Promise<{ tratou: boolean; contexto: Record<string, any> }> => {
    const r = await analisarFaturaPorUrl(m.midia_url, m.midia_mime)
    const consumo = 'dados' in r ? Number(r.dados.consumo_medio_12m_kwh) || Number(r.dados.consumo_mes_kwh) || 0 : 0
    if ('erro' in r || consumo <= 0) {
      const falhas = (estado.falhas_fatura || 0) + 1
      // Caminho "valor da conta": sem fatura legível, usa a tarifa da base
      if (falhas >= 2 && ctx.valor_conta_media) return usarTarifaDaBase()
      if (falhas >= 2) {
        await botoes(TEXTOS_LAIS.modoEquipamentos, [
          { id: 'eq_config', titulo: TEXTOS_LAIS.botaoJaSeiConfiguracao },
          { id: 'eq_valor', titulo: TEXTOS_LAIS.botaoPeloValorConta },
        ])
        await salvar({ ...estado, passo: 'modo_equipamentos', falhas_fatura: falhas })
      } else {
        await texto(TEXTOS_LAIS.faturaNaoLida)
        await salvar({ ...estado, passo: 'aguarda_fatura', falhas_fatura: falhas })
      }
      return { tratou: true, contexto: ctx }
    }
    const f = r.dados
    // Tarifa calculada da fatura (grupo, horário, subsídios) → base + premissa do orçamento
    const tc = f.tarifa_calculada
    await registrarTarifaExtraida(admin, { origem: 'lais', conversa_id, dados: f, tarifa: tc, lida: f.tarifa })
    const tarifaCliente = tc.tarifa_conta_kwh || tc.tarifa_media_kwh
    ctx.fatura = {
      razao_social: f.razao_social, cpf_cnpj: f.cpf_cnpj, uc: f.uc, consumo_medio_kwh: consumo, tipo_ligacao: f.tipo_ligacao,
      valor_total_reais: f.valor_total_reais, grupo: f.grupo, classe: f.classe,
      tarifa: { media_kwh: tc.tarifa_media_kwh, conta_kwh: tc.tarifa_conta_kwh, subsidio: tc.subsidio, por_posto: tc.por_posto },
    }
    // Com a fatura, o consumo é o dela (histórico de 12 meses) — mais fiel que o valor da conta
    ctx.orcamento_entrada = {
      modo: 'consumo_kwh', consumo_kwh: consumo,
      tarifa: tarifaCliente ? { tarifa_kwh: tarifaCliente, fonte: 'fatura', subsidio: tc.subsidio } : null,
    }
    ctx.fatura_recebida = true
    await anexarArquivoPerfil(admin, { contato_id: contato.id, categoria: 'fatura', url: m.midia_url, nome: m.texto || 'Fatura', mime: m.midia_mime, origem: 'cliente', wa_mensagem_id: m.id, projeto_id: contato.projeto_id })
    if (f.tipo_ligacao) await mesclarPerfil(admin, contato.id, 'infra_eletrica', { tipo_rede: f.tipo_ligacao })
    await mesclarPerfil(admin, contato.id, 'contato', { endereco: { rua: f.endereco.logradouro, bairro: f.endereco.bairro, cidade: f.endereco.cidade, uf: f.endereco.uf, cep: f.endereco.cep } })
    if (f.endereco.cidade && !ctx.cidade) await definirCidade(f.endereco.cidade, f.endereco.uf)
    // Endereço incompleto (sem número ou sem cidade) → confirma com o lead
    const completo = /\d/.test(f.endereco.logradouro || '') && !!f.endereco.cidade
    if (!completo) {
      const end = [f.endereco.logradouro, f.endereco.bairro, f.endereco.cidade && `${f.endereco.cidade}/${f.endereco.uf || ''}`].filter(Boolean).join(', ') || 'sem endereço legível'
      await texto(TEXTOS_LAIS.confirmarEnderecoFatura(end))
      await salvar({ ...estado, passo: 'confirma_endereco', desde: new Date().toISOString() })
      return { tratou: true, contexto: ctx }
    }
    return pedirEmailOuPerguntar()
  }

  if (estado.passo === 'sem_ligacao') {
    if (ultimaMidia) return lerFatura(ultimaMidia)
    if (clique === 'via_fatura') {
      await texto(TEXTOS_LAIS.pedirFatura)
      await salvar({ ...estado, passo: 'aguarda_fatura' })
      return { tratou: true, contexto: ctx }
    }
    if (clique === 'via_perguntas') {
      await botoes(TEXTOS_LAIS.modoEquipamentos, [
        { id: 'eq_config', titulo: TEXTOS_LAIS.botaoJaSeiConfiguracao },
        { id: 'eq_valor', titulo: TEXTOS_LAIS.botaoPeloValorConta },
      ])
      await salvar({ ...estado, passo: 'modo_equipamentos' })
      return { tratou: true, contexto: ctx }
    }
    if (it.resposta) await texto(it.resposta)
    await botoes(TEXTOS_LAIS.semLigacao, [
      { id: 'via_fatura', titulo: TEXTOS_LAIS.botaoEnviarFatura },
      { id: 'via_perguntas', titulo: TEXTOS_LAIS.botaoResponderPerguntas },
    ])
    return { tratou: true, contexto: ctx }
  }

  if (estado.passo === 'aguarda_fatura') {
    if (ultimaMidia) return lerFatura(ultimaMidia)
    if (it.resposta) await texto(it.resposta)
    await texto(TEXTOS_LAIS.pedirFatura)
    return { tratou: true, contexto: ctx }
  }

  if (estado.passo === 'confirma_endereco') {
    // Lead não respondeu no prazo: usa só a cidade e deixa a pendência
    if (entrada.gatilho === 'prazo_endereco') {
      await criarPendencia(admin, contato.id, 'Endereço da instalação incompleto na fatura — o cliente não confirmou; confirmar antes da visita')
      return pedirEmailOuPerguntar()
    }
    const e = it.endereco || {}
    const temAlgo = Object.values(e).some((v) => v)
    if (temAlgo) {
      await mesclarPerfil(admin, contato.id, 'contato', { endereco: { rua: e.rua, numero: e.numero, bairro: e.bairro, cidade: e.cidade, uf: e.uf, cep: e.cep } })
      if (e.cidade) await definirCidade(e.cidade, e.uf)
    } else if (!it.endereco_confirmado) {
      // Não respondeu o endereço: segue só com a cidade e deixa a pendência
      await criarPendencia(admin, contato.id, 'Endereço da instalação incompleto na fatura — confirmar com o cliente')
    }
    return pedirEmailOuPerguntar()
  }

  if (estado.passo === 'modo_equipamentos') {
    if (clique === 'eq_config' || it.qtd_placas) {
      if (it.qtd_placas) { estado.passo = 'config_equipamentos' }
      else {
        await texto(TEXTOS_LAIS.pedirConfiguracao)
        await salvar({ ...estado, passo: 'config_equipamentos' })
        return { tratou: true, contexto: ctx }
      }
    } else if (clique === 'eq_valor') {
      await texto(TEXTOS_LAIS.pedirContaInverno)
      await salvar({ ...estado, passo: 'conta_inverno' })
      return { tratou: true, contexto: ctx }
    } else {
      if (it.resposta) await texto(it.resposta)
      await botoes(TEXTOS_LAIS.modoEquipamentos, [
        { id: 'eq_config', titulo: TEXTOS_LAIS.botaoJaSeiConfiguracao },
        { id: 'eq_valor', titulo: TEXTOS_LAIS.botaoPeloValorConta },
      ])
      return { tratou: true, contexto: ctx }
    }
  }

  if (estado.passo === 'config_equipamentos') {
    const qtd = Math.round(Number(it.qtd_placas) || 0)
    if (qtd > 0 && qtd <= 500) {
      ctx.orcamento_entrada = { modo: 'qtd_placas', qtd_placas: qtd, inversor_kw: Number(it.inversor_kw) || null }
      return pedirEmailOuPerguntar()
    }
    if (it.resposta) await texto(it.resposta)
    await texto(TEXTOS_LAIS.pedirConfiguracao)
    return { tratou: true, contexto: ctx }
  }

  if (estado.passo === 'conta_inverno' || estado.passo === 'conta_verao') {
    const valor = Number(it.valor_reais) || numeroDoTexto(textoNovo)
    if (!(valor > 0 && valor < 1_000_000)) {
      await texto(TEXTOS_LAIS.naoEntendiValor)
      return { tratou: true, contexto: ctx }
    }
    if (estado.passo === 'conta_inverno') {
      await texto(TEXTOS_LAIS.pedirContaVerao)
      await salvar({ ...estado, passo: 'conta_verao', conta_inverno: valor })
      return { tratou: true, contexto: ctx }
    }
    // Média entre inverno e verão; o kWh sai da tarifa da FATURA do cliente
    // (grupo, horário e subsídios mudam o preço) — Kalebe 2026-10-13
    const media = Math.round((((estado.conta_inverno || valor) + valor) / 2) * 100) / 100
    ctx.valor_conta_media = media
    await botoes(TEXTOS_LAIS.pedirFaturaTarifa, [
      { id: 'tarifa_enviar', titulo: TEXTOS_LAIS.botaoEnviarFatura },
      { id: 'tarifa_sem_fatura', titulo: TEXTOS_LAIS.botaoNaoTenhoFatura },
    ])
    await salvar({ ...estado, passo: 'fatura_tarifa' })
    return { tratou: true, contexto: ctx }
  }

  if (estado.passo === 'fatura_tarifa') {
    if (ultimaMidia) return lerFatura(ultimaMidia)
    if (clique === 'tarifa_enviar') {
      await texto(TEXTOS_LAIS.pedirFatura)
      return { tratou: true, contexto: ctx }
    }
    if (clique === 'tarifa_sem_fatura' || /n[aã]o tenho|sem fatura|depois/i.test(textoNovo)) return usarTarifaDaBase()
    if (it.resposta) await texto(it.resposta)
    await botoes(TEXTOS_LAIS.pedirFaturaTarifa, [
      { id: 'tarifa_enviar', titulo: TEXTOS_LAIS.botaoEnviarFatura },
      { id: 'tarifa_sem_fatura', titulo: TEXTOS_LAIS.botaoNaoTenhoFatura },
    ])
    return { tratou: true, contexto: ctx }
  }

  if (estado.passo === 'email') {
    const achado = (textoNovo.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i) || [])[0] || it.email || ''
    const email = achado.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await texto(TEXTOS_LAIS.emailInvalido)
      return { tratou: true, contexto: ctx }
    }
    await mesclarPerfil(admin, contato.id, 'contato', { email })
    await texto(TEXTOS_LAIS.introPerguntas)
    return perguntarProxima()
  }

  if (estado.passo === 'perguntas' && estado.pergunta) {
    const q = PERGUNTAS_LAIS.find((x) => x.chave === estado.pergunta)
    let escolha: string | null = null
    if (clique?.startsWith(`pq:${estado.pergunta}:`)) escolha = clique.split(':')[2]
    else if (q) {
      // Escreveu em vez de tocar: tenta casar com o texto da opção
      const t = semAcento(textoNovo)
      escolha = q.opcoes.find((o) => t.includes(semAcento(o.titulo)) || t === semAcento(o.id))?.id || null
      if (!escolha && q.chave === 'sombreamento') escolha = /\bnao\b|\bnão\b|sem sombra/i.test(textoNovo) ? 'nao' : /\bsim\b|tem sombra/i.test(textoNovo) ? 'sim' : null
      if (!escolha && q.chave === 'disjuntor') { const n = numeroDoTexto(textoNovo); if (n >= 10 && n <= 400) escolha = String(Math.round(n)) }
    }
    if (!escolha || !q) {
      if (it.resposta) await texto(it.resposta)
      return perguntarProxima()
    }
    if (q.chave === 'tipo_telhado') await mesclarPerfil(admin, contato.id, 'infra_civil', { tipo_telhado: escolha, ...(escolha === 'laje_impermeabilizada' ? { laje: true } : {}) })
    if (q.chave === 'area') await mesclarPerfil(admin, contato.id, 'infra_civil', { area_m2: AREA_DA_FAIXA[escolha] ?? null, area_faixa: q.opcoes.find((o) => o.id === escolha)?.titulo })
    if (q.chave === 'aguas') await mesclarPerfil(admin, contato.id, 'infra_civil', { aguas: Number(escolha) })
    if (q.chave === 'material_estrutura') await mesclarPerfil(admin, contato.id, 'infra_civil', { material_estrutura: escolha })
    if (q.chave === 'sombreamento') await mesclarPerfil(admin, contato.id, 'peculiaridades', { sombreamento: escolha === 'sim' })
    if (q.chave === 'tipo_rede') await mesclarPerfil(admin, contato.id, 'infra_eletrica', { tipo_rede: escolha })
    if (q.chave === 'disjuntor') {
      if (escolha === 'nao_sei') {
        ctx.disjuntor_nao_sei = true
        await criarPendencia(admin, contato.id, 'Disjuntor geral: o cliente não soube informar — conferir na visita')
      } else await mesclarPerfil(admin, contato.id, 'infra_eletrica', { disjuntor_a: Number(escolha) })
    }
    return perguntarProxima()
  }

  if (estado.passo === 'aguarda_aprovacao') {
    if (it.resposta) await texto(it.resposta)
    else await texto(TEXTOS_LAIS.orcamentoEmPreparo)
    return { tratou: true, contexto: ctx }
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

/**
 * Cron (1 em 1 min): roteiros parados esperando o lead. Hoje: endereço da
 * fatura sem resposta em 1 hora → a Laís segue só com a cidade e deixa a
 * pendência no perfil (roteiro do Kalebe 2026-10-10).
 */
export async function avancarRoteirosParados(admin: Admin): Promise<number> {
  if (!(await roteiroAtivo(admin))) return 0
  const { data, error } = await admin.from('wa_conversas')
    .select('id, cidade, contexto_qualificacao, contato:contato_id(id, telefone, nome_exibicao, projeto_id, cliente_id)')
    .eq('contexto_qualificacao->roteiro->>passo', 'confirma_endereco')
    .is('encerrada_em', null)
    .limit(20)
  if (error) return 0
  let n = 0
  for (const c of (data || []) as any[]) {
    const desde = c.contexto_qualificacao?.roteiro?.desde
    if (!desde || Date.now() - new Date(desde).getTime() < 60 * 60_000 || !c.contato) continue
    await processarRoteiroLais(admin, {
      conversa_id: c.id, contato: c.contato, contexto: c.contexto_qualificacao || {},
      cidadeEtiqueta: c.cidade || null, gatilho: 'prazo_endereco',
    }).catch((e) => console.error('[lais-roteiro] prazo endereço', e))
    n++
  }
  return n
}