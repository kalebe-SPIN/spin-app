'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { carregarFaixasSecoes, carregarVariaveisPreco } from '@/lib/propostas/secoes-servidor'
import type { FaixaSecao, ModoVariavel, VariavelPreco } from '@/lib/propostas/secoes'
import { CONTEXTOS_PAINEL, type ContextoPainel } from '@/lib/precificacao/painel'

/**
 * Painel de precificação dentro das propostas (Kalebe 2026-10-14): o admin
 * edita a precificação de cada item sem sair da proposta — mesmas tabelas
 * das telas /admin/precificacao (muda em todo o sistema):
 *   - parâmetros dos motores (parametros_precificacao, com histórico/motivo
 *     pela RPC editar_parametro_precificacao)
 *   - parâmetros dos serviços O&M (parametros_precificacao_servicos)
 *   - variáveis dinâmicas de cada item + faixas (mig 156): adicionar,
 *     editar e excluir rótulo, unidade, modo de cobrança e faixas de valor
 */

async function exigirAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (p?.role !== 'admin') return { erro: 'Só o admin edita a precificação' as const }
  return { user, admin: createAdminClient() }
}

/** Variáveis + faixas das seções (todos os usuários leem — monta o formulário). */
export async function variaveisSecoesAction(): Promise<{ variaveis: VariavelPreco[]; faixas: FaixaSecao[] } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const admin = createAdminClient()
  const [variaveis, faixas] = await Promise.all([carregarVariaveisPreco(admin), carregarFaixasSecoes(admin)])
  return { variaveis, faixas }
}

export type ParametroPainel = { chave: string; rotulo: string; descricao: string | null; unidade: string | null; valor: number | null; existe: boolean }
export type ServicoPainel = { chave: string; nome: string; parametros: Record<string, any> }
export type ItemPainel = { chave_servico: string; rotulo: string; variaveis: Array<VariavelPreco & { faixas: FaixaSecao[] }>; faixas_soltas: FaixaSecao[] }

export async function painelPrecificacaoAction(contexto: ContextoPainel): Promise<{
  parametros: ParametroPainel[]; servicos: ServicoPainel[]; itens: ItemPainel[]; sem_migracao: boolean
} | { erro: string }> {
  const a = await exigirAdmin()
  if ('erro' in a) return { erro: a.erro as string }
  const ctx = CONTEXTOS_PAINEL[contexto]
  if (!ctx) return { erro: 'Contexto inválido' }
  const chavesItens = ctx.itens.map((i) => i.chave)
  const [{ data: ps }, { data: sv }, { data: fs }, vr] = await Promise.all([
    a.admin.from('parametros_precificacao').select('chave, descricao, valor_numero, unidade').in('chave', ctx.parametros.map((p) => p.chave)).is('vigente_ate', null).eq('ativo', true),
    ctx.servicos.length ? a.admin.from('parametros_precificacao_servicos').select('chave, nome, parametros').in('chave', ctx.servicos) : Promise.resolve({ data: [] as any[] }),
    a.admin.from('faixas_precificacao_servicos').select('*').in('chave_servico', chavesItens).eq('ativo', true).order('ordem'),
    a.admin.from('precificacao_variaveis').select('id, chave_servico, chave, rotulo, unidade, modo, ordem').in('chave_servico', chavesItens).eq('ativo', true),
  ])
  const parametros: ParametroPainel[] = ctx.parametros.map((p) => {
    const linha = ((ps || []) as any[]).find((x) => x.chave === p.chave)
    return { chave: p.chave, rotulo: p.rotulo, descricao: linha?.descricao || null, unidade: linha?.unidade || p.unidade || null, valor: linha ? Number(linha.valor_numero) : null, existe: !!linha }
  })
  const faixas: FaixaSecao[] = ((fs || []) as any[]).map((f) => ({
    id: f.id, chave_servico: f.chave_servico, variavel: f.variavel ?? null, faixa_min: Number(f.faixa_min) || 0,
    faixa_max: f.faixa_max == null ? null : Number(f.faixa_max), valor: Number(f.valor) || 0, descricao: f.descricao || null, ordem: Number(f.ordem) || 0,
  }))
  const variaveis = (vr.error ? [] : (vr.data || [])) as VariavelPreco[]
  const itens: ItemPainel[] = ctx.itens.map((i) => {
    const vs = variaveis.filter((v) => v.chave_servico === i.chave).sort((x, y) => (x.ordem || 0) - (y.ordem || 0))
    const doItem = faixas.filter((f) => f.chave_servico === i.chave)
    return {
      chave_servico: i.chave, rotulo: i.rotulo,
      variaveis: vs.map((v, n) => ({ ...v, faixas: doItem.filter((f) => f.variavel === v.chave || (n === 0 && !f.variavel)) })),
      faixas_soltas: vs.length ? [] : doItem,
    }
  })
  return { parametros, servicos: ((sv || []) as any[]).map((s) => ({ chave: s.chave, nome: s.nome || s.chave, parametros: s.parametros || {} })), itens, sem_migracao: !!vr.error }
}

