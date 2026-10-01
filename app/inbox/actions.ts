'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  gravarMensagem,
  findOrCreateConversaAtiva,
  upsertContato,
} from '@/lib/whatsapp/conversas'
import { marcarContatoConfirmado } from '@/lib/whatsapp/broadcast'
import { getWaConfig } from '@/lib/whatsapp/config'
import { baixarESalvarMidiaWa, salvarBufferMidiaWa } from '@/lib/whatsapp/midia'
import { revalidatePath } from 'next/cache'

/**
 * Inbox WhatsApp — Sprint 1 do canal integrado.
 * Kalebe 2026-09-12: canal comum de recepção e comunicação Spin.
 */

type CheckUsuario =
  | { erro: string; user: null; perfil: null }
  | { erro: null; user: { id: string }; perfil: { id: string; role: string; nome_completo: string | null } | null }

async function verificarUsuario(): Promise<CheckUsuario> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado', user: null, perfil: null }
  const { data: perfil } = await supabase
    .from('profiles').select('id, role, nome_completo').eq('id', user.id).maybeSingle()
  return { erro: null, user: { id: user.id }, perfil: (perfil as any) || null }
}

export async function listarConversasAction(): Promise<
  | { conversas: any[] }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const supabase = createClient()

  // RLS já filtra pra quem não é admin (responsável + fila de leads).
  // Kalebe 2026-10-01: fora do comercial (profissional de campo, instalador,
  // colaborador) só vê as conversas em que é o responsável — a fila de leads
  // aguardando representante não é com eles.
  const papel = check.perfil?.role || ''
  const veFilaDeLeads = ['admin', 'representante', 'vendedor_servicos'].includes(papel)
  // Kalebe 2026-10-01: foto do contato/cliente (mig 131). Sem a migration as
  // colunas não existem → lista sem foto em vez de quebrar o inbox.
  const consulta = (comFoto: boolean) => {
    let q = supabase
      .from('wa_conversas')
      .select(`
        id, status, responsavel_id, agente_ativo, origem_campanha,
        ultima_mensagem_em, janela_24h_expira_em, sla_prazo_em,
        criada_em, encerrada_em,
        contato:contato_id(id, telefone, nome_exibicao, tipo, cliente_id, projeto_id${comFoto ? ', foto_url, cliente:cliente_id(foto_url)' : ''}),
        responsavel:responsavel_id(nome_completo)
      `)
    if (!veFilaDeLeads) q = q.eq('responsavel_id', check.user!.id)
    return q
      .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
      .limit(200)
  }
  let { data, error }: { data: any[] | null; error: any } = await consulta(true)
  if (error && /foto_url/.test(error.message)) ({ data, error } = await consulta(false) as any)

  if (error) return { erro: error.message }

  // Kalebe 2026-09-30: não lidas por conversa (migration 131; sem ela, fica 0)
  const { data: naoLidas } = await supabase.rpc('wa_nao_lidas')
  const qtd = new Map(((naoLidas || []) as any[]).map((n) => [n.conversa_id, Number(n.qtd) || 0]))
  return { conversas: (data || []).map((c: any) => ({ ...c, nao_lidas: qtd.get(c.id) || 0 })) }
}

/** Abriu a conversa = leu tudo até agora (por usuário). */
export async function marcarConversaLidaAction(conversa_id: string): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const { error } = await createClient().from('wa_leituras').upsert({
    conversa_id, usuario_id: check.user.id, lido_ate: new Date().toISOString(),
  })
  if (error && !/wa_leituras/.test(error.message)) return { erro: error.message }
  return { sucesso: true }
}

/**
 * Baixa de novo da Meta uma mídia que não foi salva no Storage (arquivo
 * grande demais, tipo não aceito, falha de rede). A Meta guarda a mídia
 * por ~30 dias. Kalebe 2026-09-25.
 */
export async function recuperarMidiaAction(mensagem_id: string): Promise<
  { midia_url: string } | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }

  // Leitura pela sessão do usuário: RLS garante que ele enxerga a conversa
  const supabase = createClient()
  const { data: msg } = await supabase
    .from('wa_mensagens')
    .select('id, midia_url, midia_meta_id, midia_mime, midia_expirada_em, texto')
    .eq('id', mensagem_id)
    .maybeSingle()
  if (!msg) return { erro: 'Mensagem não encontrada' }
  if (msg.midia_url) return { midia_url: msg.midia_url }
  if (msg.midia_expirada_em) return { erro: 'Arquivo removido pela regra de 180 dias.' }
  if (!msg.midia_meta_id) return { erro: 'Mensagem sem arquivo' }

  const salvo = await baixarESalvarMidiaWa({
    midia_meta_id: msg.midia_meta_id,
    mime_hint: msg.midia_mime,
    nome_original: msg.texto,
  })
  if (!salvo) return { erro: 'Não foi possível baixar da Meta (arquivo expirado ou grande demais).' }

  const admin = createAdminClient()
  await admin
    .from('wa_mensagens')
    .update({ midia_url: salvo.midia_url, midia_mime: salvo.midia_mime })
    .eq('id', msg.id)
  return { midia_url: salvo.midia_url }
}

