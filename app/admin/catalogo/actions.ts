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
  url_imagem?: string              // foto do produto (upload manual no admin)
  url_datasheet?: string           // PDF do datasheet (upload manual no admin)
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


// ============================================================================
// EDITAR PRODUTO — atualiza campos e specs (usa mesmo shape que o parser WEG)
// ============================================================================

export async function editarProdutoAction(
  produtoId: string,
  patch: Partial<Omit<NovoProdutoInput, 'categoria'>> & { categoria?: CategoriaProduto },
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Apenas admin pode editar produtos' }

  // Busca produto atual pra saber a categoria vigente (define quais specs válidas)
  const { data: atual, error: erroAtual } = await supabase
    .from('produtos')
    .select('categoria, specs')
    .eq('id', produtoId)
    .maybeSingle()
  if (erroAtual || !atual) return { erro: 'Produto não encontrado' }

  const categoria = patch.categoria || (atual.categoria as CategoriaProduto)
  const specsAtuais = (atual.specs || {}) as Record<string, unknown>
  const specsNovas: Record<string, unknown> = { ...specsAtuais }

  // Aplica specs por categoria (não sobrescreve o que não veio no patch)
  if (categoria === 'placa') {
    if (patch.potencia_wp != null) specsNovas.potencia_wp = patch.potencia_wp
    if (patch.area_m2 != null) specsNovas.area_m2 = patch.area_m2
    if (patch.largura_mm != null) specsNovas.largura_mm = patch.largura_mm
    if (patch.tipo_celula?.trim()) specsNovas.tipo_celula = patch.tipo_celula.trim()
  } else if (categoria === 'inversor') {
    if (patch.potencia_kw != null) specsNovas.potencia_kw = patch.potencia_kw
    if (patch.tensao_desc?.trim()) specsNovas.tensao_desc = patch.tensao_desc.trim()
    if (patch.disjuntor_equivalente?.trim()) specsNovas.disjuntor_equivalente = patch.disjuntor_equivalente.trim()
    if (patch.entradas_mppt != null) specsNovas.entradas_mppt = patch.entradas_mppt
  } else if (categoria === 'bateria') {
    if (patch.capacidade_kwh != null) specsNovas.capacidade_kwh = patch.capacidade_kwh
    if (patch.potencia_kw != null) specsNovas.potencia_kw = patch.potencia_kw
    if (patch.tensao_desc?.trim()) specsNovas.tensao_desc = patch.tensao_desc.trim()
  } else {
    if (patch.descricao_tecnica?.trim()) specsNovas.descricao = patch.descricao_tecnica.trim()
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), specs: specsNovas }
  if (patch.modelo?.trim()) update.modelo = patch.modelo.trim()
  if (patch.fabricante?.trim()) update.fabricante = patch.fabricante.trim()
  if (patch.categoria) update.categoria = patch.categoria
  if (patch.subcategoria !== undefined) update.subcategoria = patch.subcategoria?.trim() || null
  if (patch.descricao_curta?.trim()) update.descricao_curta = patch.descricao_curta.trim()
  if (patch.descricao_tecnica !== undefined) update.descricao_tecnica = patch.descricao_tecnica?.trim() || null
  if (patch.codigo_weg !== undefined) update.codigo_weg = patch.codigo_weg?.trim() || null
  if (patch.codigo_interno_spin !== undefined) update.codigo_interno_spin = patch.codigo_interno_spin?.trim() || null
  if (patch.ativo !== undefined) update.ativo = patch.ativo
  if (patch.disponivel_estoque !== undefined) update.disponivel_estoque = patch.disponivel_estoque
  if (patch.url_imagem !== undefined) update.url_imagem = patch.url_imagem?.trim() || null
  if (patch.url_datasheet !== undefined) update.url_datasheet = patch.url_datasheet?.trim() || null

  const { error } = await supabase.from('produtos').update(update).eq('id', produtoId)
  if (error) {
    if (error.code === '23505') return { erro: 'Código já cadastrado em outro produto' }
    return { erro: error.message }
  }

  // Preço novo — cria linha nova em precos_produtos (SCD tipo 2: preserva histórico)
  if (patch.preco_venda != null && patch.preco_venda > 0) {
    // Fecha preço vigente
    await supabase.from('precos_produtos')
      .update({ vigente_ate: new Date().toISOString().slice(0, 10) })
      .eq('produto_id', produtoId)
      .is('vigente_ate', null)
    // Cria novo vigente
    await supabase.from('precos_produtos').insert({
      produto_id: produtoId,
      preco_venda: patch.preco_venda,
      preco_custo: patch.preco_custo ?? patch.preco_venda,
      vigente_de: new Date().toISOString().slice(0, 10),
    })
  }

  revalidatePath('/admin/catalogo')
  return { sucesso: true }
}