/** Parâmetro de motor: histórico + motivo pela RPC; se ainda não existe no banco, cria. */
export async function salvarParametroPainelAction(chave: string, valor: number, motivo: string, novo?: { grupo: string; descricao: string; unidade: string }): Promise<{ sucesso: true } | { erro: string }> {
  const a = await exigirAdmin()
  if ('erro' in a) return { erro: a.erro as string }
  if (!Number.isFinite(valor)) return { erro: 'Valor inválido' }
  if (!motivo || motivo.trim().length < 10) return { erro: 'Escreva o motivo da alteração (mín. 10 caracteres)' }
  const { data: ja } = await a.admin.from('parametros_precificacao').select('id').eq('chave', chave).is('vigente_ate', null).limit(1).maybeSingle()
  if (!ja) {
    if (!novo) return { erro: 'Parâmetro não existe' }
    const { error } = await a.admin.from('parametros_precificacao').insert({
      grupo: novo.grupo, chave, descricao: novo.descricao, valor_numero: valor, unidade: novo.unidade, requer_aprovacao_kalebe: false,
      alterado_por: a.user.id, motivo_alteracao: motivo.trim(),
    })
    if (error) return { erro: error.message }
  } else {
    // Mesma RPC das telas do admin (encerra a vigência anterior e registra o motivo)
    const supabase = createClient()
    const { error } = await supabase.rpc('editar_parametro_precificacao', {
      p_chave: chave, p_motivo: motivo.trim(), p_valor_numero: valor, p_valor_texto: null, p_valor_json: null,
    })
    if (error) return { erro: error.message }
  }
  revalidatePath('/admin/precificacao')
  return { sucesso: true }
}

