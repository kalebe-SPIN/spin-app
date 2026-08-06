'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Toggle produtos.ativo — controla se o produto aparece nos kits/simulador.
 * Um produto inativo continua no catalogo (histórico) mas nao eh sugerido em novas propostas.
 */
export async function togglarAtivoProdutoAction(produtoId: string, novoStatus: boolean) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (perfil?.role !== 'admin') return { erro: 'So admin pode editar catalogo' }

  const { error } = await supabase
    .from('produtos')
    .update({ ativo: novoStatus, updated_at: new Date().toISOString() })
    .eq('id', produtoId)

  if (error) return { erro: error.message }

  revalidatePath('/admin/catalogo')
  return { sucesso: true, ativo: novoStatus }
}

export type CategoriaProduto =
  | 'placa' | 'inversor' | 'bateria' | 'estrutura' | 'cabo_cc' | 'cabo_ca'
  | 'conector' | 'string_box' | 'disjuntor' | 'dps' | 'eletroduto'
  | 'aterramento' | 'quadro' | 'smart_meter' | 'monitoramento'
  | 'mao_de_obra' | 'projeto_engenharia' | 'frete' | 'identificacao' | 'outro'

export type NovoProdutoInput = {
  categoria: CategoriaProduto
  modelo: string
  fabricante: string
  codigo_weg?: string              // SKU WEG (opcional)
  codigo_interno_spin?: string     // código Spin (opcional — auto se ambos vazios)
  subcategoria?: string
  descricao_curta: string
  descricao_tecnica?: string
  potencia_valor?: number          // Wp pra placa, kW pra inversor, kWh pra bateria
  preco_custo?: number             // R$
  preco_venda?: number             // R$
  ativo?: boolean
  disponivel_estoque?: boolean
}

/**
 * Cadastra produto manualmente (não vem da planilha WEG).
 * Útil pra itens fora do catálogo WEG oficial: componentes de outros fabricantes,
 * serviços customizados, materiais avulsos que a Spin usa em propostas.
 */
export async function criarProdutoManualAction(input: NovoProdutoInput): Promise<
  { sucesso: true; produto_id: string } | { erro: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Apenas admin pode cadastrar produtos' }

  const modelo = input.modelo.trim()
  const fabricante = input.fabricante.trim()
  const descricao = input.descricao_curta.trim()
  if (!modelo) return { erro: 'Modelo é obrigatório' }
  if (!fabricante) return { erro: 'Fabricante é obrigatório' }
  if (!descricao) return { erro: 'Descrição curta é obrigatória' }

  const codigoWeg = input.codigo_weg?.trim() || null
  const codigoSpin = input.codigo_interno_spin?.trim()
    || (codigoWeg ? null : `SPIN-${Date.now().toString(36).toUpperCase()}`)

  // Monta specs baseado na categoria (só o campo de potência que o form pergunta)
  const specs: Record<string, unknown> = {}
  if (input.potencia_valor != null && !isNaN(input.potencia_valor)) {
    if (input.categoria === 'placa') specs.potencia_wp = input.potencia_valor
    else if (input.categoria === 'inversor') specs.potencia_kw = input.potencia_valor
    else if (input.categoria === 'bateria') specs.capacidade_kwh = input.potencia_valor
    else specs.potencia = input.potencia_valor
  }

  const { data: criado, error } = await supabase
    .from('produtos')
    .insert({
      codigo_weg: codigoWeg,
      codigo_interno_spin: codigoSpin,
      modelo,
      fabricante,
      categoria: input.categoria,
      subcategoria: input.subcategoria?.trim() || null,
      descricao_curta: descricao,
      descricao_tecnica: input.descricao_tecnica?.trim() || null,
      specs,
      ativo: input.ativo ?? true,
      disponivel_estoque: input.disponivel_estoque ?? true,
    })
    .select('id')
    .single()

  if (error || !criado) {
    if (error?.code === '23505') {
      return { erro: 'Código já cadastrado. Use um SKU/código diferente.' }
    }
    return { erro: `Erro ao criar produto: ${error?.message || 'sem detalhes'}` }
  }

  // Preço vigente (se informado)
  if (input.preco_venda != null && input.preco_venda > 0) {
    await supabase.from('precos_produtos').insert({
      produto_id: criado.id,
      preco_venda: input.preco_venda,
      preco_custo: input.preco_custo ?? input.preco_venda,
      vigente_de: new Date().toISOString().slice(0, 10),
    })
  }

  revalidatePath('/admin/catalogo')
  return { sucesso: true, produto_id: criado.id }
}
