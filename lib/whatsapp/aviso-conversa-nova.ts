import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from '@/lib/whatsapp/config'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { URL_PORTAL } from '@/lib/agentes/nomes'
import { formatarTelefone } from '@/lib/formatters'

/**
 * Laís avisa o Kalebe de toda conversa iniciada por cliente (Kalebe
 * 2026-10-01): WhatsApp pessoal dele + sino do portal, com os dados do
 * contato, link do card e um resumo rápido do que o cliente pediu.
 *
 * "Iniciada por cliente" = mensagem do cliente numa conversa nova (ou vazia)
 * ou parada há 24h+. Conversa de alguém da equipe não conta. Espera uns
 * segundos antes de resumir: muita gente manda "Oi" e só depois o pedido.
 */

// Kalebe pediu só ele (há outro admin) — perfil 'Kalebe Grün'
const DESTINATARIO_ID = '036b2ba7-a523-4529-9189-1818b4a2f025'
const ESPERA_MS = 30_000          // cabe no maxDuration (60 s) do webhook
const SILENCIO_HORAS = 24

type Admin = ReturnType<typeof createAdminClient>

/** Chamar ANTES de gravar a mensagem do cliente. */
export async function clienteIniciandoConversa(admin: Admin, conversaId: string): Promise<boolean> {
  const { data } = await admin
    .from('wa_mensagens')
    .select('criada_em')
    .eq('conversa_id', conversaId)
    .order('criada_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return true
  return Date.now() - new Date(data.criada_em).getTime() >= SILENCIO_HORAS * 3_600_000
}

const STATUS_PT: Record<string, string> = {
  rascunho: 'rascunho', orcamento_gerado: 'orçamento gerado', proposta_enviada: 'proposta enviada',
  negociando: 'negociando', vendido: 'vendido', aceito: 'aceito', em_homologacao: 'em homologação',
  em_execucao: 'em execução', instalado: 'instalado', ativo_pos_venda: 'pós-venda', perdido: 'perdido',
}

async function resumir(transcricao: string): Promise<string | null> {
  const { anthropic_api_key } = await getWaConfig()
  if (!anthropic_api_key || !transcricao.trim()) return null
  try {
    const anthropic = new Anthropic({ apiKey: anthropic_api_key })
    const r: any = await Promise.race([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 160,
        system:
          'Você resume, em no máximo 2 frases curtas em português do Brasil, o que o CLIENTE quer nesta conversa de ' +
          'WhatsApp com a Spin Solar (energia solar, baterias, recarga de carro elétrico e serviços elétricos). ' +
          'Use só o que o cliente disse — não invente valores, cidades nem produtos. Se ele só cumprimentou, ' +
          'responda exatamente: "Só cumprimentou, ainda não disse o que precisa." Sem saudação, sem markdown.',
        messages: [{ role: 'user', content: transcricao.slice(0, 6000) }],
      }),
      new Promise((_, falha) => setTimeout(() => falha(new Error('tempo esgotado')), 12_000)),
    ])
    const txt = (r?.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join('').trim()
    return txt || null
  } catch (e) {
    console.error('[aviso-conversa-nova] resumo', e)
    return null
  }
}

export async function avisarKalebeConversaNova(conversaId: string, desde: string): Promise<void> {
  await new Promise((ok) => setTimeout(ok, ESPERA_MS))
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, origem_campanha, contato:contato_id(id, telefone, nome_exibicao, tipo, cliente_id, projeto_id)')
    .eq('id', conversaId)
    .maybeSingle()
  const ct: any = (conv as any)?.contato
  if (!conv || !ct?.telefone) return

  // Equipe Spin escrevendo pro número não é cliente
  if (ct.tipo === 'colaborador' || ct.tipo === 'representante') return
  const tel = String(ct.telefone).replace(/\D/g, '')
  const telSemDdi = tel.startsWith('55') ? tel.slice(2) : tel
  const { data: daEquipe } = await admin
    .from('profiles').select('id').or(`telefone.eq.${tel},telefone.eq.${telSemDdi}`).limit(1)
  if (daEquipe?.length) return

  const [{ data: cliente }, { data: projetos }, { data: msgs }] = await Promise.all([
    ct.cliente_id
      ? admin.from('clientes').select('id, razao_social').eq('id', ct.cliente_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    ct.cliente_id
      ? admin.from('projetos').select('id, codigo, status').eq('cliente_id', ct.cliente_id).is('excluida_em', null)
          .order('created_at', { ascending: false }).limit(3)
      : Promise.resolve({ data: [] as any[] }),
    admin.from('wa_mensagens')
      .select('direcao, texto, tipo, origem_agente_nome')
      .eq('conversa_id', conversaId)
      .gte('criada_em', desde)
      .order('criada_em', { ascending: true })
      .limit(30),
  ])

  const linhasConversa = ((msgs || []) as any[])
    .filter((m) => m.texto)
    .map((m) => `${m.direcao === 'inbound' ? 'Cliente' : (m.origem_agente_nome || 'Spin')}: ${String(m.texto).trim()}`)
  const primeira = ((msgs || []) as any[]).find((m) => m.direcao === 'inbound')
  const textoPrimeira = primeira?.texto
    ? String(primeira.texto).trim()
    : primeira ? `[${primeira.tipo === 'audio' ? 'áudio' : primeira.tipo || 'mídia'}]` : ''
  const resumo = await resumir(linhasConversa.join('\n'))

  const nome = ct.nome_exibicao || cliente?.razao_social || 'Sem nome no WhatsApp'
  const projetoLink = ct.projeto_id || (projetos as any[])?.[0]?.id || null
  const linkCard = cliente?.id
    ? `${URL_PORTAL}/crm/clientes/${cliente.id}`
    : projetoLink ? `${URL_PORTAL}/projetos/${projetoLink}` : null
  const corte = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

  const mensagem = [
    `👤 *${nome}* · ${formatarTelefone(telSemDdi) || tel}`,
    cliente
      ? `🏷️ Cliente cadastrado: ${cliente.razao_social}${(projetos as any[])?.length
          ? ` — ${(projetos as any[]).map((p) => `${p.codigo} (${STATUS_PT[p.status] || String(p.status).replace(/_/g, ' ')})`).join(', ')}`
          : ''}`
      : '🆕 Lead novo (sem cadastro)',
    conv.origem_campanha ? `📣 Origem: ${conv.origem_campanha}` : null,
    resumo ? `📝 Resumo: ${resumo}` : null,
    textoPrimeira ? `💬 “${corte(textoPrimeira, 220)}”` : null,
    linkCard ? `🔗 Card do cliente: ${linkCard}` : null,
    `🔗 Conversa: ${URL_PORTAL}/inbox?c=${conversaId}`,
  ].filter(Boolean).join('\n')

  const r = await avisarUsuario({
    destinatario_id: DESTINATARIO_ID,
    agente: 'qualificacao',
    titulo: 'Nova conversa de cliente',
    mensagem,
    conversa_id: conversaId,
    projeto_id: projetoLink,
  })
  if (!r.sucesso || (r.whatsapp_status && !r.whatsapp_status.startsWith('enviado'))) {
    console.warn('[aviso-conversa-nova]', r.erro || r.whatsapp_status, r.whatsapp_erro || '')
  }
}