export async function listarMensagensAction(conversa_id: string): Promise<
  | { mensagens: any[] }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const supabase = createClient()

  const { data, error } = await supabase
    .from('wa_mensagens')
    .select(`
      id, direcao, tipo, texto, meta_message_id,
      midia_url, midia_meta_id, midia_mime, midia_duracao_seg, midia_expirada_em,
      remetente_id, remetente_agente, origem_agente_nome,
      status_entrega, erro,
      criada_em, entregue_em, lida_em,
      remetente:remetente_id(nome_completo)
    `)
    .eq('conversa_id', conversa_id)
    .order('criada_em', { ascending: true })
    .limit(500)

  if (error) return { erro: error.message }
  return { mensagens: data || [] }
}

export async function assumirConversaAction(conversa_id: string): Promise<
  | { sucesso: true }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, status, responsavel_id')
    .eq('id', conversa_id)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  if (conv.responsavel_id && conv.responsavel_id !== check.user.id) {
    return { erro: 'Conversa já tem outro responsável.' }
  }

  const { error } = await admin
    .from('wa_conversas')
    .update({
      responsavel_id: check.user.id,
      status: 'em_atendimento',
      agente_ativo: null,
    })
    .eq('id', conversa_id)

  if (error) return { erro: error.message }
  revalidatePath('/inbox')
  return { sucesso: true }
}

type Atendente = { id: string; nome: string; papel: string }

/**
 * Quem pode receber um atendimento transferido, por setor (Kalebe
 * 2026-10-01: escolhe o setor e depois a pessoa). Setores = grupos internos
 * (mig 125/126); quem está bloqueado no grupo não aparece. Quem não está em
 * setor nenhum cai em "Sem setor". Tudo A→Z.
 */
export async function listarAtendentesAction(): Promise<
  { setores: Array<{ chave: string; nome: string; emoji: string; usuarios: Atendente[] }> } | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const admin = createAdminClient()
  // Toda a equipe ativa (candidato a vaga não atende). O enum user_role não
  // tem 'consultor' — valor inválido no filtro derruba a consulta inteira.
  const [{ data: perfis, error }, { data: grupos }, { data: membros }] = await Promise.all([
    admin.from('profiles').select('id, nome_completo, role').eq('ativo', true).neq('role', 'candidato'),
    admin.from('grupos_internos').select('id, chave, nome, emoji').eq('ativo', true),
    admin.from('grupos_membros').select('grupo_id, usuario_id, bloqueado_em'),
  ])
  if (error) return { erro: error.message }

  const porId = new Map(((perfis || []) as any[]).map((p) => [
    p.id as string,
    { id: p.id as string, nome: (p.nome_completo as string) || 'Sem nome', papel: p.role as string },
  ]))
  const aZ = (a: Atendente, b: Atendente) => a.nome.localeCompare(b.nome, 'pt-BR')
  const comSetor = new Set<string>()
  const setores = ((grupos || []) as any[]).map((g) => {
    const usuarios = ((membros || []) as any[])
      .filter((m) => m.grupo_id === g.id && !m.bloqueado_em && porId.has(m.usuario_id))
      .map((m) => { comSetor.add(m.usuario_id); return porId.get(m.usuario_id)! })
      .sort(aZ)
    return { chave: g.chave as string, nome: g.nome as string, emoji: (g.emoji as string) || '👥', usuarios }
  }).filter((s) => s.usuarios.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const semSetor = Array.from(porId.values()).filter((p) => !comSetor.has(p.id)).sort(aZ)
  if (semSetor.length) setores.push({ chave: 'sem_setor', nome: 'Sem setor', emoji: '👤', usuarios: semSetor })
  return { setores }
}

/**
 * Kalebe 2026-10-01: transfere o atendimento pra outro usuário. A Laís avisa
 * o novo responsável (WhatsApp + sino) com resumo da conversa, recado e
 * links. Pode transferir: admin, o responsável atual ou qualquer um quando a
 * conversa ainda não tem responsável.
 */
