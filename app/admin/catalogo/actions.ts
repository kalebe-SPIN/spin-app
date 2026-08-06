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
  // Campos específicos por categoria (espelham o que o parser da planilha WEG guarda)
  potencia_wp?: number             // placa
  area_m2?: number                 // placa
  largura_mm?: number              // placa
  tipo_celula?: string             // placa (n-TYPE, PERC, n-TYPE BC, bifacial…)
  potencia_kw?: number             // inversor, bomba, bateria
  tensao_desc?: string             // inversor — "Monofásico 220V", "Trifásico 380V"…
  disjuntor_equivalente?: string   // inversor — "MDWP-C50-2"
  entradas_mppt?: number           // inversor
  capacidade_kwh?: number          // bateria
  // Preços
  preco_custo?: number             // R$ — custo real Spin
  preco_venda?: number             // R$ — preço tabela / cliente
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

  // Monta specs por categoria — mesmo shape que o parser da planilha WEG usa,
  // pra ler no simulador/orçamento sem tratar 2 formatos.
  const specs: Record<string, unknown> = {}
  if (input.categoria === 'placa') {
    if (input.potencia_wp != null) specs.potencia_wp = input.potencia_wp
    if (input.area_m2 != null) specs.area_m2 = input.area_m2
    if (input.largura_mm != null) specs.largura_mm = input.largura_mm
    if (input.tipo_celula?.trim()) specs.tipo_celula = input.tipo_celula.trim()
  } else if (input.categoria === 'inversor') {
    if (input.potencia_kw != null) specs.potencia_kw = input.potencia_kw
    if (input.tensao_desc?.trim()) specs.tensao_desc = input.tensao_desc.trim()
    if (input.disjuntor_equivalente?.trim()) specs.disjuntor_equivalente = input.disjuntor_equivalente.trim()
    if (input.entradas_mppt != null) specs.entradas_mppt = input.entradas_mppt
  } else if (input.categoria === 'bateria') {
    if (input.capacidade_kwh != null) specs.capacidade_kwh = input.capacidade_kwh
    if (input.potencia_kw != null) specs.potencia_kw = input.potencia_kw
    if (input.tensao_desc?.trim()) specs.tensao_desc = input.tensao_desc.trim()
  } else {
    // Demais categorias: só a descrição técnica no specs
    if (input.descricao_tecnica?.trim()) specs.descricao = input.descricao_tecnica.trim()
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

/**
 * Cadastra produto a partir do datasheet (specs já extraídas pela IA).
 * - `specs` é gravado inteiro (chaves alinhadas ao que o montador de kit usa).
 * - `preco_tabela_weg` é o preço SEM o fator de desconto WEG → vai em preco_venda
 *   (o fator 0,4182 é aplicado automaticamente no cálculo do kit).
 * - ativo=true e disponivel_estoque=true → o item já aparece na escolha da placa.
 */
const FATOR_WEG = 0.4182

export async function criarProdutoViaDatasheetAction(input: {
  categoria: CategoriaProduto
  modelo: string
  fabricante: string
  codigo_weg?: string
  subcategoria?: string
  descricao_curta: string
  descricao_tecnica?: string
  specs: Record<string, unknown>
  preco_tabela_weg?: number
  url_datasheet?: string
  disponivel_estoque?: boolean
}): Promise<{ sucesso: true; produto_id: string } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Apenas admin pode cadastrar produtos' }

  const modelo = input.modelo.trim()
  const fabricante = input.fabricante.trim()
  const descricao = input.descricao_curta.trim()
  if (!modelo) return { erro: 'Modelo é obrigatório' }
  if (!fabricante) return { erro: 'Fabricante é obrigatório' }
  if (!descricao) return { erro: 'Descrição curta é obrigatória' }

  const codigoWeg = input.codigo_weg?.trim() || null
  const codigoSpin = codigoWeg ? null : `SPIN-${Date.now().toString(36).toUpperCase()}`

  // Limpa specs: descarta null/''/undefined
  const specs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input.specs || {})) {
    if (v !== null && v !== undefined && v !== '') specs[k] = v
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
      ativo: true,
      disponivel_estoque: input.disponivel_estoque ?? true,
      url_datasheet: input.url_datasheet?.trim() || null,
    })
    .select('id')
    .single()

  if (error || !criado) {
    if (error?.code === '23505') return { erro: 'Código já cadastrado. Use um SKU/código diferente.' }
    return { erro: `Erro ao criar produto: ${error?.message || 'sem detalhes'}` }
  }

  // Preço: usuário informa SEMPRE o preço cheio (sem desconto) → preco_venda.
  // preco_custo aplica o fator só se fabricante é WEG (integrador tem 0,4182 de
  // desconto). Outros fabricantes: custo = preço cheio (fornecedor já dá final).
  if (input.preco_tabela_weg != null && input.preco_tabela_weg > 0) {
    const fabUpper = fabricante.toUpperCase()
    const eWeg = fabUpper.startsWith('WEG')
    const custo = eWeg
      ? Math.round(input.preco_tabela_weg * FATOR_WEG * 100) / 100
      : input.preco_tabela_weg
    await supabase.from('precos_produtos').insert({
      produto_id: criado.id,
      preco_venda: input.preco_tabela_weg,
      preco_custo: custo,
      vigente_de: new Date().toISOString().slice(0, 10),
    })
  }

  revalidatePath('/admin/catalogo')
  return { sucesso: true, produto_id: criado.id }
}
