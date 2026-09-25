import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarTextoPeloCanal } from '@/lib/whatsapp/enviar-canal'
import { upsertContato, findOrCreateConversaAtiva } from '@/lib/whatsapp/conversas'

/**
 * Diretório + comunicação interna compartilhados por todos os agentes.
 * Kalebe 2026-09-23.
 *
 * - Bianca e Davi (falam só com a equipe logada) recebem as 4 ferramentas.
 *   buscar_cliente usa a sessão do usuário (RLS): cada um vê pela IA só o
 *   que já vê no portal. Diretório da equipe e de agentes é aberto.
 * - SDR (fala com leads) NÃO recebe essas ferramentas: só enxerga o cadastro
 *   de quem está conversando com ele (cadastroDoContato) e pode avisarEquipe.
 * - Aviso interno vai sempre pro sino do portal E pro WhatsApp do usuário.
 * - Dados financeiros de usuários (comissão etc.) nunca são expostos.
 */

export type AgenteChave = 'bianca' | 'davi' | 'qualificacao'
type Resultado = { sucesso: boolean; dados?: any; erro?: string; _hint?: string }

const NOME_AGENTE: Record<AgenteChave, string> = {
  bianca: 'Bianca',
  davi: 'Davi',
  qualificacao: 'Assistente Spin',
}

// Agentes definidos em código (os de WhatsApp vêm também da tabela wa_agentes)
const AGENTES_FIXOS = [
  { chave: 'bianca', nome: 'Bianca', canal: 'portal (chat)', funcao: 'Secretária executiva: agenda, tarefas, projetos, homologações, WhatsApp e e-mail pra equipe e clientes.' },
  { chave: 'davi', nome: 'Davi', canal: 'portal (chat, só admin)', funcao: 'Compras e catálogo: preços de produtos, cotações, itens sem preço ou desatualizados.' },
  { chave: 'qualificacao', nome: 'Assistente Spin', canal: 'WhatsApp (leads)', funcao: 'SDR: recebe leads no WhatsApp, coleta nome/cidade/fatura, cria projeto e dispara pros representantes.' },
]

export const FERRAMENTAS_DIRETORIO: Anthropic.Tool[] = [
  {
    name: 'buscar_cliente',
    description: 'Busca o cadastro de clientes e projetos por nome, razão social, código do projeto (ex: SPIN-2026-0075), telefone ou CPF/CNPJ. Retorna dados de contato, endereço, projetos, status e consultor responsável. Só retorna o que o usuário atual tem permissão de ver.',
    input_schema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Nome, código do projeto, telefone ou CPF/CNPJ (mín. 3 caracteres)' },
      },
      required: ['termo'],
    },
  },
  {
    name: 'buscar_usuario',
    description: 'Consulta o cadastro da equipe interna Spin (nome, papel, telefone/WhatsApp, e-mail, se está ativo). Sem termo, lista a equipe inteira. Use pra achar o id de alguém antes de avisar_usuario.',
    input_schema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Parte do nome (opcional)' },
        papel: { type: 'string', description: 'Filtra por papel: admin, consultor, representante, profissional_campo, vendedor_servicos (opcional)' },
      },
    },
  },
  {
    name: 'listar_agentes',
    description: 'Lista os agentes de IA do sistema (Bianca, Davi, agentes de WhatsApp) com o que cada um faz e onde atua. Use pra saber quem resolve o quê.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'avisar_usuario',
    description: 'Manda um AVISO INTERNO pra um usuário da equipe Spin. Chega no sino do portal e no WhatsApp dele. Use pra avisos, lembretes e recados internos (ex: "avisa o Vanildo que a visita mudou pra 14h"). Informe destinatario_usuario_id (pegue com buscar_usuario) ou o nome exato.',
    input_schema: {
      type: 'object',
      properties: {
        destinatario_usuario_id: { type: 'string', description: 'UUID do usuário (preferível)' },
        destinatario_nome: { type: 'string', description: 'Nome do usuário, se não tiver o id' },
        titulo: { type: 'string', description: 'Título curto (opcional)' },
        mensagem: { type: 'string', description: 'Texto do aviso em português, direto e cordial' },
        urgente: { type: 'boolean', description: 'Marca como urgente (destaque no portal)' },
        projeto_id: { type: 'string', description: 'Projeto relacionado (opcional)' },
      },
      required: ['mensagem'],
    },
  },
]

const NOMES_FERRAMENTAS = new Set(FERRAMENTAS_DIRETORIO.map((f) => f.name))

/**
 * Executa uma ferramenta do diretório. Retorna null se o nome não for daqui
 * (o executor do agente segue pro próprio switch).
 */
