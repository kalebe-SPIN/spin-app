'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { salvarBufferMidiaWa } from '@/lib/whatsapp/midia'
import { revalidatePath } from 'next/cache'
import {
  CATEGORIAS, MATERIAIS_ESTRUTURA, PERFIL_VAZIO, QTD_AGUAS, TIPOS_REDE, TIPOS_TELHADO,
  type ArquivoPerfil, type Pendencia, type PerfilLead, type SecaoDados,
} from '@/lib/spinzap/perfil'

/**
 * Perfil do lead no Spinzap (Kalebe 2026-10-10): sessões de dados com
 * formulário próprio + imagens/arquivos + pendências. Grava em
 * spinzap_perfis / spinzap_arquivos (mig 148) e passa pro projeto do contato
 * o que a proposta usa (e-mail, endereço, padrão de entrada, titular).
 */

const FALTA_MIG = 'Falta rodar a migration 148 (perfil do lead) no Supabase.'
type Admin = ReturnType<typeof createAdminClient>

async function acesso(conversa_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  // RLS: só a conversa que o usuário enxerga (admin, responsável, dono, quem transferiu)
  const { data: conv } = await supabase.from('wa_conversas').select('id').eq('id', conversa_id).maybeSingle()
  if (!conv) return { erro: 'Você não tem acesso a esta conversa' as const }
  const admin = createAdminClient()
  const { data } = await admin.from('wa_conversas')
    .select('id, cidade, uf, contato:contato_id(id, nome_exibicao, cliente_id, projeto_id)')
    .eq('id', conversa_id).maybeSingle()
  const contato = (data as any)?.contato as { id: string; nome_exibicao: string | null; cliente_id: string | null; projeto_id: string | null } | null
  if (!contato) return { erro: 'Conversa sem contato' as const }
  return { user, admin, contato, conv: data as any as { id: string; cidade: string | null; uf: string | null } }
}

const limpaTexto = (v: unknown, max = 200) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}
const numero = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const booleano = (v: unknown) => (v === true || v === 'sim' ? true : v === false || v === 'nao' ? false : null)
const daLista = (lista: { valor: string }[], v: unknown) => (lista.some((o) => o.valor === v) ? String(v) : null)

/** Só os campos conhecidos de cada sessão, já normalizados. */
function normalizar(secao: SecaoDados, d: any): Record<string, any> {
  if (secao === 'contato') {
    const e = d?.endereco || {}
    const endereco = {
      cep: limpaTexto(e.cep, 9), rua: limpaTexto(e.rua), numero: limpaTexto(e.numero, 20), complemento: limpaTexto(e.complemento),
      bairro: limpaTexto(e.bairro), cidade: limpaTexto(e.cidade, 80), uf: limpaTexto(e.uf, 2)?.toUpperCase() || null,
    }
    const email = limpaTexto(d?.email, 160)?.toLowerCase() || null
    return {
      primeiro_nome: limpaTexto(d?.primeiro_nome, 60),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      endereco: Object.values(endereco).some(Boolean) ? endereco : null,
    }
  }
  if (secao === 'infra_civil') {
    const aguas = numero(d?.aguas)
    return {
      laje: booleano(d?.laje),
      tipo_telhado: daLista(TIPOS_TELHADO, d?.tipo_telhado),
      aguas: aguas && QTD_AGUAS.some((o) => Number(o.valor) === aguas) ? aguas : null,
      material_estrutura: daLista(MATERIAIS_ESTRUTURA, d?.material_estrutura),
      area_m2: numero(d?.area_m2),
      area_faixa: limpaTexto(d?.area_faixa, 40),
    }
  }
  if (secao === 'infra_eletrica') {
    const disj = numero(d?.disjuntor_a)
    return { tipo_rede: daLista(TIPOS_REDE, d?.tipo_rede), disjuntor_a: disj && disj > 0 && disj <= 2000 ? disj : null }
  }
  return {
    titular_fatura: booleano(d?.titular_fatura),
    titular_nome: limpaTexto(d?.titular_nome, 160),
    sombreamento: booleano(d?.sombreamento),
    sombreamento_descricao: limpaTexto(d?.sombreamento_descricao, 300),
  }
}

