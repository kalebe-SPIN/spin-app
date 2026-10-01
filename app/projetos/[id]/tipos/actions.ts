'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TipoItem } from '@/lib/tipos-projeto'

export async function salvarTiposProjetoAction(projetoId: string, tipos: TipoItem[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  if (tipos.length === 0) return { erro: 'Escolha pelo menos 1 tipo' }
  // Kalebe 2026-10-01: venda de equipamentos sozinha vai direto pra tela dela;
  // combinada, soma no total e abre pelo passo "Equipamentos" do item
  const soVenda = tipos.length === 1 && tipos[0] === 'venda_equipamentos'

  const tiposSelecionados = new Set(tipos)

  // Busca ATIVOS (não removidos) pra fazer sync completo
  const { data: existentes } = await supabase
    .from('projeto_itens')
    .select('id, tipo')
    .eq('projeto_id', projetoId)
    .neq('status', 'removido')

  const tiposExistentes = new Set((existentes || []).map((x) => x.tipo as TipoItem))

  // 1. INSERE tipos novos que não existem
  const novos = tipos.filter((t) => !tiposExistentes.has(t))
  if (novos.length > 0) {
    const registros = novos.map((tipo, idx) => ({
      projeto_id: projetoId,
      tipo,
      ordem: idx,
      status: 'pendente' as const,
      dados: {},
      ...(tipo === 'venda_equipamentos' ? { titulo: 'Venda de equipamentos', valor_estimado: 0 } : {}),
    }))
    const { error } = await supabase.from('projeto_itens').insert(registros)
    if (error) return { erro: error.message }
  }

  // 2. MARCA COMO REMOVIDO os que existem mas foram desselecionados
  const paraRemover = (existentes || []).filter((e: any) => !tiposSelecionados.has(e.tipo))
  if (paraRemover.length > 0) {
    const ids = paraRemover.map((e: any) => e.id)
    const { error } = await supabase
      .from('projeto_itens')
      .update({ status: 'removido', updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) return { erro: error.message }
  }

  // tipo_projeto = 'venda_equipamentos' põe a venda na lista /venda-direta,
  // no financeiro e no rótulo de modalidade; saiu da venda → limpa
  const { data: proj } = await supabase.from('projetos').select('tipo_projeto').eq('id', projetoId).maybeSingle()
  const patchTipo = soVenda
    ? { tipo_projeto: 'venda_equipamentos' }
    : (proj?.tipo_projeto === 'venda_equipamentos' ? { tipo_projeto: null } : {})
  await supabase
    .from('projetos')
    .update({ modo_proposta: tipos.length > 1 ? 'combinada' : 'simples', ...patchTipo })
    .eq('id', projetoId)

  revalidatePath(`/projetos/${projetoId}`)
  redirect(soVenda ? `/projetos/${projetoId}/venda-direta` : `/projetos/${projetoId}`)
}

export async function removerItemAction(itemId: string, projetoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { error } = await supabase
    .from('projeto_itens')
    .update({ status: 'removido' })
    .eq('id', itemId)

  if (error) return { erro: error.message }

  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
