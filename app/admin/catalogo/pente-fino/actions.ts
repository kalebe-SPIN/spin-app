'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Pente fino do catálogo — ações de normalização em massa.
 *
 * Kalebe 2026-08-31: 'nós não estamos tendo êxito em buscar e montar
 * o kit com todos os preços e quantidades, e quando clico no cadastro
 * dos itens no catálogo eles estão incompletos nos valores e fabricante
 * entre outros. Vamos fazer um pente fino'.
 */

async function assertAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado', supabase: null, supabaseAdmin: null }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Só admin', supabase: null, supabaseAdmin: null }
  return { erro: null, supabase, supabaseAdmin: createAdminClient() }
}

/** Preenche fabricante='WEG' em TODOS os produtos com fabricante NULL/vazio. */
export async function normalizarFabricanteAction() {
  const g = await assertAdmin(); if (g.erro) return { erro: g.erro }
  const { data, error } = await g.supabaseAdmin!
    .from('produtos')
    .update({ fabricante: 'WEG' })
    .or('fabricante.is.null,fabricante.eq.')
    .select('id')
  if (error) return { erro: error.message }
  revalidatePath('/admin/catalogo/pente-fino')
  return { sucesso: true, atualizados: (data || []).length }
}

/** Normaliza subcategoria vazia → 'sem_categoria' e categoria vazia → 'outro'. */
export async function normalizarCategoriasAction() {
  const g = await assertAdmin(); if (g.erro) return { erro: g.erro }
  const { data: sub, error: e1 } = await g.supabaseAdmin!
    .from('produtos')
    .update({ subcategoria: 'sem_categoria' })
    .or('subcategoria.is.null,subcategoria.eq.')
    .select('id')
  if (e1) return { erro: e1.message }
  const { data: cat, error: e2 } = await g.supabaseAdmin!
    .from('produtos')
    .update({ categoria: 'outro' })
    .or('categoria.is.null,categoria.eq.')
    .select('id')
  if (e2) return { erro: e2.message }
  revalidatePath('/admin/catalogo/pente-fino')
  return { sucesso: true, subcategoria_fix: (sub || []).length, categoria_fix: (cat || []).length }
}

/** Preenche descricao_curta = modelo pra produtos que não têm descrição. */
export async function normalizarDescricaoCurtaAction() {
  const g = await assertAdmin(); if (g.erro) return { erro: g.erro }
  const { data: prods, error } = await g.supabaseAdmin!
    .from('produtos')
    .select('id, modelo, descricao_curta')
    .or('descricao_curta.is.null,descricao_curta.eq.')
    .limit(2000)
  if (error) return { erro: error.message }
  const atualizacoes = (prods || []).filter(p => p.modelo)
  if (atualizacoes.length === 0) return { sucesso: true, atualizados: 0 }
  for (const p of atualizacoes) {
    await g.supabaseAdmin!
      .from('produtos')
      .update({ descricao_curta: p.modelo })
      .eq('id', p.id)
  }
  revalidatePath('/admin/catalogo/pente-fino')
  return { sucesso: true, atualizados: atualizacoes.length }
}

/** Gera codigo_interno_spin aleatório único ('SPIN-XXXXXX') pra quem não tem.
 *  Kalebe 2026-08-31: 'código interno SPIN pode criar aleatório'.
 *  6 caracteres alfanuméricos sem I/O/0/1 (evita ambiguidade visual). */
function gerarCodigoSpin(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `SPIN-${s}`
}

export async function normalizarCodigoInternoAction() {
  const g = await assertAdmin(); if (g.erro) return { erro: g.erro }
  const { data: prods, error } = await g.supabaseAdmin!
    .from('produtos')
    .select('id, codigo_interno_spin')
    .or('codigo_interno_spin.is.null,codigo_interno_spin.eq.')
    .limit(2000)
  if (error) return { erro: error.message }
  const alvos = prods || []
  if (alvos.length === 0) return { sucesso: true, atualizados: 0 }

  // Pra evitar colisão, checa códigos já existentes e reroteia se cair
  // em um duplicado. 32^6 = 1 bilhão de combinações — colisão em 2mil
  // é praticamente 0, mas o retry blindar.
  const { data: existentes } = await g.supabaseAdmin!
    .from('produtos')
    .select('codigo_interno_spin')
    .not('codigo_interno_spin', 'is', null)
  const usados = new Set((existentes || []).map(x => x.codigo_interno_spin).filter(Boolean))

  for (const p of alvos) {
    let novo = gerarCodigoSpin()
    let tentativas = 0
    while (usados.has(novo) && tentativas < 10) {
      novo = gerarCodigoSpin(); tentativas++
    }
    usados.add(novo)
    await g.supabaseAdmin!
      .from('produtos')
      .update({ codigo_interno_spin: novo })
      .eq('id', p.id)
  }
  revalidatePath('/admin/catalogo/pente-fino')
  return { sucesso: true, atualizados: alvos.length }
}

/** Preenche specs = {} pra quem tem NULL. */
export async function normalizarSpecsVaziasAction() {
  const g = await assertAdmin(); if (g.erro) return { erro: g.erro }
  const { data, error } = await g.supabaseAdmin!
    .from('produtos')
    .update({ specs: {} })
    .is('specs', null)
    .select('id')
  if (error) return { erro: error.message }
  revalidatePath('/admin/catalogo/pente-fino')
  return { sucesso: true, atualizados: (data || []).length }
}

/**
 * Roda todas as normalizações em sequência (safe — cada uma é idempotente).
 * Útil pra 'pente fino completo' num clique.
 */
export async function normalizarTudoAction() {
  const r1 = await normalizarFabricanteAction()
  const r2 = await normalizarCategoriasAction()
  const r3 = await normalizarDescricaoCurtaAction()
  const r4 = await normalizarCodigoInternoAction()
  const r5 = await normalizarSpecsVaziasAction()

  const erros = [r1, r2, r3, r4, r5].filter((r: any) => r?.erro).map((r: any) => r.erro)
  if (erros.length > 0) return { erro: erros.join(' · ') }

  return {
    sucesso: true,
    fabricante: (r1 as any).atualizados || 0,
    categoria: ((r2 as any).categoria_fix || 0) + ((r2 as any).subcategoria_fix || 0),
    descricao: (r3 as any).atualizados || 0,
    codigo_interno: (r4 as any).atualizados || 0,
    specs: (r5 as any).atualizados || 0,
  }
}