export async function transferirConversaAction(entrada: {
  conversa_id: string
  para_id: string
  recado?: string
}): Promise<{ sucesso: true; nome: string; whatsapp: boolean; motivo: string | null } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }

  // RLS: só transfere conversa que enxerga
  const { data: conv } = await createClient()
    .from('wa_conversas').select('id, responsavel_id, encerrada_em').eq('id', entrada.conversa_id).maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  if (conv.encerrada_em) return { erro: 'Conversa encerrada' }
  const ehAdmin = check.perfil?.role === 'admin'
  if (!ehAdmin && conv.responsavel_id && conv.responsavel_id !== check.user.id) {
    return { erro: 'Só o responsável atual ou o admin transfere esta conversa' }
  }
  if (entrada.para_id === conv.responsavel_id) return { erro: 'Essa pessoa já é a responsável' }

  const admin = createAdminClient()
  const { data: dest } = await admin
    .from('profiles').select('id, nome_completo, ativo, role').eq('id', entrada.para_id).maybeSingle()
  if (!dest?.ativo || dest.role === 'candidato') {
    return { erro: 'Usuário de destino inválido ou desativado' }
  }

  const { error } = await admin
    .from('wa_conversas')
    .update({ responsavel_id: dest.id, status: 'em_atendimento', agente_ativo: null })
    .eq('id', conv.id)
  if (error) return { erro: error.message }
  revalidatePath('/inbox')

  // Transferiu pra si mesmo = assumiu; não precisa de aviso
  if (dest.id === check.user.id) return { sucesso: true, nome: dest.nome_completo || '', whatsapp: false, motivo: null }

  const { dadosContatoConversa, transcricaoDaConversa, resumirConversa, cortar } = await import('@/lib/whatsapp/resumo-conversa')
  const { avisarUsuario } = await import('@/lib/agentes/diretorio')
  const d = await dadosContatoConversa(admin, conv.id)
  const { linhas } = await transcricaoDaConversa(admin, conv.id, { limite: 40 })
  const resumo = await resumirConversa(linhas, 'atendimento')
  const recado = (entrada.recado || '').trim()
  const de = (check.perfil?.nome_completo || 'Alguém da equipe').split(' ')[0]

  const mensagem = [
    `↪ *${de}* transferiu pra você o atendimento de *${d?.nome || 'cliente'}*${d ? ` · ${d.telefoneFmt}` : ''}`,
    d ? `${d.cliente ? '🏷️' : '🆕'} ${d.situacao}` : null,
    recado ? `🗒️ Recado: ${cortar(recado, 500)}` : null,
    resumo ? `📝 Resumo: ${resumo}` : null,
    d ? `🔗 Conversa: ${d.linkConversa}` : null,
    d?.linkCard ? `🔗 Card do cliente: ${d.linkCard}` : null,
  ].filter(Boolean).join('\n')

  const r = await avisarUsuario({
    destinatario_id: dest.id,
    agente: 'qualificacao',
    remetente_usuario_id: check.user.id,
    titulo: 'Atendimento transferido pra você',
    mensagem,
    conversa_id: conv.id,
    projeto_id: d?.projetoId || null,
  })
  return {
    sucesso: true,
    nome: dest.nome_completo || '',
    whatsapp: !!r.whatsapp_status?.startsWith('enviado'),
    motivo: r.whatsapp_status === 'sem_telefone' ? 'sem telefone no cadastro' : (r.whatsapp_erro || null),
  }
}

export async function encerrarConversaAction(conversa_id: string): Promise<
  | { sucesso: true }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const admin = createAdminClient()

  const { error } = await admin
    .from('wa_conversas')
    .update({
      status: 'encerrada',
      encerrada_em: new Date().toISOString(),
      encerrada_por: check.user.id,
    })
    .eq('id', conversa_id)

  if (error) return { erro: error.message }
  revalidatePath('/inbox')
  return { sucesso: true }
}

/**
 * Envia mensagem de texto pelo canal WhatsApp Spin.
 * - Grava wa_mensagens (direcao=outbound, remetente_id, origem_agente_nome)
 * - Chama Meta Cloud API com prefixo do nome do agente ("*Kalebe:* ...")
 *   pra permitir multi-persona no mesmo canal.
 */
