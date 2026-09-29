'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from '@/lib/whatsapp/config'
import { formatarCpfCnpj, formatarTelefone } from '@/lib/formatters'
import { TIPOS_ITEM, type TipoItem } from '@/lib/tipos-projeto'
import { cartoesDoTexto, salvarContatosNoProjeto } from '@/lib/whatsapp/contatos-projeto'

/**
 * Inbox → projeto (Kalebe 2026-09-29): botão na conversa transforma o
 * atendimento em projeto, já associando os dois e com os dados que a
 * conversa tem (o que a Laís coletou + o que a IA lê no texto e na fatura).
 *
 * 1. prepararProjetoDaConversaAction → sugestão pré-preenchida pro modal
 * 2. criarProjetoDaConversaAction    → cria (ou completa o da Laís) e liga
 *    contato/conversa/broadcast ao projeto
 * A fatura em si é analisada depois, no navegador, pela mesma rota
 * /api/analisar-fatura do passo Fatura.
 */

export type SugestaoProjeto = {
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string
  cep: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  uf: string
  tipo_item: TipoItem
  consumo_kwh_mes: number | null
  valor_conta_media: number | null
  resumo: string
}

export type ArquivoConversa = { url: string; nome: string; mime: string; criada_em: string }

export type PreparoProjeto = {
  sugestao: SugestaoProjeto
  faturas: ArquivoConversa[]
  projeto_existente: { id: string; codigo: string; status: string; pode_completar: boolean } | null
  extraido_por_ia: boolean
  eh_admin: boolean
}

const TIPOS_VALIDOS = TIPOS_ITEM.filter((t) => !t.oculto && t.disponivel).map((t) => t.chave)

async function carregarConversa(conversaId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  // Leitura pela sessão: RLS garante que o usuário enxerga essa conversa
  const { data: conv } = await supabase
    .from('wa_conversas')
    .select('id, status, responsavel_id, contexto_qualificacao, contato:contato_id(id, telefone, nome_exibicao, cliente_id, projeto_id)')
    .eq('id', conversaId)
    .maybeSingle()
  if (!conv) return { erro: 'Conversa não encontrada' as const }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { user, conv: conv as any, contato: (conv as any).contato as any, role: perfil?.role || null }
}

function mapearTipoContexto(t?: string | null): TipoItem {
  switch (t) {
    case 'hibrido': return 'fv_hibrido'
    case 'bess': return 'bess'
    case 've_recarga': return 've_recarga'
    case 'limpeza': return 'srv_limpeza'
    case 'revisao': return 'srv_manutencao'
    default: return 'fv_ongrid'
  }
}

