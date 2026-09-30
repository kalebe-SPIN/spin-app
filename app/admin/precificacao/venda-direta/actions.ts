'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarCodigo } from '@/lib/venda-direta/cupom'
import { PARAMETROS_VENDA_DIRETA } from '@/lib/precificacao/venda-direta'

/**
 * Estrutura de preço da venda de equipamentos + cupons (Kalebe 2026-09-30).
 * Parâmetros versionados pela RPC editar_parametro_precificacao (encerra a
 * vigência antiga, cria a nova e registra o motivo no log). Só admin.
 */

const CHAVES_VENDA_DIRETA = PARAMETROS_VENDA_DIRETA.map((p) => p.chave)

type R<T = {}> = ({ sucesso: true } & T) | { erro: string }

async function admin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ok: false }
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, ok: p?.role === 'admin' }
}

function revalidar() {
  revalidatePath('/admin/precificacao/venda-direta')
  revalidatePath('/admin/precificacao')
}

const vigente = async (supabase: ReturnType<typeof createClient>, chave: string) => {
  const { data } = await supabase.from('parametros_precificacao')
    .select('valor_numero, valor_minimo, valor_maximo, unidade')
    .eq('chave', chave).is('vigente_ate', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function editarParametroVendaDiretaAction(chave: string, valor: number, motivo: string): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin altera a precificação' }
  if (!CHAVES_VENDA_DIRETA.includes(chave)) return { erro: 'Parâmetro fora da venda de equipamentos' }
  if (!Number.isFinite(valor)) return { erro: 'Valor inválido' }
  if (!motivo || motivo.trim().length < 10) return { erro: 'Explique o motivo da mudança (mín. 10 caracteres)' }

  const atual = await vigente(supabase, chave)
  if (!atual) return { erro: 'Parâmetro não encontrado — falta rodar a migration 128 no Supabase.' }
  const min = atual.valor_minimo === null ? null : Number(atual.valor_minimo)
  const max = atual.valor_maximo === null ? null : Number(atual.valor_maximo)
  if (min !== null && valor < min) return { erro: `Valor abaixo do mínimo permitido (${min})` }
  if (max !== null && valor > max) return { erro: `Valor acima do máximo permitido (${max})` }
  if (chave === 'venda_direta_parcelas_cartao' && !Number.isInteger(valor)) return { erro: 'Parcelas tem que ser número inteiro' }

  // Margem + comissão + imposto precisam somar menos de 100% (senão o preço explode)
  if (['venda_direta_margem_perc', 'venda_direta_comissao_perc', 'venda_direta_imposto_perc'].includes(chave)) {
    const outras = ['venda_direta_margem_perc', 'venda_direta_comissao_perc', 'venda_direta_imposto_perc'].filter((c) => c !== chave)
    let soma = valor
    for (const c of outras) soma += Number((await vigente(supabase, c))?.valor_numero) || 0
    if (soma >= 95) return { erro: `Margem + comissão + imposto ficariam em ${soma.toFixed(2).replace('.', ',')}% — precisa ficar abaixo de 95%` }
  }

  const { error } = await supabase.rpc('editar_parametro_precificacao', {
    p_chave: chave, p_valor_numero: valor, p_valor_texto: null, p_valor_json: null, p_motivo: motivo.trim(),
  })
  if (error) return { erro: error.message }
  revalidar()
  return { sucesso: true }
}

export type EntradaCupom = {
  id?: string
  codigo: string
  descricao?: string | null
  tipo: 'percentual' | 'valor'
  valor: number
  valido_de?: string | null
  valido_ate?: string | null
  limite_usos?: number | null
  ativo?: boolean
}

export async function salvarCupomAction(c: EntradaCupom): Promise<R<{ id: string }>> {
  const { supabase, user, ok } = await admin()
  if (!ok || !user) return { erro: 'Só o admin cria cupons' }
  const codigo = normalizarCodigo(c.codigo || '')
  if (codigo.length < 3 || codigo.length > 30) return { erro: 'Código com 3 a 30 letras/números (ex.: SPIN10)' }
  if (!(c.valor > 0)) return { erro: 'Informe o valor do desconto' }
  if (c.tipo === 'percentual' && c.valor >= 100) return { erro: 'Percentual tem que ser menor que 100%' }
  if (c.valido_de && c.valido_ate && c.valido_ate < c.valido_de) return { erro: 'A validade termina antes de começar' }
  if (c.limite_usos !== null && c.limite_usos !== undefined && !(c.limite_usos >= 1)) return { erro: 'Limite de usos tem que ser 1 ou mais (ou vazio = sem limite)' }

  const dados = {
    codigo,
    descricao: c.descricao?.trim() || null,
    tipo: c.tipo,
    valor: Math.round(c.valor * 100) / 100,
    valido_de: c.valido_de || null,
    valido_ate: c.valido_ate || null,
    limite_usos: c.limite_usos || null,
    ...(c.ativo !== undefined ? { ativo: c.ativo } : {}),   // editar não reativa cupom desativado
  }
  const { data, error } = c.id
    ? await supabase.from('cupons_desconto').update(dados).eq('id', c.id).select('id').single()
    : await supabase.from('cupons_desconto').insert({ ...dados, ativo: c.ativo !== false, criado_por: user.id }).select('id').single()
  if (error || !data) {
    if (error?.code === '23505') return { erro: `Já existe um cupom ${codigo}` }
    return { erro: /cupons_desconto/.test(error?.message || '') ? 'Falta rodar a migration 128 no Supabase.' : (error?.message || 'Falha ao salvar') }
  }
  revalidar()
  return { sucesso: true, id: data.id }
}

export async function alternarCupomAction(id: string, ativo: boolean): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe em cupons' }
  const { error } = await supabase.from('cupons_desconto').update({ ativo }).eq('id', id)
  if (error) return { erro: error.message }
  revalidar()
  return { sucesso: true }
}

export async function excluirCupomAction(id: string): Promise<R> {
  const { supabase, ok } = await admin()
  if (!ok) return { erro: 'Só o admin mexe em cupons' }
  const { count } = await supabase.from('cupons_usos').select('projeto_id', { count: 'exact', head: true }).eq('cupom_id', id)
  if ((count || 0) > 0) return { erro: `Cupom já usado em ${count} proposta(s) — desative em vez de excluir` }
  const { error } = await supabase.from('cupons_desconto').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidar()
  return { sucesso: true }
}