/** O que o projeto já sabe vira ponto de partida do perfil (sem gravar). */
async function dadosDoProjeto(admin: Admin, projetoId: string | null) {
  if (!projetoId) return null
  const { data } = await admin.from('projetos')
    .select('cliente_email, endereco_instalacao, cliente_endereco, padrao_entrada, titular_igual_cliente')
    .eq('id', projetoId).maybeSingle()
  return data as any
}

export async function carregarPerfilAction(conversa_id: string): Promise<{
  perfil: PerfilLead
  arquivos: ArquivoPerfil[]
  midias: Array<{ id: string; tipo: string; texto: string | null; url: string; mime: string | null; direcao: string; criada_em: string }>
  propostas: Array<{ id: string; url: string; criada_em: string; pv_total: number | null; potencia_cc_kwp: number | null }>
  sem_migracao: boolean
} | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { admin, contato, conv } = a

  const [{ data: linha, error: ePerfil }, { data: arqs }, projeto, { data: convsDoContato }] = await Promise.all([
    admin.from('spinzap_perfis').select('*').eq('contato_id', contato.id).maybeSingle(),
    admin.from('spinzap_arquivos').select('id, categoria, url, nome, mime, origem, criado_em').eq('contato_id', contato.id).order('criado_em', { ascending: false }),
    dadosDoProjeto(admin, contato.projeto_id),
    admin.from('wa_conversas').select('id').eq('contato_id', contato.id),
  ])

  const p: PerfilLead = linha
    ? {
        contato: (linha as any).contato || {}, infra_civil: (linha as any).infra_civil || {},
        infra_eletrica: (linha as any).infra_eletrica || {}, peculiaridades: (linha as any).peculiaridades || {},
        pendencias: (linha as any).pendencias || [],
      }
    : structuredClone(PERFIL_VAZIO)
  // Ponto de partida: nome do WhatsApp, etiqueta de cidade e o que o projeto já tem
  const end = projeto?.endereco_instalacao || projeto?.cliente_endereco || null
  p.contato.primeiro_nome ??= (contato.nome_exibicao || '').trim().split(/\s+/)[0] || null
  p.contato.email ??= projeto?.cliente_email || null
  p.contato.endereco ??= end || (conv.cidade ? { cidade: conv.cidade, uf: conv.uf || undefined } : null)
  p.infra_eletrica.tipo_rede ??= projeto?.padrao_entrada?.tipo_ligacao || null
  p.infra_eletrica.disjuntor_a ??= projeto?.padrao_entrada?.amperagem_disjuntor_geral_a || null
  if (p.peculiaridades.titular_fatura == null && projeto && typeof projeto.titular_igual_cliente === 'boolean') {
    p.peculiaridades.titular_fatura = projeto.titular_igual_cliente
  }

  // Banco de arquivos da interação: tudo que passou pela(s) conversa(s) do contato
  const ids = ((convsDoContato || []) as Array<{ id: string }>).map((c) => c.id)
  const { data: msgs } = ids.length
    ? await admin.from('wa_mensagens').select('id, tipo, texto, midia_url, midia_mime, direcao, criada_em')
        .in('conversa_id', ids).not('midia_url', 'is', null).order('criada_em', { ascending: false }).limit(80)
    : { data: [] as any[] }

  // Orçamentos gerados nos projetos do contato/cliente
  let projetoIds: string[] = contato.projeto_id ? [contato.projeto_id] : []
  if (contato.cliente_id) {
    const { data: doCliente } = await admin.from('projetos').select('id').eq('cliente_id', contato.cliente_id)
    projetoIds = Array.from(new Set([...projetoIds, ...((doCliente || []) as any[]).map((x) => x.id as string)]))
  }
  const { data: props } = projetoIds.length
    ? await admin.from('projeto_propostas_historico').select('id, url_pdf, gerado_em, pv_total, potencia_cc_kwp')
        .in('projeto_id', projetoIds).order('gerado_em', { ascending: false }).limit(20)
    : { data: [] as any[] }

  return {
    perfil: p,
    arquivos: (arqs || []) as ArquivoPerfil[],
    midias: ((msgs || []) as any[]).map((m) => ({
      id: m.id, tipo: m.tipo, texto: m.texto, url: m.midia_url, mime: m.midia_mime, direcao: m.direcao, criada_em: m.criada_em,
    })),
    propostas: ((props || []) as any[]).map((x) => ({
      id: x.id, url: x.url_pdf, criada_em: x.gerado_em, pv_total: x.pv_total ?? null, potencia_cc_kwp: x.potencia_cc_kwp ?? null,
    })),
    sem_migracao: !!ePerfil,
  }
}