export async function enviarTextoAction(entrada: {
  conversa_id: string
  texto: string
  prefixar_com_nome?: boolean  // default true
}): Promise<{ sucesso: true; meta_message_id: string | null } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const texto = String(entrada.texto || '').trim()
  if (!texto) return { erro: 'Mensagem vazia' }

  const _cfg = await getWaConfig()
  const token = _cfg.access_token
  const phoneNumberId = _cfg.phone_number_id
  if (!token || !phoneNumberId) return { erro: 'Meta Cloud API não configurada. Cadastre em /admin/whatsapp/config.' }

  const admin = createAdminClient()

  // Recupera telefone do contato via conversa
  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, contato:contato_id(telefone)')
    .eq('id', entrada.conversa_id)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  const tel = (conv.contato as any)?.telefone
  if (!tel) return { erro: 'Contato sem telefone' }

  // Multi-persona: prefixa com nome do agente (default) pra o cliente saber
  // quem tá falando dentro do canal Spin.
  const nomeAgente = check.perfil?.nome_completo || 'Spin'
  const prefixar = entrada.prefixar_com_nome !== false
  const corpo = prefixar ? `*${nomeAgente}:*\n${texto}` : texto

  // Envia via Cloud API
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: tel,
      type: 'text',
      text: { body: corpo, preview_url: false },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const erroMsg = data?.error?.message || 'Erro Meta API'
    const erroCode = data?.error?.code
    const foraJanela = erroCode === 131047 || String(erroMsg).includes('24 hours')
    return {
      erro: foraJanela
        ? 'Cliente não respondeu nas últimas 24h — precisa mensagem template pré-aprovada pela Meta.'
        : erroMsg,
    }
  }

  const metaMessageId: string | null = data?.messages?.[0]?.id || null

  // Grava no modelo canônico. Não precisa upsert de contato (já existe).
  await gravarMensagem(admin, {
    conversa_id: entrada.conversa_id,
    direcao: 'outbound',
    tipo: 'text',
    texto,  // guarda SEM prefixo pra ver limpo no inbox
    meta_message_id: metaMessageId,
    remetente_id: check.user.id,
    origem_agente_nome: nomeAgente,
    status_entrega: 'enviada',
  })

  // Se conversa estava 'nova' ou 'em_qualificacao', humano assumiu
  await admin
    .from('wa_conversas')
    .update({ status: 'em_atendimento', responsavel_id: check.user.id, agente_ativo: null })
    .eq('id', entrada.conversa_id)
    .in('status', ['nova', 'em_qualificacao', 'aguardando_representante'])

  // Detecta broadcast atribuído a esse humano → marca contatou
  // (msg dele pelo canal Spin conta como cumprimento de SLA)
  try {
    const { data: bcAtribuido } = await admin
      .from('lead_broadcasts')
      .select('id')
      .eq('conversa_id', entrada.conversa_id)
      .in('status', ['atribuido'])
      .maybeSingle()
    if (bcAtribuido) {
      await marcarContatoConfirmado({
        broadcast_id: bcAtribuido.id,
        representante_id: check.user.id,
      })
    }
  } catch (e) {
    console.error('[enviarTextoAction/marcarContato]', e)
  }

  revalidatePath('/inbox')
  return { sucesso: true, meta_message_id: metaMessageId }
}

/**
 * Kalebe 2026-09-15: 'quero ter acesso à conversa e comunicação
 * diretamente com o cliente dentro do seu card'.
 *
 * Retorna conversa (com contato) + últimas N mensagens. Serve pra
 * embutir preview da conversa dentro do card de projeto.
 * Se cliente não tem telefone ou sem conversa ainda, retorna null
 * — o card decide como renderizar.
 */
export async function buscarConversaDoProjetoAction(
  projeto_id: string,
  limit_msgs = 20,
): Promise<
  { conversa: any | null; mensagens: any[]; contato: any | null; telefone_projeto?: string | null }
  | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }

  const admin = createAdminClient()

  const { data: projeto } = await admin
    .from('projetos')
    .select('id, cliente_telefone, cliente_razao_social, consultor_id')
    .eq('id', projeto_id)
    .maybeSingle()
  if (!projeto) return { erro: 'Projeto não encontrado' }
  if (check.perfil?.role === 'consultor' && projeto.consultor_id !== check.user.id) {
    return { erro: 'Não é seu projeto' }
  }

  const digs = String(projeto.cliente_telefone || '').replace(/\D/g, '')
  if (digs.length < 10) return { conversa: null, mensagens: [], contato: null, telefone_projeto: null }
  let tel = digs
  if (tel.length === 10 || tel.length === 11) tel = '55' + tel

  const { data: contato } = await admin
    .from('wa_contatos')
    .select('id, telefone, nome_exibicao, tipo, projeto_id')
    .eq('telefone', tel)
    .maybeSingle()

  // Kalebe 2026-09-29: projeto com telefone mas sem conversa ainda — a caixa
  // do projeto mostra o campo de mensagem e abre o canal no 1º envio.
  if (!contato) return { conversa: null, mensagens: [], contato: null, telefone_projeto: tel }

  const { data: conversas } = await admin
    .from('wa_conversas')
    .select('id, status, agente_ativo, responsavel_id, criada_em, ultima_mensagem_em, janela_24h_expira_em, encerrada_em')
    .eq('contato_id', contato.id)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .limit(1)
  const conversa = (conversas || [])[0] || null
  if (!conversa) return { conversa: null, mensagens: [], contato }

  const { data: mensagens } = await admin
    .from('wa_mensagens')
    .select(`
      id, direcao, tipo, texto, meta_message_id,
      midia_url, midia_meta_id, midia_mime, midia_duracao_seg, midia_expirada_em,
      remetente_id, remetente_agente, origem_agente_nome,
      status_entrega, criada_em, lida_em,
      remetente:remetente_id(nome_completo)
    `)
    .eq('conversa_id', conversa.id)
    .order('criada_em', { ascending: false })
    .limit(limit_msgs)

  return {
    conversa,
    contato,
    mensagens: (mensagens || []).reverse(), // ordem cronológica
  }
}