export async function executarFerramentaDiretorio(
  supabaseUsuario: SupabaseClient,
  usuarioId: string,
  agente: AgenteChave,
  nome: string,
  input: any,
): Promise<Resultado | null> {
  if (!NOMES_FERRAMENTAS.has(nome)) return null
  const admin = createAdminClient()
  try {
    switch (nome) {
      case 'buscar_cliente': {
        const dados = await buscarCliente(supabaseUsuario, String(input?.termo || ''))
        await registrarAcesso(admin, agente, usuarioId, nome, input, dados.clientes.length + dados.projetos.length)
        if (dados.clientes.length + dados.projetos.length === 0) {
          return { sucesso: true, dados, _hint: 'Nenhum cliente ou projeto encontrado com esse termo (ou fora da permissão do usuário).' }
        }
        return { sucesso: true, dados }
      }
      case 'buscar_usuario': {
        const usuarios = await buscarUsuario(admin, input?.termo, input?.papel)
        await registrarAcesso(admin, agente, usuarioId, nome, input, usuarios.length)
        return { sucesso: true, dados: usuarios }
      }
      case 'listar_agentes': {
        return { sucesso: true, dados: await listarAgentes(admin) }
      }
      case 'avisar_usuario': {
        let destId: string | null = input?.destinatario_usuario_id || null
        if (!destId && input?.destinatario_nome) {
          const achados = await buscarUsuario(admin, input.destinatario_nome)
          if (achados.length === 0) return { sucesso: false, erro: `Nenhum usuário com nome "${input.destinatario_nome}".` }
          if (achados.length > 1) {
            return {
              sucesso: false,
              erro: `Mais de um usuário com "${input.destinatario_nome}": ${achados.map((u) => u.nome).join(', ')}. Use destinatario_usuario_id.`,
            }
          }
          destId = achados[0].id
        }
        if (!destId) return { sucesso: false, erro: 'Informe destinatario_usuario_id ou destinatario_nome.' }
        const r = await avisarUsuario({
          destinatario_id: destId,
          agente,
          remetente_usuario_id: usuarioId,
          titulo: input?.titulo || null,
          mensagem: String(input?.mensagem || ''),
          urgente: !!input?.urgente,
          projeto_id: input?.projeto_id || null,
        })
        if (!r.sucesso) return { sucesso: false, erro: r.erro }
        return {
          sucesso: true,
          dados: r,
          _hint: r.whatsapp_status === 'enviado'
            ? '✅ Aviso entregue no portal e no WhatsApp.'
            : `✅ Aviso no portal. WhatsApp não saiu (${r.whatsapp_erro || r.whatsapp_status}).`,
        }
      }
    }
  } catch (e: any) {
    return { sucesso: false, erro: e?.message || 'Falha na ferramenta de diretório' }
  }
  return null
}

// ─── Consultas ────────────────────────────────────────────────────────────

function limparTermo(t: string): string {
  return String(t || '').replace(/[,()%*]/g, ' ').trim()
}

/** Busca com a sessão do usuário: respeita RLS (cada um vê o que já vê no portal). */
export async function buscarCliente(supabase: SupabaseClient, termoBruto: string) {
  const termo = limparTermo(termoBruto)
  if (termo.length < 3) return { clientes: [] as any[], projetos: [] as any[] }
  const digitos = termoBruto.replace(/\D/g, '')
  const buscaDigitos = digitos.length >= 6
  // Telefone/CPF podem estar formatados no banco: pré-filtra pelos 4 últimos
  // dígitos (contíguos mesmo com máscara) e confere o número inteiro em JS.
  const ult4 = digitos.slice(-4)
  const soDigitos = (s: any) => String(s || '').replace(/\D/g, '')

  const filtroCli = buscaDigitos
    ? `cpf_cnpj.ilike.%${ult4}%,telefone.ilike.%${ult4}%,whatsapp.ilike.%${ult4}%`
    : `razao_social.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%`
  const { data: cliRaw } = await supabase
    .from('clientes')
    .select('id, razao_social, nome_fantasia, cpf_cnpj, tipo, email, telefone, whatsapp, endereco, origem, observacoes')
    .or(filtroCli)
    .limit(30)

  const filtroProj = buscaDigitos
    ? `cliente_telefone.ilike.%${ult4}%`
    : `codigo.ilike.%${termo}%,cliente_razao_social.ilike.%${termo}%`
  const { data: projRaw } = await supabase
    .from('projetos')
    .select('id, codigo, status, tipo_projeto, cliente_id, cliente_razao_social, cliente_telefone, cliente_email, orcamento_consolidado, updated_at, consultor:consultor_id(nome_completo)')
    .or(filtroProj)
    .order('updated_at', { ascending: false })
    .limit(30)

  const clientes = (cliRaw || [])
    .filter((c: any) => !buscaDigitos
      || [c.cpf_cnpj, c.telefone, c.whatsapp].some((v) =>
        soDigitos(v).includes(digitos) || (soDigitos(v).length >= 8 && digitos.includes(soDigitos(v)))))
    .slice(0, 10)

  const projetos = (projRaw || [])
    .filter((p: any) => !buscaDigitos
      || soDigitos(p.cliente_telefone).includes(digitos)
      || (soDigitos(p.cliente_telefone).length >= 8 && digitos.includes(soDigitos(p.cliente_telefone))))
    .slice(0, 10)
    .map((p: any) => ({
      id: p.id,
      codigo: p.codigo,
      status: p.status,
      tipo: p.tipo_projeto,
      cliente: p.cliente_razao_social,
      telefone: p.cliente_telefone,
      email: p.cliente_email,
      cliente_id: p.cliente_id,
      consultor: (Array.isArray(p.consultor) ? p.consultor[0] : p.consultor)?.nome_completo || null,
      pv_total: p.orcamento_consolidado?.pv_total ?? null,
      atualizado_em: p.updated_at,
    }))

  return { clientes, projetos }
}

