'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CampanhaMes = {
  id?: string
  titulo: string
  subtitulo?: string | null
  condicao_especial: string
  placa_id?: string | null
  qtd_placas?: number | null
  inversor_id?: string | null
  qtd_inversores?: number | null
  pv_promocional?: number | null
  vigente_de?: string | null
  vigente_ate?: string | null
  ativa?: boolean
}

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, isAdmin: false }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, isAdmin: perfil?.role === 'admin' }
}

export async function salvarCampanhaAction(
  entrada: CampanhaMes,
): Promise<{ sucesso: true; id: string } | { erro: string }> {
  const { supabase, user, isAdmin } = await requireAdmin()
  if (!user) return { erro: 'Não autenticado' }
  if (!isAdmin) return { erro: 'Só admin pode criar/editar campanhas' }
  if (!entrada.titulo?.trim()) return { erro: 'Título é obrigatório' }
  if (!entrada.condicao_especial?.trim()) return { erro: 'Condição especial é obrigatória (texto do PDF)' }

  const payload: any = {
    titulo: entrada.titulo.trim(),
    subtitulo: entrada.subtitulo?.trim() || null,
    condicao_especial: entrada.condicao_especial.trim(),
    placa_id: entrada.placa_id || null,
    qtd_placas: entrada.qtd_placas || null,
    inversor_id: entrada.inversor_id || null,
    qtd_inversores: entrada.qtd_inversores || null,
    pv_promocional: entrada.pv_promocional || null,
    vigente_de: entrada.vigente_de || new Date().toISOString().slice(0, 10),
    vigente_ate: entrada.vigente_ate || null,
    ativa: entrada.ativa !== false,
  }

  let query
  if (entrada.id) {
    query = supabase.from('campanhas_mes').update(payload).eq('id', entrada.id).select('id').single()
  } else {
    payload.criado_por = user.id
    query = supabase.from('campanhas_mes').insert(payload).select('id').single()
  }
  const { data, error } = await query
  if (error) return { erro: error.message }
  revalidatePath('/admin/campanhas')
  return { sucesso: true, id: data.id }
}

export async function toggleCampanhaAction(id: string, ativa: boolean) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { erro: 'Só admin' }
  const { error } = await supabase.from('campanhas_mes').update({ ativa }).eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/campanhas')
  return { sucesso: true }
}

export async function excluirCampanhaAction(id: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { erro: 'Só admin' }
  const { error } = await supabase.from('campanhas_mes').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/admin/campanhas')
  return { sucesso: true }
}

/**
 * Aplica uma campanha ao projeto: monta kit_selecionado com placa/inversor
 * da campanha, salva pv_promocional em desconto_admin_valor (usado como
 * override do PV) e marca campanha_aplicada_id.
 * Chamado do card do projeto pelo consultor.
 */
export async function aplicarCampanhaAoProjetoAction(
  projetoId: string,
  campanhaId: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  // Carrega campanha
  const { data: campanha, error: e1 } = await supabase
    .from('campanhas_mes').select('*').eq('id', campanhaId).eq('ativa', true).single()
  if (e1 || !campanha) return { erro: 'Campanha não encontrada ou inativa' }

  // Carrega produtos referenciados
  const ids = [campanha.placa_id, campanha.inversor_id].filter(Boolean) as string[]
  const prodMap = new Map<string, any>()
  if (ids.length > 0) {
    const { data: prods } = await supabase
      .from('produtos').select('id, modelo, categoria, specs').in('id', ids)
    for (const p of (prods || [])) prodMap.set(p.id, p)
    // Preço vigente
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('produto_id, preco_venda, vigente_ate')
      .in('produto_id', ids)
      .is('vigente_ate', null)
      .gt('preco_venda', 0)
    for (const p of (precos || [])) {
      const prod = prodMap.get(p.produto_id)
      if (prod) prod.preco_venda = Number(p.preco_venda)
    }
  }

  const placa = campanha.placa_id ? prodMap.get(campanha.placa_id) : null
  const inversor = campanha.inversor_id ? prodMap.get(campanha.inversor_id) : null
  const qtdPlacas = Number(campanha.qtd_placas) || 0
  const qtdInvs = Number(campanha.qtd_inversores) || 1
  const potCcKwp = placa?.specs?.potencia_wp ? (placa.specs.potencia_wp * qtdPlacas) / 1000 : 0
  const potCaKw = inversor?.specs?.potencia_kw ? Number(inversor.specs.potencia_kw) * qtdInvs : 0

  const kitSelecionado = {
    placa: placa ? {
      id: placa.id, modelo: placa.modelo, potencia_wp: placa.specs?.potencia_wp || 0,
      preco_venda: placa.preco_venda || 0,
    } : null,
    inversor: inversor ? {
      id: inversor.id, modelo: inversor.modelo, potencia_kw: inversor.specs?.potencia_kw || 0,
      fases: inversor.specs?.fases, preco_venda: inversor.preco_venda || 0,
    } : null,
    qtd_placas: qtdPlacas,
    qtd_inversores: qtdInvs,
    potencia_cc_kwp: potCcKwp,
    potencia_ca_kw: potCaKw,
    origem: 'campanha_mes',
  }

  // Atualiza projeto — usa pv_promocional como desconto_admin_valor pra forçar
  // o PV final = pv_promocional (o cálculo normal roda por trás, mas o admin
  // desconto tem prioridade na exibição).
  const updates: any = {
    kit_selecionado: kitSelecionado,
    lista_ca_confirmada: [],
    modo_composicao: 'centralizado',
    campanha_aplicada_id: campanha.id,
    campanha_aplicada_em: new Date().toISOString(),
    pv_promocional_forcado: campanha.pv_promocional || null,
  }

  const { error: e2 } = await supabase.from('projetos').update(updates).eq('id', projetoId)
  if (e2) return { erro: e2.message }

  revalidatePath(`/projetos/${projetoId}`)
  revalidatePath(`/projetos/${projetoId}/orcamento`)
  return { sucesso: true }
}

/**
 * Remove a campanha aplicada — volta ao fluxo normal.
 */
export async function removerCampanhaDoProjetoAction(projetoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { error } = await supabase.from('projetos')
    .update({ campanha_aplicada_id: null, campanha_aplicada_em: null, pv_promocional_forcado: null })
    .eq('id', projetoId)
  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