export async function salvarSecaoPerfilAction(conversa_id: string, secao: SecaoDados, dados: any): Promise<{ sucesso: true } | { erro: string }> {
  if (!['contato', 'infra_civil', 'infra_eletrica', 'peculiaridades'].includes(secao)) return { erro: 'Sessão inválida' }
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { admin, contato, user } = a
  const valor = normalizar(secao, dados)
  if (secao === 'contato' && dados?.email && !valor.email) return { erro: 'E-mail inválido' }

  const { error } = await admin.from('spinzap_perfis').upsert({
    contato_id: contato.id, [secao]: valor, atualizado_em: new Date().toISOString(), atualizado_por: user.id,
  }, { onConflict: 'contato_id' })
  if (error) return { erro: /spinzap_perfis/.test(error.message) ? FALTA_MIG : error.message }

  await sincronizarComProjeto(admin, contato, conversa_id, secao, valor)
  revalidatePath('/spinzap')
  return { sucesso: true }
}

/** Passa pro projeto (e pra etiqueta de cidade) o que a proposta usa. Falha aqui não perde o perfil. */
async function sincronizarComProjeto(admin: Admin, contato: { projeto_id: string | null }, conversa_id: string, secao: SecaoDados, v: Record<string, any>) {
  try {
    if (secao === 'contato' && v.endereco?.cidade) {
      await admin.from('wa_conversas').update({ cidade: v.endereco.cidade, ...(v.endereco.uf ? { uf: v.endereco.uf } : {}) }).eq('id', conversa_id)
    }
    if (!contato.projeto_id) return
    if (secao === 'contato') {
      const patch: Record<string, any> = {}
      if (v.email) patch.cliente_email = v.email
      if (v.endereco) patch.endereco_instalacao = v.endereco
      if (Object.keys(patch).length) await admin.from('projetos').update(patch).eq('id', contato.projeto_id)
    }
    if (secao === 'infra_eletrica') {
      const { data: p } = await admin.from('projetos').select('padrao_entrada').eq('id', contato.projeto_id).maybeSingle()
      const padrao = { ...((p as any)?.padrao_entrada || {}) }
      if (v.tipo_rede) padrao.tipo_ligacao = v.tipo_rede
      if (v.disjuntor_a) padrao.amperagem_disjuntor_geral_a = v.disjuntor_a
      await admin.from('projetos').update({ padrao_entrada: padrao }).eq('id', contato.projeto_id)
    }
    if (secao === 'peculiaridades' && typeof v.titular_fatura === 'boolean') {
      await admin.from('projetos').update({ titular_igual_cliente: v.titular_fatura }).eq('id', contato.projeto_id)
    }
  } catch (e) {
    console.error('[spinzap/perfil] sincronizar projeto', e)
  }
}