/**
 * Kalebe 2026-09-14: 'botão para enviar arquivos, fazer ligação e
 * videochamada como se fosse no whatsapp'.
 *
 * iniciarChamadaAction gera sala Jitsi Meet única e envia link pelo canal
 * Spin pra o cliente. Kalebe abre o link no navegador dele; cliente abre
 * pelo WhatsApp. Sala funciona no browser sem instalar nada.
 *
 * Marca contato confirmado no broadcast (SLA cumprido).
 */
export async function iniciarChamadaAction(entrada: {
  conversa_id: string
  tipo: 'voz' | 'video'
}): Promise<{ url_sala: string; texto_enviado: string } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, contato:contato_id(telefone, nome_exibicao)')
    .eq('id', entrada.conversa_id)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  const tel = (conv.contato as any)?.telefone
  if (!tel) return { erro: 'Contato sem telefone' }

  // Sala Jitsi Meet única (sem senha) — nome longo/aleatório evita colisão.
  // Formato: spin-{tipo}-{8char aleatórios}
  const salaId = `spin-${entrada.tipo}-${Math.random().toString(36).slice(2, 10)}`
  const url_sala = `https://meet.jit.si/${salaId}`

  const nomeAgente = check.perfil?.nome_completo || 'Spin'
  const emoji = entrada.tipo === 'video' ? '📹' : '📞'
  const titulo = entrada.tipo === 'video' ? 'Videochamada' : 'Chamada de voz'
  const nomeLead = ((conv.contato as any)?.nome_exibicao || '').split(' ')[0] || 'você'

  const texto = [
    `${emoji} *${titulo} Spin*`,
    ``,
    `Oi ${nomeLead}, sou o ${nomeAgente}. Preparei uma sala pra gente conversar agora.`,
    ``,
    `Toca no link pra entrar:`,
    url_sala,
    ``,
    `Funciona no navegador do celular ou computador, sem instalar nada.`,
  ].join('\n')

  // Envia pelo canal
  const _cfg = await getWaConfig()
  const token = _cfg.access_token
  const phoneNumberId = _cfg.phone_number_id
  if (!token || !phoneNumberId) return { erro: 'Meta Cloud API não configurada. Cadastre em /admin/whatsapp/config.' }
  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: tel,
      type: 'text',
      text: { body: texto, preview_url: true },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    return { erro: data?.error?.message || 'Erro Meta API' }
  }
  const metaMessageId: string | null = data?.messages?.[0]?.id || null

  await gravarMensagem(admin, {
    conversa_id: entrada.conversa_id,
    direcao: 'outbound',
    tipo: 'text',
    texto,
    meta_message_id: metaMessageId,
    remetente_id: check.user.id,
    origem_agente_nome: nomeAgente,
    status_entrega: 'enviada',
  })

  // Marca contato no broadcast atribuído a esse humano (SLA cumprido)
  try {
    const { data: bc } = await admin
      .from('lead_broadcasts')
      .select('id')
      .eq('conversa_id', entrada.conversa_id)
      .in('status', ['atribuido'])
      .maybeSingle()
    if (bc) {
      await marcarContatoConfirmado({ broadcast_id: bc.id, representante_id: check.user.id })
    }
  } catch (e) {
    console.error('[iniciarChamadaAction/marcarContato]', e)
  }

  // Muda conversa pra em_atendimento
  await admin
    .from('wa_conversas')
    .update({ status: 'em_atendimento', responsavel_id: check.user.id, agente_ativo: null })
    .eq('id', entrada.conversa_id)
    .in('status', ['nova', 'em_qualificacao', 'aguardando_representante'])

  revalidatePath('/inbox')
  return { url_sala, texto_enviado: texto }
}

/**
 * Envia arquivo (imagem, documento, áudio) pelo canal Spin.
 * Upload pro Meta Media API + envia com media_id.
 */