export async function prepararProjetoDaConversaAction(conversaId: string): Promise<PreparoProjeto | { erro: string }> {
  const r = await carregarConversa(conversaId)
  if ('erro' in r) return { erro: r.erro as string }
  const { conv, contato, role } = r
  const admin = createAdminClient()
  const ctx = conv.contexto_qualificacao || {}

  // Base: o que a Laís já coletou + dados do contato
  const sugestao: SugestaoProjeto = {
    nome: ctx.nome_cliente || contato?.nome_exibicao || '',
    cpf_cnpj: '', email: '',
    telefone: formatarTelefone(String(contato?.telefone || '').replace(/^55/, '')),
    cep: '', rua: '', numero: '', bairro: '',
    cidade: ctx.cidade || '', uf: ctx.uf || 'SC',
    tipo_item: mapearTipoContexto(ctx.tipo_sistema),
    consumo_kwh_mes: ctx.consumo_kwh_mes ?? null,
    valor_conta_media: ctx.valor_conta_media ?? null,
    resumo: ctx.observacoes || '',
  }

  // Mensagens + arquivos candidatos a fatura (foto/PDF que o cliente mandou)
  const { data: msgsDesc } = await admin
    .from('wa_mensagens')
    .select('direcao, tipo, texto, criada_em, midia_url, midia_mime, origem_agente_nome')
    .eq('conversa_id', conversaId)
    .order('criada_em', { ascending: false })
    .limit(80)
  const msgs = (msgsDesc || []).slice().reverse()
  const faturas: ArquivoConversa[] = msgs
    .filter((m: any) => m.direcao === 'inbound' && m.midia_url
      && (m.tipo === 'image' || (m.tipo === 'document' && String(m.midia_mime || '').includes('pdf'))))
    .map((m: any) => ({
      url: m.midia_url,
      nome: m.texto || (m.tipo === 'image' ? 'foto.jpg' : 'documento.pdf'),
      mime: m.midia_mime || (m.tipo === 'image' ? 'image/jpeg' : 'application/pdf'),
      criada_em: m.criada_em,
    }))
    .reverse()   // mais recente primeiro

  // Projeto que a Laís já criou pra esse contato (esqueleto sem consultor)
  let projeto_existente: PreparoProjeto['projeto_existente'] = null
  const projetoId = contato?.projeto_id || ctx.projeto_id || null
  if (projetoId) {
    const { data: p } = await admin
      .from('projetos').select('id, codigo, status, consultor_id, excluida_em').eq('id', projetoId).maybeSingle()
    if (p && !p.excluida_em) {
      projeto_existente = {
        id: p.id, codigo: p.codigo, status: p.status,
        pode_completar: p.status === 'rascunho' && (!p.consultor_id || p.consultor_id === r.user.id),
      }
    }
  }

  // IA lê a conversa (e a fatura mais recente, se pequena) pra completar
  let extraido_por_ia = false
  try {
    const cfg = await getWaConfig()
    if (cfg.anthropic_api_key) {
      const transcricao = msgs.map((m: any) => {
        const quem = m.direcao === 'inbound' ? 'Cliente' : (m.origem_agente_nome || 'Spin')
        const t = m.tipo === 'text' || m.tipo === 'template' ? (m.texto || '') : `[${m.tipo}${m.texto ? `: ${m.texto}` : ''}]`
        return `${quem}: ${t}`
      }).join('\n').slice(-12000)

      const anexos: Anthropic.ContentBlockParam[] = []
      const fatura = faturas[0]
      if (fatura && await tamanhoOk(fatura.url)) {
        anexos.push(fatura.mime.includes('pdf')
          ? { type: 'document', source: { type: 'url', url: fatura.url } }
          : { type: 'image', source: { type: 'url', url: fatura.url } })
      }

      const pedir = (comAnexo: boolean) => new Anthropic({ apiKey: cfg.anthropic_api_key! }).messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: PROMPT_EXTRACAO,
        messages: [{
          role: 'user',
          content: [
            ...(comAnexo ? anexos : []),
            { type: 'text', text: `Dados já coletados pela SDR: ${JSON.stringify(ctx)}\n\nConversa:\n${transcricao}\n\nDevolva só o JSON.` },
          ],
        }],
      })
      const resp = await pedir(true).catch((e) => (anexos.length ? pedir(false) : Promise.reject(e)))
      const bloco = resp.content.find((b) => b.type === 'text') as any
      const j = JSON.parse(String(bloco?.text || '{}').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
      const txt = (v: any) => (typeof v === 'string' ? v.trim() : '')
      const numOuNull = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
      sugestao.nome = txt(j.nome) || sugestao.nome
      sugestao.cpf_cnpj = txt(j.cpf_cnpj) ? formatarCpfCnpj(txt(j.cpf_cnpj)) : ''
      sugestao.email = txt(j.email)
      sugestao.cep = txt(j.cep)
      sugestao.rua = txt(j.rua)
      sugestao.numero = txt(j.numero)
      sugestao.bairro = txt(j.bairro)
      sugestao.cidade = txt(j.cidade) || sugestao.cidade
      sugestao.uf = (txt(j.uf) || sugestao.uf).toUpperCase().slice(0, 2)
      if (TIPOS_VALIDOS.includes(j.tipo_item)) sugestao.tipo_item = j.tipo_item
      sugestao.consumo_kwh_mes = numOuNull(j.consumo_kwh_mes) ?? sugestao.consumo_kwh_mes
      sugestao.valor_conta_media = numOuNull(j.valor_conta_media) ?? sugestao.valor_conta_media
      sugestao.resumo = txt(j.resumo) || sugestao.resumo
      extraido_por_ia = true
    }
  } catch (e) {
    console.error('[prepararProjetoDaConversa] IA falhou — segue com o que tem:', e)
  }

  return { sugestao, faturas, projeto_existente, extraido_por_ia, eh_admin: role === 'admin' }
}