/** Diretório da equipe (dados de contato; nada financeiro). */
export async function buscarUsuario(admin: SupabaseClient, termo?: string | null, papel?: string | null) {
  let q = admin
    .from('profiles')
    .select('id, nome_completo, role, telefone, ativo')
    .order('nome_completo')
  const t = limparTermo(termo || '')
  if (t) q = q.ilike('nome_completo', `%${t}%`)
  if (papel) q = q.eq('role', papel)
  const { data: perfis } = await q.limit(50)

  // E-mail fica em auth.users (profiles não tem)
  const emails = new Map<string, string>()
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 })
    for (const u of data?.users || []) if (u.email) emails.set(u.id, u.email)
  } catch {}

  return (perfis || []).map((p: any) => ({
    id: p.id,
    nome: p.nome_completo,
    papel: p.role,
    telefone: p.telefone || null,
    email: emails.get(p.id) || null,
    ativo: p.ativo,
  }))
}

export async function listarAgentes(admin: SupabaseClient) {
  const { data: wa } = await admin
    .from('wa_agentes')
    .select('chave, nome, descricao_interna, ativo')
  const extras = (wa || [])
    .filter((a: any) => !AGENTES_FIXOS.some((f) => f.chave === a.chave))
    .map((a: any) => ({
      chave: a.chave,
      nome: a.nome,
      canal: 'WhatsApp',
      funcao: a.descricao_interna || '',
      ativo: a.ativo,
    }))
  return [...AGENTES_FIXOS.map((a) => ({ ...a, ativo: true })), ...extras]
}

/**
 * Cadastro RESTRITO pro SDR: só o cliente/projetos do próprio contato que
 * está conversando. Nunca consulta terceiros.
 */
export async function cadastroDoContato(
  admin: SupabaseClient,
  contato: { cliente_id?: string | null; projeto_id?: string | null },
) {
  if (!contato?.cliente_id && !contato?.projeto_id) return null
  const cliente = contato.cliente_id
    ? (await admin.from('clientes')
        .select('razao_social, nome_fantasia, tipo, endereco')
        .eq('id', contato.cliente_id).maybeSingle()).data
    : null
  let q = admin.from('projetos').select('codigo, status, tipo_projeto, created_at')
  q = contato.cliente_id
    ? q.or(`cliente_id.eq.${contato.cliente_id}${contato.projeto_id ? `,id.eq.${contato.projeto_id}` : ''}`)
    : q.eq('id', contato.projeto_id as string)
  const { data: projetos } = await q.order('created_at', { ascending: false }).limit(5)
  return {
    cliente: cliente ? { nome: cliente.razao_social || cliente.nome_fantasia, tipo: cliente.tipo, cidade: (cliente.endereco as any)?.cidade || null } : null,
    projetos: (projetos || []).map((p: any) => ({ codigo: p.codigo, status: p.status, tipo: p.tipo_projeto })),
  }
}

// ─── Comunicação interna ─────────────────────────────────────────────────

