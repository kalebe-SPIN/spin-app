/**
 * Camada de acesso ao catálogo WEG pro Orçamento Rápido.
 * Substitui os defaults hardcoded (555 Wp, kits por faixa) por dados reais
 * do Supabase — respeitando ativo=true AND disponivel_estoque=true.
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Lê faixas de R$/kWp do banco (parametros_precificacao / grupo=fotovoltaico).
 * Retorna null quando não configurado — caller cai no fallback do código.
 */
export async function buscarPrecoKwpPorFaixa(kwp: number): Promise<{ preco_kwp: number; descricao: string } | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('parametros_precificacao')
    .select('valor_json')
    .eq('chave', 'fv_faixas_preco_kwp')
    .is('vigente_ate', null)
    .eq('ativo', true)
    .maybeSingle()

  if (!data?.valor_json) return null
  const faixas = data.valor_json as { min_kwp: number; max_kwp: number; preco_kwp: number | null; descricao: string }[]
  const match = faixas.find(f => kwp >= f.min_kwp && kwp < f.max_kwp)
  if (!match || match.preco_kwp == null) return null
  return { preco_kwp: match.preco_kwp, descricao: match.descricao }
}

/**
 * Lê parâmetro numérico do banco (fallback pra defaults do código quando não configurado).
 */
export async function buscarParametroNumerico(chave: string, fallback: number): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('parametros_precificacao')
    .select('valor_numero')
    .eq('chave', chave)
    .is('vigente_ate', null)
    .eq('ativo', true)
    .maybeSingle()
  return data?.valor_numero ?? fallback
}

export type PlacaCatalogo = {
  id: string
  codigo_weg: string
  modelo: string
  fabricante: string
  potencia_wp: number
  area_m2: number | null
  preco_venda: number | null   // preço tabela WEG (referência)
  preco_custo: number | null   // custo real Spin (WEG × 0,4182)
}

export type InversorCatalogo = {
  id: string
  codigo_weg: string
  modelo: string
  potencia_kw: number
  fases: 'mono' | 'bi' | 'tri' | null    // deduzido do 'tensao_desc'
  tensao_v: 220 | 380 | null
  preco_venda: number | null
  preco_custo: number | null
}

/**
 * Placas fotovoltaicas ativas + disponíveis em estoque, ordenadas por potência crescente.
 * Vazio se catálogo desabastecido (raro — sinaliza upload da planilha WEG).
 */
export async function listarPlacasDisponiveis(): Promise<PlacaCatalogo[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('produtos')
    .select('id, codigo_weg, modelo, fabricante, specs, precos_produtos!inner(preco_venda, preco_custo, vigente_ate)')
    .eq('categoria', 'placa')
    .eq('subcategoria', 'modulo_fotovoltaico')
    .eq('ativo', true)
    .eq('disponivel_estoque', true)
    .is('precos_produtos.vigente_ate', null)

  if (!data) return []

  return data
    .map(p => {
      const specs = (p.specs || {}) as Record<string, unknown>
      const preco = Array.isArray(p.precos_produtos) ? p.precos_produtos[0] : p.precos_produtos
      return {
        id: p.id,
        codigo_weg: p.codigo_weg,
        modelo: p.modelo,
        fabricante: p.fabricante,
        potencia_wp: Number(specs.potencia_wp) || 0,
        area_m2: Number(specs.area_m2) || null,
        preco_venda: preco?.preco_venda ?? null,
        preco_custo: preco?.preco_custo ?? null,
      }
    })
    .filter(p => p.potencia_wp > 0)
    .sort((a, b) => a.potencia_wp - b.potencia_wp)
}

/**
 * Deduz o número de fases pelo texto do tipo do inversor.
 * WEG usa "Inversor Monofásico 220 V" / "Bifásico" / "Trifásico 220 V" / "Trifásico 380 V".
 */
function deducirFases(tipoDesc: string): { fases: 'mono' | 'bi' | 'tri' | null; tensao: 220 | 380 | null } {
  const t = tipoDesc.toLowerCase()
  const trifasico = t.includes('trifás') || t.includes('trifas')
  const bifasico = t.includes('bifás') || t.includes('bifas')
  const monofasico = t.includes('monofás') || t.includes('monofas')
  const tensao380 = t.includes('380')
  const tensao220 = t.includes('220')
  return {
    fases: trifasico ? 'tri' : bifasico ? 'bi' : monofasico ? 'mono' : null,
    tensao: tensao380 ? 380 : tensao220 ? 220 : null,
  }
}

/**
 * Inversores string ativos + disponíveis, opcionalmente filtrados por tipo de rede.
 * Retorna o mais próximo (por cima) da potência kWp solicitada.
 */