const PROMPT_EXTRACAO = `Você extrai dados cadastrais de um atendimento de WhatsApp da Spin Solar (energia solar, SC)
pra abrir um projeto. Pode vir anexada a fatura de energia do cliente — use-a (titular, CPF/CNPJ,
endereço da unidade, consumo médio em kWh, valor da conta).

Regras:
- Só preencha o que estiver EXPLÍCITO na conversa ou na fatura. Nada de chute: deixe "" ou null.
- Endereço: prefira o da unidade consumidora na fatura; senão o que o cliente escreveu.
- tipo_item: escolha UM entre ${TIPOS_VALIDOS.join(', ')} pelo que o cliente quer.
  Sem pista clara, use "fv_ongrid".
- resumo: 1 a 2 frases pro consultor — o que o cliente quer e qualquer detalhe relevante.

Formato (JSON estrito, sem cercas):
{"nome":"","cpf_cnpj":"","email":"","cep":"","rua":"","numero":"","bairro":"","cidade":"","uf":"",
 "tipo_item":"fv_ongrid","consumo_kwh_mes":null,"valor_conta_media":null,"resumo":""}`

async function tamanhoOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    const n = Number(r.headers.get('content-length'))
    return r.ok && n > 0 && n <= 5 * 1024 * 1024
  } catch { return false }
}

const ORIGENS = ['base_repassada', 'lead_spin', 'aquecimento_1', 'aquecimento_2', 'lead_verba', 'indicacao', 'prospeccao', 'resgate']