export async function avisarUsuario(entrada: {
  destinatario_id: string
  agente: AgenteChave
  remetente_usuario_id?: string | null
  titulo?: string | null
  mensagem: string
  urgente?: boolean
  projeto_id?: string | null
  conversa_id?: string | null
}): Promise<{ sucesso: boolean; erro?: string; aviso_id?: string; whatsapp_status?: string; whatsapp_erro?: string | null }> {
  const admin = createAdminClient()
  const mensagem = String(entrada.mensagem || '').trim()
  if (!mensagem) return { sucesso: false, erro: 'Mensagem vazia' }

  const { data: perfil } = await admin
    .from('profiles')
    .select('id, nome_completo, telefone, ativo')
    .eq('id', entrada.destinatario_id)
    .maybeSingle()
  if (!perfil) return { sucesso: false, erro: 'Usuário destinatário não encontrado' }

  // 1) Sino do portal (sempre)
  const { data: aviso, error } = await admin
    .from('avisos_internos')
    .insert({
      destinatario_id: perfil.id,
      remetente_agente: entrada.agente,
      remetente_usuario_id: entrada.remetente_usuario_id || null,
      titulo: entrada.titulo || null,
      mensagem,
      urgente: !!entrada.urgente,
      projeto_id: entrada.projeto_id || null,
      conversa_id: entrada.conversa_id || null,
    })
    .select('id')
    .single()
  if (error || !aviso) return { sucesso: false, erro: error?.message || 'Falha ao gravar aviso' }

  // 2) WhatsApp do usuário (sempre que houver telefone)
  let tel = String(perfil.telefone || '').replace(/\D/g, '')
  if (tel && !tel.startsWith('55') && (tel.length === 10 || tel.length === 11)) tel = '55' + tel
  let whatsapp_status = 'sem_telefone'
  let whatsapp_erro: string | null = null
  if (tel.length >= 12) {
    try {
      const contato = await upsertContato(admin, {
        telefone: tel,
        nome_exibicao: perfil.nome_completo,
        tipo_default: 'colaborador',
      })
      const conv = contato
        ? await findOrCreateConversaAtiva(admin, contato.id, { status_inicial: 'em_atendimento' })
        : null
      if (!conv) throw new Error('Falha ao abrir conversa WhatsApp')
      const texto = `🔔 *Aviso interno${entrada.urgente ? ' — URGENTE' : ''}*${entrada.titulo ? `\n*${entrada.titulo}*` : ''}\n${mensagem}`
      const r: any = await enviarTextoPeloCanal({
        conversa_id: conv.id,
        telefone: tel,
        texto,
        remetente_agente: entrada.agente,
        origem_agente_nome: NOME_AGENTE[entrada.agente],
      })
      if (r?.sucesso) whatsapp_status = 'enviado'
      else { whatsapp_status = 'falhou'; whatsapp_erro = r?.erro || 'Falha no envio' }
    } catch (e: any) {
      whatsapp_status = 'falhou'
      whatsapp_erro = e?.message || 'Falha no envio'
    }
  }

  await admin
    .from('avisos_internos')
    .update({ whatsapp_status, whatsapp_erro })
    .eq('id', aviso.id)

  return { sucesso: true, aviso_id: aviso.id, whatsapp_status, whatsapp_erro }
}

/**
 * SDR avisa a equipe: vai pro responsável da conversa; se não tiver, pra
 * todos os admins ativos.
 */
export async function avisarEquipe(entrada: {
  agente: AgenteChave
  mensagem: string
  conversa_id?: string | null
  projeto_id?: string | null
  responsavel_id?: string | null
}) {
  const admin = createAdminClient()
  let destinatarios: string[] = []
  if (entrada.responsavel_id) {
    destinatarios = [entrada.responsavel_id]
  } else {
    const { data: admins } = await admin
      .from('profiles').select('id').eq('role', 'admin').eq('ativo', true)
    destinatarios = (admins || []).map((a: any) => a.id)
  }
  for (const id of destinatarios) {
    await avisarUsuario({
      destinatario_id: id,
      agente: entrada.agente,
      titulo: 'Recado do WhatsApp',
      mensagem: entrada.mensagem,
      conversa_id: entrada.conversa_id || null,
      projeto_id: entrada.projeto_id || null,
    })
  }
  return destinatarios.length
}

async function registrarAcesso(
  admin: SupabaseClient,
  agente: AgenteChave,
  solicitanteId: string | null,
  ferramenta: string,
  parametros: any,
  qtd: number,
) {
  try {
    await admin.from('agentes_acessos_log').insert({
      agente,
      solicitante_id: solicitanteId,
      ferramenta,
      parametros: parametros || null,
      qtd_resultados: qtd,
    })
  } catch {}
}
