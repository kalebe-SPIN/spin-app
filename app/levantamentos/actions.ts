'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKET_LEVANTAMENTOS, STATUS_EDITAVEIS, erroAmigavel, faltaMigration } from '@/lib/levantamentos/comum'
import { calcularProgresso } from '@/lib/levantamentos/progresso'
import { respostasIniciais } from '@/lib/levantamentos/servidor'
import type { Finalidade, ModeloChecklist, Pendencia, Respostas, StatusLevantamento } from '@/lib/levantamentos/types'

/**
 * Levantamentos de campo (Kalebe 2026-10-26). Tudo pelo cliente do usuário
 * (RLS + gatilho de status valendo); o service role só lê o projeto/OS pro
 * pré-preenchimento, depois de conferir o acesso.
 */

type Erro = { erro: string }
const MUDOU = 'O levantamento mudou de situação ou você não pode mais alterá-lo. Atualize a página.'

async function sessao() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('profiles').select('role, ativo, nome_completo').eq('id', user.id).maybeSingle()
  return { supabase, user, perfil }
}

function revalidar(id?: string, projetoId?: string | null) {
  revalidatePath('/levantamentos')
  if (id) revalidatePath(`/levantamentos/${id}`)
  if (projetoId) revalidatePath(`/projetos/${projetoId}`)
}

function limparRespostas(r: unknown): Respostas {
  const out: Respostas = {}
  if (!r || typeof r !== 'object' || Array.isArray(r)) return out
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
    if (!/^[a-z0-9_]{1,40}$/.test(k)) continue
    if (v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v as string | number | null
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 30) as string[]
  }
  return out
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '')

export async function criarLevantamentoAction(args: {
  finalidade: Finalidade
  projetoId?: string | null
  osId?: string | null
}): Promise<{ id: string } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Faça login de novo.' }
  if (!s.perfil?.ativo || s.perfil.role === 'candidato') return { erro: 'Seu acesso não permite criar levantamentos.' }
  if (!['fv', 'padrao_novo', 'aumento_carga'].includes(args.finalidade)) return { erro: 'Finalidade inválida.' }

  const { data: modelo, error: eModelo } = await s.supabase.from('checklist_modelos')
    .select('id, versao, definicao').eq('codigo', args.finalidade).eq('ativo', true).maybeSingle()
  if (faltaMigration(eModelo)) return { erro: erroAmigavel(eModelo?.message) }
  if (!modelo) return { erro: 'Modelo de checklist não encontrado. Avise o administrador.' }

  const admin = createAdminClient()
  let projetoId = args.projetoId || null
  let os: any = null
  if (args.osId) {
    const { data } = await admin.from('execucoes_servicos')
      .select('id, projeto_id, responsavel_tecnico, cliente_nome, contato_telefone, endereco, endereco_execucao')
      .eq('id', args.osId).maybeSingle()
    if (!data || (s.perfil.role !== 'admin' && data.responsavel_tecnico !== s.user.id)) return { erro: 'Ordem de serviço não encontrada.' }
    os = data
    projetoId = data.projeto_id || null
  }
  if (projetoId) {
    const { data: pode } = await s.supabase.rpc('pode_vincular_projeto', { p_projeto: projetoId })
    if (!pode) return { erro: 'Você não tem acesso a esse projeto para ligar o levantamento.' }
  }

  const definicao = modelo.definicao as ModeloChecklist
  const respostas = await respostasIniciais(admin, {
    modelo: definicao, nomeConsultor: s.perfil.nome_completo || '', projetoId, os,
  })
  const { data: novo, error } = await s.supabase.from('levantamentos').insert({
    finalidade: args.finalidade,
    modelo_id: modelo.id,
    modelo_versao: modelo.versao,
    projeto_id: projetoId,
    consultor_id: s.user.id,
    cliente_nome: texto(respostas.cliente),
    cidade: texto(respostas.cidade),
    respostas,
    progresso: calcularProgresso(definicao, respostas).pct,
  }).select('id').single()
  if (error || !novo) return { erro: erroAmigavel(error?.message) }
  revalidar(novo.id, projetoId)
  return { id: novo.id }
}

export async function salvarLevantamentoAction(
  id: string, respostasBrutas: Respostas, progresso: number,
): Promise<{ salvoEm: string } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Sua sessão expirou. Entre de novo para salvar.' }
  const respostas = limparRespostas(respostasBrutas)
  const { data, error } = await s.supabase.from('levantamentos')
    .update({
      respostas,
      progresso: Math.max(0, Math.min(100, Math.round(Number(progresso) || 0))),
      cliente_nome: texto(respostas.cliente),
      cidade: texto(respostas.cidade),
    })
    .eq('id', id).in('status', STATUS_EDITAVEIS).select('updated_at')
  if (error) return { erro: erroAmigavel(error.message) }
  if (!data?.length) return { erro: MUDOU }
  return { salvoEm: data[0].updated_at }
}

/** Envia (ou reenvia) ao projeto. Itens obrigatórios vazios vão como pendências do app. */
export async function enviarLevantamentoAction(id: string, respostasBrutas: Respostas): Promise<{ ok: true } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Sua sessão expirou. Entre de novo.' }
  const respostas = limparRespostas(respostasBrutas)
  const { data: lev } = await s.supabase.from('levantamentos').select('id, modelo_id, projeto_id, status').eq('id', id).maybeSingle()
  if (!lev) return { erro: 'Levantamento não encontrado.' }
  const [{ data: modelo }, { data: arquivos }] = await Promise.all([
    s.supabase.from('checklist_modelos').select('definicao').eq('id', lev.modelo_id).maybeSingle(),
    s.supabase.from('levantamento_arquivos').select('tipo, slot').eq('levantamento_id', id).is('deleted_at', null),
  ])
  if (!modelo) return { erro: 'Modelo do checklist não encontrado.' }
  const prog = calcularProgresso(modelo.definicao as ModeloChecklist, respostas, arquivos || [])
  const { data, error } = await s.supabase.from('levantamentos')
    .update({
      respostas, progresso: prog.pct, pendencias: prog.faltando, status: 'enviado',
      cliente_nome: texto(respostas.cliente), cidade: texto(respostas.cidade),
    })
    .eq('id', id).in('status', STATUS_EDITAVEIS).select('id')
  if (error) return { erro: erroAmigavel(error.message) }
  if (!data?.length) return { erro: MUDOU }
  revalidar(id, lev.projeto_id)
  return { ok: true }
}