export async function criarProjetoDaConversaAction(input: {
  conversa_id: string
  dados: SugestaoProjeto
  completar_existente: boolean
  origem_lead?: string
}): Promise<{ projeto_id: string; codigo: string } | { erro: string }> {
  const r = await carregarConversa(input.conversa_id)
  if ('erro' in r) return { erro: r.erro as string }
  const { user, conv, contato, role } = r
  const d = input.dados
  if (!d.nome.trim()) return { erro: 'Informe o nome do cliente' }
  if (!TIPOS_VALIDOS.includes(d.tipo_item)) return { erro: 'Escolha o tipo de projeto' }
  const doc = d.cpf_cnpj.replace(/\D/g, '')
  if (doc && doc.length !== 11 && doc.length !== 14) return { erro: 'CPF/CNPJ incompleto — corrija ou deixe em branco' }

  // Escritas com service role DEPOIS da checagem de acesso acima: representante
  // não tem permissão de update em wa_contatos, e o gatilho de origem_lead
  // gravaria "prospecção" — lead que chegou pelo canal Spin é lead_spin.
  const admin = createAdminClient()
  const tel = String(contato?.telefone || '').replace(/\D/g, '')
  const endereco = {
    cep: d.cep, rua: d.rua, numero: d.numero, complemento: '',
    bairro: d.bairro, cidade: d.cidade, uf: d.uf,
  }

  // Cliente: acha por CPF/CNPJ, depois pelo telefone; senão cria
  let clienteId: string | null = contato?.cliente_id || null
  if (!clienteId && doc) {
    const { data } = await admin.from('clientes').select('id')
      .or(`cpf_cnpj.eq.${doc},cpf_cnpj.eq.${formatarCpfCnpj(doc)}`).limit(1)
    clienteId = data?.[0]?.id || null
  }
  if (!clienteId && tel.length >= 10) {
    const final8 = tel.slice(-8)
    const { data } = await admin.from('clientes').select('id, telefone, whatsapp')
      .or(`telefone.ilike.%${final8.slice(-4)}%,whatsapp.ilike.%${final8.slice(-4)}%`).limit(30)
    const achado = (data || []).find((c: any) =>
      [c.telefone, c.whatsapp].some((v) => String(v || '').replace(/\D/g, '').endsWith(final8)))
    clienteId = achado?.id || null
  }
  if (!clienteId) {
    const { data: novo, error } = await admin.from('clientes').insert({
      razao_social: d.nome.trim(),
      cpf_cnpj: doc ? formatarCpfCnpj(doc) : null,
      tipo: doc.length === 14 ? 'pj' : 'pf',
      email: d.email.trim() || null,
      telefone: d.telefone || null,
      whatsapp: d.telefone || null,
      endereco,
      origem: 'whatsapp',
      proprietario_id: user.id,
    }).select('id').single()
    if (error || !novo) return { erro: `Erro ao cadastrar cliente: ${error?.message || ''}` }
    clienteId = novo.id
  }

  const observacoes = [
    `Origem: WhatsApp (inbox) — conversa ${input.conversa_id.slice(0, 8)}`,
    d.resumo,
    d.consumo_kwh_mes ? `Consumo médio informado: ${d.consumo_kwh_mes} kWh/mês` : null,
    d.valor_conta_media ? `Conta média informada: R$ ${d.valor_conta_media}` : null,
  ].filter(Boolean).join('\n')

  const campos = {
    consultor_id: user.id,
    cliente_id: clienteId,
    cliente_razao_social: d.nome.trim(),
    cliente_cpf_cnpj: doc ? formatarCpfCnpj(doc) : null,
    cliente_email: d.email.trim() || null,
    cliente_telefone: d.telefone || null,
    cliente_endereco: endereco,
    endereco_instalacao: endereco,
    observacoes_consultor: observacoes,
  }
  const origem = role === 'admin' && input.origem_lead && ORIGENS.includes(input.origem_lead)
    ? input.origem_lead : 'lead_spin'
  const criadoPorRole = role === 'admin' ? 'admin' : role === 'consultor' ? 'consultor' : 'representante'

  let projetoId: string
  let codigo: string
  const existenteId = contato?.projeto_id || conv.contexto_qualificacao?.projeto_id || null
  if (input.completar_existente && existenteId) {
    const { data: p } = await admin.from('projetos')
      .select('id, codigo, status, consultor_id, analise_fatura').eq('id', existenteId).maybeSingle()
    if (!p || p.status !== 'rascunho' || (p.consultor_id && p.consultor_id !== user.id)) {
      return { erro: 'O projeto da Laís já andou ou é de outro consultor — crie um novo.' }
    }
    // A Laís guarda o contexto dela em analise_fatura; o passo Fatura leria
    // isso como "fatura já cadastrada". O contexto continua na conversa.
    const soContextoLais = !!(p.analise_fatura as any)?.origem_qualificacao_whatsapp
    const { error } = await admin.from('projetos')
      .update({ ...campos, ...(soContextoLais ? { analise_fatura: null } : {}) })
      .eq('id', p.id)
    if (error) return { erro: error.message }
    projetoId = p.id
    codigo = p.codigo
  } else {
    const { data: p, error } = await admin.from('projetos').insert({
      ...campos,
      status: 'rascunho',
      origem_lead: origem,
      criado_por_role: criadoPorRole,
    }).select('id, codigo').single()
    if (error || !p) return { erro: `Erro ao criar projeto: ${error?.message || ''}` }
    projetoId = p.id
    codigo = p.codigo
  }

  // Tipo do projeto (mesmo formato do passo "Tipos")
  const { data: itens } = await admin.from('projeto_itens')
    .select('id, tipo').eq('projeto_id', projetoId).neq('status', 'removido')
  if (!(itens || []).some((i: any) => i.tipo === d.tipo_item)) {
    await admin.from('projeto_itens').insert({
      projeto_id: projetoId, tipo: d.tipo_item, ordem: (itens || []).length, status: 'pendente', dados: {},
    })
  }

  // Associa: contato ↔ cliente/projeto, conversa (assume se ninguém tinha) e broadcast
  await admin.from('wa_contatos')
    .update({ projeto_id: projetoId, cliente_id: clienteId, nome_exibicao: contato?.nome_exibicao || d.nome.trim() })
    .eq('id', contato.id)
  await admin.from('wa_conversas')
    .update({
      contexto_qualificacao: { ...(conv.contexto_qualificacao || {}), projeto_id: projetoId },
      ...(conv.responsavel_id ? {} : { responsavel_id: user.id, status: 'em_atendimento', agente_ativo: null }),
    })
    .eq('id', conv.id)
  await admin.from('lead_broadcasts')
    .update({ projeto_id: projetoId })
    .eq('conversa_id', conv.id)
    .is('projeto_id', null)

  // Cartões de contato que o cliente mandou na conversa (ex.: o decisor) entram no projeto
  try {
    const { data: msgsCartao } = await admin
      .from('wa_mensagens').select('id, texto').eq('conversa_id', conv.id).eq('tipo', 'contacts')
    for (const mc of msgsCartao || []) {
      await salvarContatosNoProjeto(admin, {
        projeto_id: projetoId,
        contatos: cartoesDoTexto(mc.texto),
        origem: 'whatsapp_cartao',
        wa_mensagem_id: mc.id,
        criado_por: user.id,
      })
    }
  } catch (e) {
    console.error('[criarProjetoDaConversa] contatos do projeto', e)
  }

  revalidatePath('/inbox')
  revalidatePath('/projetos')
  return { projeto_id: projetoId, codigo }
}
