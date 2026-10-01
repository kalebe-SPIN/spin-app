import { createAdminClient } from '@/lib/supabase/admin'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { dadosContatoConversa, transcricaoDaConversa, resumirConversa, cortar } from '@/lib/whatsapp/resumo-conversa'

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

export async function avisarKalebeConversaNova(conversaId: string, desde: string): Promise<void> {
  await new Promise((ok) => setTimeout(ok, ESPERA_MS))
  const admin = createAdminClient()

  const d = await dadosContatoConversa(admin, conversaId)
  if (!d || d.ehEquipe) return   // equipe Spin escrevendo pro número não é cliente

  const { linhas, primeiraDoCliente } = await transcricaoDaConversa(admin, conversaId, { desde })
  const resumo = await resumirConversa(linhas, 'pedido')

  const mensagem = [
    `👤 *${d.nome}* · ${d.telefoneFmt}`,
    `${d.cliente ? '🏷️' : '🆕'} ${d.situacao}`,
    d.origemCampanha ? `📣 Origem: ${d.origemCampanha}` : null,
    resumo ? `📝 Resumo: ${resumo}` : null,
    primeiraDoCliente ? `💬 “${cortar(primeiraDoCliente, 220)}”` : null,
    d.linkCard ? `🔗 Card do cliente: ${d.linkCard}` : null,
    `🔗 Conversa: ${d.linkConversa}`,
  ].filter(Boolean).join('\n')

  const r = await avisarUsuario({
    destinatario_id: DESTINATARIO_ID,
    agente: 'qualificacao',
    titulo: 'Nova conversa de cliente',
    mensagem,
    conversa_id: conversaId,
    projeto_id: d.projetoId,
  })
  if (!r.sucesso || (r.whatsapp_status && !r.whatsapp_status.startsWith('enviado'))) {
    console.warn('[aviso-conversa-nova]', r.erro || r.whatsapp_status, r.whatsapp_erro || '')
  }
}