/** Imagem/arquivo que já veio na conversa → vai pra sessão certa do perfil. */
export async function vincularMidiaPerfilAction(conversa_id: string, wa_mensagem_id: string, categoria: string): Promise<{ sucesso: true } | { erro: string }> {
  if (!CATEGORIAS.some((c) => c.valor === categoria)) return { erro: 'Categoria inválida' }
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { admin, contato, user } = a
  const { data: m } = await admin.from('wa_mensagens').select('id, conversa_id, texto, midia_url, midia_mime, direcao').eq('id', wa_mensagem_id).maybeSingle()
  if (!m?.midia_url) return { erro: 'Mensagem sem arquivo' }
  const { data: dona } = await admin.from('wa_conversas').select('contato_id').eq('id', m.conversa_id).maybeSingle()
  if (dona?.contato_id !== contato.id) return { erro: 'Arquivo de outro contato' }
  const { error } = await admin.from('spinzap_arquivos').insert({
    contato_id: contato.id, categoria, url: m.midia_url, nome: m.texto || null, mime: m.midia_mime || null,
    origem: m.direcao === 'inbound' ? 'cliente' : 'equipe', wa_mensagem_id: m.id, projeto_id: contato.projeto_id, criado_por: user.id,
  })
  if (error) return { erro: /spinzap_arquivos/.test(error.message) ? FALTA_MIG : error.message }
  revalidatePath('/spinzap')
  return { sucesso: true }
}

/** Upload direto pro perfil (foto tirada na visita, documento recebido por fora). */
export async function enviarArquivoPerfilAction(formData: FormData): Promise<{ sucesso: true } | { erro: string }> {
  const conversa_id = String(formData.get('conversa_id') || '')
  const categoria = String(formData.get('categoria') || '')
  const arquivo = formData.get('arquivo') as File | null
  if (!conversa_id || !arquivo) return { erro: 'Faltou o arquivo' }
  if (!CATEGORIAS.some((c) => c.valor === categoria)) return { erro: 'Categoria inválida' }
  if (arquivo.size > 20 * 1024 * 1024) return { erro: 'Arquivo acima de 20 MB' }
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { admin, contato, user } = a
  const salvo = await salvarBufferMidiaWa({
    buffer: Buffer.from(await arquivo.arrayBuffer()),
    mime: arquivo.type || 'application/octet-stream',
    chave: `perfil-${contato.id}-${Date.now()}`,
    nome_original: arquivo.name,
  })
  if (!salvo) return { erro: 'Falha ao guardar o arquivo' }
  const { error } = await admin.from('spinzap_arquivos').insert({
    contato_id: contato.id, categoria, url: salvo.midia_url, nome: arquivo.name, mime: salvo.midia_mime,
    origem: 'equipe', projeto_id: contato.projeto_id, criado_por: user.id,
  })
  if (error) return { erro: /spinzap_arquivos/.test(error.message) ? FALTA_MIG : error.message }
  revalidatePath('/spinzap')
  return { sucesso: true }
}

export async function removerArquivoPerfilAction(conversa_id: string, arquivo_id: string): Promise<{ sucesso: true } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  // Só tira do perfil; o arquivo continua na conversa/Storage
  const { error } = await a.admin.from('spinzap_arquivos').delete().eq('id', arquivo_id).eq('contato_id', a.contato.id)
  if (error) return { erro: error.message }
  revalidatePath('/spinzap')
  return { sucesso: true }
}

/** Pendência do perfil (a Laís cria; a equipe resolve). */
export async function resolverPendenciaAction(conversa_id: string, pendencia_id: string): Promise<{ sucesso: true } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { data: linha } = await a.admin.from('spinzap_perfis').select('pendencias').eq('contato_id', a.contato.id).maybeSingle()
  const lista = (((linha as any)?.pendencias || []) as Pendencia[])
    .map((p) => (p.id === pendencia_id ? { ...p, resolvida_em: new Date().toISOString() } : p))
  const { error } = await a.admin.from('spinzap_perfis').update({ pendencias: lista }).eq('contato_id', a.contato.id)
  if (error) return { erro: error.message }
  revalidatePath('/spinzap')
  return { sucesso: true }
}