export async function enviarArquivoAction(formData: FormData): Promise<
  { sucesso: true; meta_message_id: string | null; tipo: string } | { erro: string }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }

  const conversa_id = String(formData.get('conversa_id') || '')
  const arquivo = formData.get('arquivo') as File | null
  const legenda = String(formData.get('legenda') || '')
  if (!conversa_id || !arquivo) return { erro: 'Faltam conversa_id ou arquivo' }

  const _cfg = await getWaConfig()
  const token = _cfg.access_token
  const phoneNumberId = _cfg.phone_number_id
  if (!token || !phoneNumberId) return { erro: 'Meta Cloud API não configurada. Cadastre em /admin/whatsapp/config.' }

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, contato:contato_id(telefone)')
    .eq('id', conversa_id)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  const tel = (conv.contato as any)?.telefone
  if (!tel) return { erro: 'Contato sem telefone' }

  // Descobre tipo da msg pelo mime
  const mime = arquivo.type || 'application/octet-stream'
  const tipoMsg: 'image' | 'document' | 'audio' | 'video' =
    mime.startsWith('image/') ? 'image'
    : mime.startsWith('audio/') ? 'audio'
    : mime.startsWith('video/') ? 'video'
    : 'document'

  // 1) Upload da mídia pro Meta Media API
  const uploadForm = new FormData()
  uploadForm.append('file', arquivo)
  uploadForm.append('type', mime)
  uploadForm.append('messaging_product', 'whatsapp')
  const uploadResp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: uploadForm,
  })
  const uploadData = await uploadResp.json()
  if (!uploadResp.ok) {
    return { erro: `Upload falhou: ${uploadData?.error?.message || 'erro Meta'}` }
  }
  const mediaId: string = uploadData?.id
  if (!mediaId) return { erro: 'Meta não retornou media id' }

  // 2) Envia mensagem com o media_id
  const payload: any = {
    messaging_product: 'whatsapp',
    to: tel,
    type: tipoMsg,
  }
  payload[tipoMsg] = { id: mediaId }
  if (legenda && (tipoMsg === 'image' || tipoMsg === 'document' || tipoMsg === 'video')) {
    payload[tipoMsg].caption = legenda
  }
  if (tipoMsg === 'document') payload.document.filename = arquivo.name

  const sendResp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const sendData = await sendResp.json()
  if (!sendResp.ok) {
    return { erro: sendData?.error?.message || 'Falha ao enviar mídia' }
  }
  const metaMessageId: string | null = sendData?.messages?.[0]?.id || null

  // Guarda cópia no Storage pra o histórico mostrar preview/player
  // (Kalebe 2026-09-25). Falha aqui não desfaz o envio.
  const salvo = await salvarBufferMidiaWa({
    buffer: Buffer.from(await arquivo.arrayBuffer()),
    mime,
    chave: mediaId,
    nome_original: arquivo.name,
  })

  const nomeAgente = check.perfil?.nome_completo || 'Spin'
  await gravarMensagem(admin, {
    conversa_id,
    direcao: 'outbound',
    tipo: tipoMsg,
    texto: legenda || (tipoMsg === 'document' ? arquivo.name : null),
    midia_url: salvo?.midia_url || null,
    midia_meta_id: mediaId,
    midia_mime: mime,
    meta_message_id: metaMessageId,
    remetente_id: check.user.id,
    origem_agente_nome: nomeAgente,
    status_entrega: 'enviada',
  })

  // Marca contato no broadcast atribuído (áudio conta como cumprimento SLA)
  try {
    const { data: bc } = await admin
      .from('lead_broadcasts')
      .select('id')
      .eq('conversa_id', conversa_id)
      .in('status', ['atribuido'])
      .maybeSingle()
    if (bc) {
      await marcarContatoConfirmado({ broadcast_id: bc.id, representante_id: check.user.id })
    }
  } catch (e) {
    console.error('[enviarArquivoAction/marcarContato]', e)
  }

  await admin
    .from('wa_conversas')
    .update({ status: 'em_atendimento', responsavel_id: check.user.id, agente_ativo: null })
    .eq('id', conversa_id)
    .in('status', ['nova', 'em_qualificacao', 'aguardando_representante'])

  revalidatePath('/inbox')
  return { sucesso: true, meta_message_id: metaMessageId, tipo: tipoMsg }
}

/**
 * Kalebe 2026-09-14: 'em cada card de cliente ter o botão de acesso ao
 * canal de comunicação já dentro'.
 *
 * Abre (ou cria) a conversa WhatsApp de um projeto. Se o cliente
 * ainda não tem contato/conversa, cria automaticamente.
 * Retorna o conversa_id pra redirecionar pro /inbox?c=<id>.
 */
export async function abrirCanalDoProjetoAction(
  projeto_id: string,
): Promise<{ conversa_id: string } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  return garantirCanalDoProjeto(createAdminClient(), projeto_id, check)
}

/**
 * Kalebe 2026-09-29: "Enviar por WhatsApp" das propostas sai pelo canal
 * Spin (fica no inbox) em vez de abrir o wa.me. Manda o PDF como documento
 * (a Meta busca pelo link público) com a mensagem na legenda.
 * Janela de 24h fechada → não tenta: devolve janela_fechada pra tela
 * oferecer copiar o link.
 */
export async function enviarPropostaPeloCanalAction(entrada: {
  projeto_id: string
  url_pdf: string
  nome_arquivo: string
  legenda: string
}): Promise<
  | { sucesso: true; conversa_id: string }
  | { erro: string; janela_fechada?: boolean; conversa_id?: string; telefone?: string | null }
> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  if (!/^https:\/\//.test(entrada.url_pdf)) return { erro: 'Gere o PDF antes de enviar' }

  const admin = createAdminClient()
  const canal = await garantirCanalDoProjeto(admin, entrada.projeto_id, check)
  if ('erro' in canal) return canal

  const { data: conv } = await admin
    .from('wa_conversas')
    .select('id, janela_24h_expira_em, contato:contato_id(telefone)')
    .eq('id', canal.conversa_id)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  const janelaAberta = !!conv.janela_24h_expira_em && new Date(conv.janela_24h_expira_em) > new Date()
  if (!janelaAberta) {
    // Kalebe 2026-09-30: janela fechada → modelo aprovado spin_proposta_pronta
    // (botão "Ver proposta" abre app.spinsolar.com.br/proposta/<caminho do PDF>)
    const sufixo = entrada.url_pdf.split('/propostas-pdf/')[1]
    if (sufixo) {
      const { enviarTemplatePeloCanal, primeiroNome, templateAprovado } = await import('@/lib/whatsapp/templates')
      if (await templateAprovado('proposta_pronta')) {
        const { data: ct } = await admin.from('wa_contatos').select('nome_exibicao')
          .eq('telefone', String((conv.contato as any)?.telefone || '')).maybeSingle()
        const r = await enviarTemplatePeloCanal({
          conversa_id: canal.conversa_id,
          telefone: (conv.contato as any)?.telefone,
          template: 'proposta_pronta',
          parametros: [
            primeiroNome(ct?.nome_exibicao) || 'tudo bem',
            primeiroNome(check.perfil?.nome_completo) || 'Spin Solar',
            /equipamento/i.test(entrada.nome_arquivo) ? 'equipamentos' : 'energia solar',
          ],
          botao_url_sufixo: sufixo,
          remetente_id: check.user.id,
          origem_agente_nome: check.perfil?.nome_completo || 'Spin',
        })
        if ('sucesso' in r) {
          revalidatePath('/inbox')
          return { sucesso: true, conversa_id: canal.conversa_id }
        }
      }
    }
    // Sem modelo aprovado: devolve o telefone pra tela abrir o WhatsApp
    // Business (app do número Spin não tem a trava de 24h da API)
    return {
      erro: 'A API do WhatsApp não deixa enviar: o cliente não escreveu pro número da Spin nas últimas 24h.',
      janela_fechada: true,
      conversa_id: canal.conversa_id,
      telefone: (conv.contato as any)?.telefone || null,
    }
  }

  const _cfg = await getWaConfig()
  if (!_cfg.access_token || !_cfg.phone_number_id) return { erro: 'Meta Cloud API não configurada.' }
  const tel = (conv.contato as any)?.telefone
  const nomeAgente = check.perfil?.nome_completo || 'Spin'
  const legenda = `*${nomeAgente}:*\n${entrada.legenda}`.slice(0, 1024)

  const resp = await fetch(`https://graph.facebook.com/v20.0/${_cfg.phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${_cfg.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: tel,
      type: 'document',
      document: { link: entrada.url_pdf, filename: entrada.nome_arquivo, caption: legenda },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const code = data?.error?.code
    return code === 131047
      ? { erro: 'A API do WhatsApp não deixa enviar: o cliente não escreveu pro número da Spin nas últimas 24h.', janela_fechada: true, conversa_id: canal.conversa_id, telefone: tel || null }
      : { erro: `[${code || resp.status}] ${data?.error?.message || 'Falha ao enviar'}` }
  }

  await gravarMensagem(admin, {
    conversa_id: canal.conversa_id,
    direcao: 'outbound',
    tipo: 'document',
    texto: entrada.nome_arquivo,
    midia_url: entrada.url_pdf,
    midia_mime: 'application/pdf',
    meta_message_id: data?.messages?.[0]?.id || null,
    remetente_id: check.user.id,
    origem_agente_nome: nomeAgente,
    status_entrega: 'enviada',
  })
  // Humano falou com o cliente: conversa é dele e o agente sai
  await admin
    .from('wa_conversas')
    .update({ status: 'em_atendimento', responsavel_id: check.user.id, agente_ativo: null })
    .eq('id', canal.conversa_id)
    .in('status', ['nova', 'em_qualificacao', 'aguardando_representante'])

  revalidatePath('/inbox')
  return { sucesso: true, conversa_id: canal.conversa_id }
}

/**
 * Janela de 24h aberta? (cliente mandou mensagem pro número da Spin nas
 * últimas 24h). Fora dela a Meta aceita o envio e falha depois — então a
 * tela checa antes. Kalebe 2026-09-29.
 */
export async function janelaAbertaAction(conversa_id: string): Promise<{ aberta: boolean; telefone: string | null } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  const { data: conv } = await createAdminClient()
    .from('wa_conversas').select('janela_24h_expira_em').eq('id', conversa_id).maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' }
  const aberta = !!conv.janela_24h_expira_em && new Date(conv.janela_24h_expira_em) > new Date()
  // Kalebe 2026-10-01: janela fechada → a caixa oferece mandar pelo app
  // WhatsApp Business (sem trava de 24h). Telefone pelo RLS: só quem vê a conversa.
  let telefone: string | null = null
  if (!aberta) {
    const { data: c } = await createClient()
      .from('wa_conversas').select('contato:contato_id(telefone)').eq('id', conversa_id).maybeSingle()
    telefone = (c as any)?.contato?.telefone || null
  }
  return { aberta, telefone }
}

/**
 * Kalebe 2026-09-30: janela fechada (ou cliente nunca escreveu) → modelo
 * aprovado spin_retomar_atendimento. Quando o cliente responde, a janela
 * reabre e o inbox volta a mandar texto livre.
 */
export async function statusModeloRetomadaAction(): Promise<{ status: string; rotulo: string }> {
  const { statusDoTemplate, STATUS_TEMPLATE_PT } = await import('@/lib/whatsapp/templates')
  const status = await statusDoTemplate('retomar_atendimento')
  return { status, rotulo: STATUS_TEMPLATE_PT[status] || status }
}

export async function reabrirComModeloAction(entrada: {
  conversa_id: string
  nome_cliente: string
  assunto: string
}): Promise<{ sucesso: true } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  // RLS: só quem enxerga a conversa pode mandar
  const { data: conv } = await createClient()
    .from('wa_conversas')
    .select('id, contato:contato_id(telefone, nome_exibicao)')
    .eq('id', entrada.conversa_id)
    .maybeSingle()
  const contato: any = (conv as any)?.contato
  if (!conv || !contato?.telefone) return { erro: 'Conversa não encontrada' }

  const { enviarTemplatePeloCanal, primeiroNome } = await import('@/lib/whatsapp/templates')
  const nomeUsuario = primeiroNome(check.perfil?.nome_completo) || 'Spin Solar'
  const r = await enviarTemplatePeloCanal({
    conversa_id: conv.id,
    telefone: contato.telefone,
    template: 'retomar_atendimento',
    parametros: [
      entrada.nome_cliente.trim() || primeiroNome(contato.nome_exibicao) || 'tudo bem',
      nomeUsuario,
      entrada.assunto.trim() || 'energia solar',
    ],
    remetente_id: check.user.id,
    origem_agente_nome: nomeUsuario,
  })
  if ('erro' in r) return { erro: r.erro }
  revalidatePath('/inbox')
  return { sucesso: true }
}

/** Contato + conversa do cliente do projeto (cria se não existir). */
async function garantirCanalDoProjeto(
  admin: ReturnType<typeof createAdminClient>,
  projeto_id: string,
  check: Extract<CheckUsuario, { erro: null }>,
): Promise<{ conversa_id: string } | { erro: string }> {
  const { data: projeto } = await admin
    .from('projetos')
    .select('id, cliente_razao_social, cliente_telefone, consultor_id')
    .eq('id', projeto_id)
    .maybeSingle()
  if (!projeto) return { erro: 'Projeto não encontrado' }

  // Gate: admin/representante/consultor podem abrir qualquer projeto;
  // consultor comum só o próprio.
  if (check.perfil?.role === 'consultor' && projeto.consultor_id !== check.user.id) {
    return { erro: 'Não é seu projeto' }
  }

  const telefone = String(projeto.cliente_telefone || '').replace(/\D/g, '')
  if (!telefone || telefone.length < 10) {
    return { erro: 'Cliente sem telefone válido no cadastro.' }
  }
  let tel = telefone
  if (tel.length === 11 || tel.length === 10) tel = '55' + tel

  const contato = await upsertContato(admin, {
    telefone: tel,
    nome_exibicao: projeto.cliente_razao_social || undefined,
    tipo_default: 'lead',
  })
  if (!contato) return { erro: 'Falha ao criar contato' }

  // Se contato ainda não linkava projeto, linka agora
  await admin
    .from('wa_contatos')
    .update({ projeto_id })
    .eq('id', contato.id)

  const conversa = await findOrCreateConversaAtiva(admin, contato.id, {
    status_inicial: 'em_atendimento',
  })
  if (!conversa) return { erro: 'Falha ao abrir conversa' }

  return { conversa_id: conversa.id }
}

/**
 * Cria conversa manualmente iniciando pelo telefone (pra testar sem cliente
 * mandar msg primeiro). Só admin.
 */
export async function abrirConversaManualAction(entrada: {
  telefone: string
  nome_exibicao?: string
}): Promise<{ conversa_id: string } | { erro: string }> {
  const check = await verificarUsuario()
  if (check.erro || !check.user) return { erro: check.erro || 'Sem usuário' }
  if (check.perfil?.role !== 'admin') return { erro: 'Só admin pode abrir conversa manual.' }

  const admin = createAdminClient()
  const contato = await upsertContato(admin, {
    telefone: entrada.telefone,
    nome_exibicao: entrada.nome_exibicao,
  })
  if (!contato) return { erro: 'Falha ao criar contato' }
  const conversa = await findOrCreateConversaAtiva(admin, contato.id)
  if (!conversa) return { erro: 'Falha ao criar conversa' }

  revalidatePath('/inbox')
  return { conversa_id: conversa.id }
}