export async function escolherInversor(opts: {
  kwp_sistema: number
  fases?: 'mono' | 'bi' | 'tri'
  tensao_v?: 220 | 380
}): Promise<InversorCatalogo | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('produtos')
    .select('id, codigo_weg, modelo, specs, precos_produtos!inner(preco_venda, preco_custo, vigente_ate)')
    .eq('categoria', 'inversor')
    .eq('subcategoria', 'inversor_string')
    .eq('ativo', true)
    .eq('disponivel_estoque', true)
    .is('precos_produtos.vigente_ate', null)

  if (!data) return null

  const inversores: InversorCatalogo[] = data
    .map(p => {
      const specs = (p.specs || {}) as Record<string, unknown>
      const preco = Array.isArray(p.precos_produtos) ? p.precos_produtos[0] : p.precos_produtos
      const { fases, tensao } = deducirFases(String(specs.tensao_desc || ''))
      return {
        id: p.id,
        codigo_weg: p.codigo_weg,
        modelo: p.modelo,
        potencia_kw: Number(specs.potencia_kw) || 0,
        fases,
        tensao_v: tensao,
        preco_venda: preco?.preco_venda ?? null,
        preco_custo: preco?.preco_custo ?? null,
      }
    })
    .filter(i => i.potencia_kw > 0)
    // regra prática: inversor deve suportar 70-120% do kWp (Spin dimensiona com sobrekit)
    .filter(i => i.potencia_kw >= opts.kwp_sistema * 0.7 && i.potencia_kw <= opts.kwp_sistema * 1.5)
    .filter(i => (opts.fases ? i.fases === opts.fases : true))
    .filter(i => (opts.tensao_v ? i.tensao_v === opts.tensao_v : true))
    .sort((a, b) => a.potencia_kw - b.potencia_kw)

  // Escolhe o menor que atende — mais econômico e mais próximo do sizing ideal
  return inversores[0] || null
}

/**
 * Placa padrão a usar quando o usuário não especifica.
 * Estratégia: pega a de MAIOR potência disponível (menos placas = menor MO instalação).
 */
export async function placaPadrao(): Promise<PlacaCatalogo | null> {
  const placas = await listarPlacasDisponiveis()
  if (placas.length === 0) return null
  return placas[placas.length - 1] // maior potência
}

/**
 * Monta o kit sugerido pra determinado kWp — retorna placa + qtd + inversor + custos.
 * TODO Kalebe: essa função hoje NÃO inclui frete, mão de obra, projeto, ART, comissão,
 *   margem nem impostos — só custo bruto WEG dos itens. Falta parametrizar isso.
 */
export async function montarKit(opts: {
  kwp_desejado: number
  placa_id?: string          // se null, usa placaPadrao()
  fases?: 'mono' | 'bi' | 'tri'
  tensao_v?: 220 | 380
}): Promise<{
  placa: PlacaCatalogo | null
  qtd_placas: number
  kwp_real: number
  inversor: InversorCatalogo | null
  custo_bruto_weg: number    // placa + inversor (custo real Spin, sem MO/frete/margem)
  preco_tabela_weg: number   // referência
  aviso_estoque?: string
}> {
  const placas = await listarPlacasDisponiveis()
  const placa = opts.placa_id
    ? placas.find(p => p.id === opts.placa_id) || null
    : (placas[placas.length - 1] || null)

  if (!placa) {
    return {
      placa: null, qtd_placas: 0, kwp_real: 0, inversor: null,
      custo_bruto_weg: 0, preco_tabela_weg: 0,
      aviso_estoque: 'Nenhuma placa disponível no catálogo — verifique upload da planilha WEG e estoque.',
    }
  }

  const qtd_placas = Math.ceil((opts.kwp_desejado * 1000) / placa.potencia_wp)
  const kwp_real = (qtd_placas * placa.potencia_wp) / 1000
  const inversor = await escolherInversor({
    kwp_sistema: kwp_real,
    fases: opts.fases,
    tensao_v: opts.tensao_v,
  })

  const custo_placas = (placa.preco_custo || 0) * qtd_placas
  const custo_inversor = inversor?.preco_custo || 0
  const preco_placas = (placa.preco_venda || 0) * qtd_placas
  const preco_inversor = inversor?.preco_venda || 0

  return {
    placa,
    qtd_placas,
    kwp_real,
    inversor,
    custo_bruto_weg: custo_placas + custo_inversor,
    preco_tabela_weg: preco_placas + preco_inversor,
    aviso_estoque: inversor ? undefined :
      `Nenhum inversor disponível pra ${kwp_real.toFixed(2)} kWp ${opts.fases || ''} ${opts.tensao_v || ''} — considere ajustar tipo de rede ou verificar estoque.`,
  }
}