/** Campo de um serviço O&M (parametros_precificacao_servicos.parametros, caminho até o número). */
export async function salvarCampoServicoPainelAction(chave: string, caminho: string[], valor: number): Promise<{ sucesso: true } | { erro: string }> {
  const a = await exigirAdmin()
  if ('erro' in a) return { erro: a.erro as string }
  if (!Number.isFinite(valor) || !caminho.length) return { erro: 'Valor inválido' }
  const { data } = await a.admin.from('parametros_precificacao_servicos').select('parametros').eq('chave', chave).maybeSingle()
  if (!data) return { erro: 'Serviço não encontrado' }
  const p = structuredClone(((data as any).parametros || {}) as Record<string, any>)
  let alvo = p
  for (const k of caminho.slice(0, -1)) { alvo[k] = alvo[k] && typeof alvo[k] === 'object' ? alvo[k] : {}; alvo = alvo[k] }
  alvo[caminho[caminho.length - 1]] = valor
  const { error } = await a.admin.from('parametros_precificacao_servicos').update({ parametros: p, atualizado_por: a.user.id, updated_at: new Date().toISOString() }).eq('chave', chave)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/servicos')
  return { sucesso: true }
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'variavel'
const MODOS: ModoVariavel[] = ['por_unidade', 'faixa_total', 'por_item', 'fixo']

export async function salvarVariavelAction(v: { id?: string; chave_servico: string; rotulo: string; unidade: string; modo: ModoVariavel; ordem: number }): Promise<{ id: string; chave: string } | { erro: string }> {
  const a = await exigirAdmin()
  if ('erro' in a) return { erro: a.erro as string }
  const rotulo = String(v.rotulo || '').trim()
  if (!rotulo) return { erro: 'Dê um nome à variável' }
  if (!MODOS.includes(v.modo)) return { erro: 'Modo inválido' }
  const dados = { rotulo, unidade: String(v.unidade || '').trim(), modo: v.modo, ordem: Math.round(Number(v.ordem) || 0), atualizado_em: new Date().toISOString() }
  if (v.id) {
    const { data, error } = await a.admin.from('precificacao_variaveis').update(dados).eq('id', v.id).select('id, chave').single()
    if (error || !data) return { erro: error?.message || 'Não salvou' }
    return { id: (data as any).id, chave: (data as any).chave }
  }
  let chave = slug(rotulo)
  const { data: ja } = await a.admin.from('precificacao_variaveis').select('chave').eq('chave_servico', v.chave_servico)
  const usadas = new Set(((ja || []) as any[]).map((x) => x.chave))
  for (let n = 2; usadas.has(chave); n++) chave = `${slug(rotulo)}_${n}`
  const { data, error } = await a.admin.from('precificacao_variaveis').insert({ ...dados, chave_servico: v.chave_servico, chave }).select('id, chave').single()
  if (error || !data) return { erro: /precificacao_variaveis/.test(error?.message || '') ? 'Falta rodar a migration 156 no Supabase.' : error?.message || 'Não salvou' }
  return { id: (data as any).id, chave: (data as any).chave }
}

/** Exclui a variável e as faixas dela. */
export async function excluirVariavelAction(id: string): Promise<{ sucesso: true } | { erro: string }> {
  const a = await exigirAdmin()
  if ('erro' in a) return { erro: a.erro as string }
  const { data: v } = await a.admin.from('precificacao_variaveis').select('chave_servico, chave').eq('id', id).maybeSingle()
  if (!v) return { erro: 'Variável não encontrada' }
  await a.admin.from('faixas_precificacao_servicos').delete().eq('chave_servico', (v as any).chave_servico).eq('variavel', (v as any).chave)
  const { error } = await a.admin.from('precificacao_variaveis').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/faixas')
  return { sucesso: true }
}

export async function salvarFaixaPainelAction(f: {
  id?: string; chave_servico: string; variavel: string | null; unidade: string
  faixa_min: number; faixa_max: number | null; valor: number; descricao: string | null; ordem: number
}): Promise<{ id: string } | { erro: string }> {
  const a = await exigirAdmin()
  if ('erro' in a) return { erro: a.erro as string }
  if (!Number.isFinite(Number(f.valor))) return { erro: 'Valor inválido' }
  if (f.faixa_max != null && Number(f.faixa_max) < Number(f.faixa_min)) return { erro: 'O fim da faixa é menor que o início' }
  const dados = {
    chave_servico: f.chave_servico, variavel: f.variavel, unidade: String(f.unidade || 'unidade').trim() || 'unidade',
    faixa_min: Number(f.faixa_min) || 0, faixa_max: f.faixa_max == null || String(f.faixa_max) === '' ? null : Number(f.faixa_max),
    valor: Number(f.valor), descricao: String(f.descricao || '').trim() || null, ordem: Math.round(Number(f.ordem) || 0),
  }
  const r = f.id
    ? await a.admin.from('faixas_precificacao_servicos').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', f.id).select('id').single()
    : await a.admin.from('faixas_precificacao_servicos').insert({ ...dados, ativo: true }).select('id').single()
  if (r.error || !r.data) {
    if (/unidade_check/.test(r.error?.message || '')) return { erro: 'Unidade fora da lista antiga — rode a migration 156 pra liberar unidades livres.' }
    return { erro: r.error?.message || 'Não salvou' }
  }
  revalidatePath('/admin/precificacao/faixas')
  return { id: (r.data as any).id }
}

export async function excluirFaixaPainelAction(id: string): Promise<{ sucesso: true } | { erro: string }> {
  const a = await exigirAdmin()
  if ('erro' in a) return { erro: a.erro as string }
  const { error } = await a.admin.from('faixas_precificacao_servicos').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/faixas')
  return { sucesso: true }
}
