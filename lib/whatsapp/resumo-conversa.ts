import Anthropic from '@anthropic-ai/sdk'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from '@/lib/whatsapp/config'
import { URL_PORTAL } from '@/lib/agentes/nomes'
import { formatarTelefone } from '@/lib/formatters'

/**
 * Peças comuns dos avisos da Laís sobre conversas (Kalebe 2026-10-01):
 * dados do contato/cliente, links do portal e resumo da conversa por IA.
 * Usado no aviso de conversa nova (pro Kalebe) e na transferência de
 * atendimento (pro novo responsável).
 */

type Admin = ReturnType<typeof createAdminClient>

const STATUS_PT: Record<string, string> = {
  rascunho: 'rascunho', orcamento_gerado: 'orçamento gerado', proposta_enviada: 'proposta enviada',
  negociando: 'negociando', vendido: 'vendido', aceito: 'aceito', em_homologacao: 'em homologação',
  em_execucao: 'em execução', instalado: 'instalado', ativo_pos_venda: 'pós-venda', perdido: 'perdido',
}

export type DadosContatoConversa = {
  conversaId: string
  nome: string
  telefone: string              // E.164 sem +
  telefoneFmt: string
  origemCampanha: string | null
  ehEquipe: boolean
  cliente: { id: string; razao_social: string } | null
  projetos: Array<{ id: string; codigo: string; status: string }>
  projetoId: string | null
  linkCard: string | null       // card do cliente (CRM) ou do projeto
  linkConversa: string
  /** "Cliente cadastrado: X — SPIN-… (etapa)" ou "Lead novo (sem cadastro)" */
  situacao: string
}

export async function dadosContatoConversa(admin: Admin, conversaId: string): Promise<DadosContatoConversa | null> {
  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, origem_campanha, contato:contato_id(id, telefone, nome_exibicao, tipo, cliente_id, projeto_id)')
    .eq('id', conversaId)
    .maybeSingle()
  const ct: any = (conv as any)?.contato
  if (!conv || !ct?.telefone) return null

  const tel = String(ct.telefone).replace(/\D/g, '')
  const telSemDdi = tel.startsWith('55') ? tel.slice(2) : tel
  const [{ data: daEquipe }, { data: cliente }, { data: projetos }] = await Promise.all([
    admin.from('profiles').select('id').or(`telefone.eq.${tel},telefone.eq.${telSemDdi}`).limit(1),
    ct.cliente_id
      ? admin.from('clientes').select('id, razao_social').eq('id', ct.cliente_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    ct.cliente_id
      ? admin.from('projetos').select('id, codigo, status').eq('cliente_id', ct.cliente_id).is('excluida_em', null)
          .order('created_at', { ascending: false }).limit(3)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const lista = ((projetos || []) as any[]).map((p) => ({ id: p.id, codigo: p.codigo, status: p.status }))
  const projetoId = ct.projeto_id || lista[0]?.id || null
  const linkCard = cliente?.id
    ? `${URL_PORTAL}/crm/clientes/${cliente.id}`
    : projetoId ? `${URL_PORTAL}/projetos/${projetoId}` : null
  const situacao = cliente
    ? `Cliente cadastrado: ${cliente.razao_social}${lista.length
        ? ` — ${lista.map((p) => `${p.codigo} (${STATUS_PT[p.status] || String(p.status).replace(/_/g, ' ')})`).join(', ')}`
        : ''}`
    : 'Lead novo (sem cadastro)'

  return {
    conversaId,
    nome: ct.nome_exibicao || cliente?.razao_social || 'Sem nome no WhatsApp',
    telefone: tel,
    telefoneFmt: formatarTelefone(telSemDdi) || tel,
    origemCampanha: (conv as any).origem_campanha || null,
    ehEquipe: ct.tipo === 'colaborador' || ct.tipo === 'representante' || !!daEquipe?.length,
    cliente: cliente ? { id: cliente.id, razao_social: cliente.razao_social } : null,
    projetos: lista,
    projetoId,
    linkCard,
    linkConversa: `${URL_PORTAL}/spinzap?c=${conversaId}`,
    situacao,
  }
}

/** Mensagens com texto, mais antigas primeiro ("Cliente: …" / "Laís: …"). */
export async function transcricaoDaConversa(
  admin: Admin,
  conversaId: string,
  opcoes: { desde?: string; limite?: number } = {},
): Promise<{ linhas: string[]; primeiraDoCliente: string }> {
  let q = admin
    .from('wa_mensagens')
    .select('direcao, texto, tipo, origem_agente_nome, remetente:remetente_id(nome_completo)')
    .eq('conversa_id', conversaId)
  if (opcoes.desde) q = q.gte('criada_em', opcoes.desde)
  // As N mais recentes, depois em ordem cronológica
  const { data } = await q.order('criada_em', { ascending: false }).limit(opcoes.limite || 30)
  const msgs = ((data || []) as any[]).reverse()

  const linhas = msgs
    .map((m) => {
      const quem = m.direcao === 'inbound' ? 'Cliente' : (m.origem_agente_nome || m.remetente?.nome_completo || 'Spin')
      const txt = m.texto ? String(m.texto).trim() : `[${m.tipo === 'audio' ? 'áudio' : m.tipo || 'mídia'}]`
      return `${quem}: ${txt}`
    })
  const primeira = msgs.find((m) => m.direcao === 'inbound')
  const primeiraDoCliente = primeira
    ? (primeira.texto ? String(primeira.texto).trim() : `[${primeira.tipo === 'audio' ? 'áudio' : primeira.tipo || 'mídia'}]`)
    : ''
  return { linhas, primeiraDoCliente }
}

const PROMPTS = {
  // Conversa que acabou de começar: o que o cliente pediu
  pedido:
    'Você resume, em no máximo 2 frases curtas em português do Brasil, o que o CLIENTE quer nesta conversa de ' +
    'WhatsApp com a Spin Solar (energia solar, baterias, recarga de carro elétrico e serviços elétricos). ' +
    'Use só o que o cliente disse — não invente valores, cidades nem produtos. Se ele só cumprimentou, ' +
    'responda exatamente: "Só cumprimentou, ainda não disse o que precisa." Sem saudação, sem markdown.',
  // Atendimento passando de mão: o que o cliente quer e em que pé está
  atendimento:
    'Você prepara a passagem de um atendimento de WhatsApp da Spin Solar (energia solar, baterias, recarga de ' +
    'carro elétrico e serviços elétricos) pra outro colega. Em no máximo 3 frases curtas em português do Brasil: ' +
    'o que o cliente quer, o que já foi combinado ou enviado e o que está pendente. Só fatos da conversa — não ' +
    'invente valores, prazos nem produtos. Sem saudação, sem markdown.',
}

export async function resumirConversa(linhas: string[], foco: keyof typeof PROMPTS): Promise<string | null> {
  const transcricao = linhas.join('\n').trim()
  const { anthropic_api_key } = await getWaConfig()
  if (!anthropic_api_key || !transcricao) return null
  try {
    const anthropic = new Anthropic({ apiKey: anthropic_api_key })
    const r: any = await Promise.race([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system: PROMPTS[foco],
        // Fim da conversa é o que mais importa pra passagem — corta pelo começo
        messages: [{ role: 'user', content: transcricao.slice(-8000) }],
      }),
      new Promise((_, falha) => setTimeout(() => falha(new Error('tempo esgotado')), 12_000)),
    ])
    const txt = (r?.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join('').trim()
    return txt || null
  } catch (e) {
    console.error('[resumo-conversa]', e)
    return null
  }
}

export const cortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