const PASSOS: Record<string, { de: StatusLevantamento[]; para: StatusLevantamento }> = {
  desfazer_envio: { de: ['enviado'], para: 'rascunho' },
  assumir: { de: ['enviado'], para: 'em_projeto' },
  aprovar: { de: ['aguardando_aprovacao'], para: 'aprovado' },
  refazer: { de: ['aguardando_aprovacao'], para: 'em_projeto' },
  cancelar: { de: ['rascunho', 'enviado', 'em_projeto', 'com_pendencia', 'aguardando_aprovacao', 'aprovado'], para: 'cancelado' },
}

export async function mudarStatusLevantamentoAction(
  id: string, passo: keyof typeof PASSOS,
): Promise<{ ok: true } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Sua sessão expirou. Entre de novo.' }
  const p = PASSOS[passo]
  if (!p) return { erro: 'Ação inválida.' }
  const { data, error } = await s.supabase.from('levantamentos')
    .update({ status: p.para }).eq('id', id).in('status', p.de).select('id, projeto_id')
  if (error) return { erro: erroAmigavel(error.message) }
  if (!data?.length) return { erro: MUDOU }
  revalidar(id, data[0].projeto_id)
  return { ok: true }
}

/** Equipe de projeto devolve ao consultor com o que precisa corrigir. */
export async function devolverComPendenciaAction(
  id: string, itens: { campo: string; mensagem: string }[], observacao: string,
): Promise<{ ok: true } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Sua sessão expirou. Entre de novo.' }
  const pendencias: Pendencia[] = (Array.isArray(itens) ? itens : [])
    .map((i) => ({ campo: String(i?.campo || '').slice(0, 60), mensagem: String(i?.mensagem || '').trim().slice(0, 500), origem: 'projetista' as const }))
    .filter((i) => i.mensagem)
  if (!pendencias.length) return { erro: 'Escreva pelo menos uma pendência para o consultor corrigir.' }
  const { data: lev } = await s.supabase.from('levantamentos').select('status, projeto_id').eq('id', id).maybeSingle()
  if (!lev) return { erro: 'Levantamento não encontrado.' }
  if (lev.status === 'enviado') {
    const { error } = await s.supabase.from('levantamentos').update({ status: 'em_projeto' }).eq('id', id).eq('status', 'enviado')
    if (error) return { erro: erroAmigavel(error.message) }
  }
  const { data, error } = await s.supabase.from('levantamentos')
    .update({ status: 'com_pendencia', pendencias, observacao_projetista: observacao.trim().slice(0, 2000) || null })
    .eq('id', id).in('status', ['enviado', 'em_projeto', 'aguardando_aprovacao']).select('id')
  if (error) return { erro: erroAmigavel(error.message) }
  if (!data?.length) return { erro: MUDOU }
  revalidar(id, lev.projeto_id)
  return { ok: true }
}

export async function excluirLevantamentoAction(id: string): Promise<{ ok: true } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Sua sessão expirou. Entre de novo.' }
  const { data: lev } = await s.supabase.from('levantamentos').select('projeto_id').eq('id', id).maybeSingle()
  const { error } = await s.supabase.rpc('excluir_levantamento', { p_id: id })
  if (error) return { erro: erroAmigavel(error.message) }
  revalidar(id, lev?.projeto_id)
  return { ok: true }
}

/** Depois do upload direto pro bucket (navegador), registra o arquivo no slot. */
export async function registrarArquivoLevantamentoAction(levantamentoId: string, arq: {
  slot: string; caminho: string; mime: string; nome: string; tamanho: number
}): Promise<{ id: string; url: string } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Sua sessão expirou. Entre de novo.' }
  if (!/^[a-z0-9_]{1,40}$/.test(arq.slot) || !arq.caminho.startsWith(`${levantamentoId}/fotos/${arq.slot}/`)) {
    return { erro: 'Caminho do arquivo inválido.' }
  }
  const { data, error } = await s.supabase.from('levantamento_arquivos').insert({
    levantamento_id: levantamentoId,
    tipo: arq.mime === 'application/pdf' ? 'documento' : 'foto',
    slot: arq.slot,
    storage_path: arq.caminho,
    nome_original: String(arq.nome || '').slice(0, 200) || null,
    mime: arq.mime,
    tamanho_bytes: Math.max(0, Math.round(Number(arq.tamanho) || 0)),
  }).select('id').single()
  if (error || !data) return { erro: erroAmigavel(error?.message) }
  const { data: link } = await s.supabase.storage.from(BUCKET_LEVANTAMENTOS).createSignedUrl(arq.caminho, 3600)
  return { id: data.id, url: link?.signedUrl || '' }
}

export async function removerArquivoLevantamentoAction(arquivoId: string): Promise<{ ok: true } | Erro> {
  const s = await sessao()
  if (!s) return { erro: 'Sua sessão expirou. Entre de novo.' }
  const { error } = await s.supabase.rpc('remover_arquivo_levantamento', { p_id: arquivoId })
  if (error) return { erro: erroAmigavel(error.message) }
  return { ok: true }
}
