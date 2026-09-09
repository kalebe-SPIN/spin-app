'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calcularProposta, paramsToRecord } from '@/lib/precificacao/calcular'
import { calcularPropostaV2, type OrigemLead, type MargemAlvoRow, type AliquotaSimplesRow, type MultiplicadorRow, inferirLinha } from '@/lib/precificacao/calcular-v2'

async function guardaAdmin(): Promise<{ supabase: ReturnType<typeof createClient>; erro: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { supabase, erro: 'Só admin' }
  return { supabase, erro: null }
}

/**
 * Alterna a flag `precificacao_v2` (0 = v1 legado, 1 = v2 novo motor).
 * Escreve em `parametros_precificacao` com valor_numero. Efetivo em tempo real:
 * a próxima chamada de /orcamento já roda o motor selecionado.
 */
export async function toggleMotorV2Action(ativar: boolean): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: ativar ? 1 : 0 })
    .eq('chave', 'precificacao_v2')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}

/**
 * Alterna comissao_modo entre variável real (0) e referência fixa 7% (1).
 */
export async function toggleComissaoModoAction(fixa7: boolean): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: fixa7 ? 1 : 0 })
    .eq('chave', 'comissao_modo')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}

export async function atualizarRbt12Action(valor: number): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  if (!isFinite(valor) || valor < 0) return { erro: 'RBT12 inválido' }
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: valor })
    .eq('chave', 'rbt12_atual')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}

export async function atualizarAnexoAction(anexo: 'III' | 'V'): Promise<{ sucesso: true } | { erro: string }> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  const num = anexo === 'V' ? 5 : 3
  const { error } = await g.supabase
    .from('parametros_precificacao')
    .update({ valor_numero: num })
    .eq('chave', 'simples_anexo_atual')
  if (error) return { erro: error.message }
  revalidatePath('/admin/precificacao/motor-v2')
  return { sucesso: true }
}

/**
 * Simulador v1 × v2 — Kalebe 2026-09-08.
 *
 * Roda os dois motores com os mesmos inputs e devolve os dois resultados
 * lado a lado. Usado no painel /admin/precificacao/motor-v2 pra validar
 * o impacto ANTES de ligar a flag em produção.
 *
 * Não persiste nada — é só simulação.
 */
export type EntradasSim = {
  potencia_kwp: number
  potencia_wp: number
  kit_bruto_weg: number          // preço tabela WEG do kit (placas + inversor)
  lista_ca: number
  distancia_km_extra: number
  origem_lead: OrigemLead
  volume_mensal_consultor: number
  plano_om_anexado: boolean
  multiplicadores_ativos: string[]
}

export type ResultadoSim = {
  v1: {
    pv_total: number
    margem: number
    comissao_vendedor: number
    impostos_simples: number
    kit_com_fator: number
    reais_por_wp: number
  }
  v2: {
    pv_total: number
    margem_spin: number
    comissao_valor: number
    imposto_valor: number
    fatia_spin: number
    reais_por_wp: number
    piso_aplicado: boolean
    aliquota_nominal: number
    aliquota_efetiva: number
    comissao_efetiva: number
    alertas: string[]
  }
  delta_pv_pct: number             // (v2 - v1) / v1 em %
  contexto: {
    linha: string
    anexo: 'III' | 'V'
    rbt12: number
  }
}

export async function simularComparacaoAction(entrada: EntradasSim): Promise<
  { sucesso: true; resultado: ResultadoSim } | { erro: string }
> {
  const g = await guardaAdmin()
  if (g.erro) return { erro: g.erro }
  const supabase = g.supabase

  const [paramsRes, margensRes, aliqRes, multRes] = await Promise.all([
    supabase.from('parametros_precificacao')
      .select('chave, valor_numero, valor_json, unidade').eq('ativo', true).is('vigente_ate', null),
    supabase.from('margens_alvo').select('*').eq('ativo', true).is('vigente_ate', null),
    supabase.from('aliquotas_simples').select('*').eq('ativo', true),
    supabase.from('multiplicadores_complexidade').select('*').eq('ativo', true),
  ])

  const params = paramsToRecord(paramsRes.data || [])
  const rbt12 = Number(params['rbt12_atual']?.valor_numero) || 0
  const anexoNum = Number(params['simples_anexo_atual']?.valor_numero) || 3
  const anexo: 'III' | 'V' = anexoNum === 5 ? 'V' : 'III'
  const comissaoModoNum = Number(params['comissao_modo']?.valor_numero) || 0
  const comissao_modo = comissaoModoNum === 1 ? 'referencia_fixa_7' as const : 'variavel_real' as const

  // v1 — motor legado. Precisa das entradas em formato Entradas.
  // Aproximação: placa qtd = potencia_wp / 550 (padrão módulo WEG), preço
  // unitário calculado por back-solve. Como o v1 usa `subtotal_kit_weg_bruto_override`,
  // basta passar o kit bruto direto.
  const qtdEstim = Math.max(1, Math.round(entrada.potencia_wp / 550))
  const v1 = calcularProposta(
    {
      placa: { qtd: qtdEstim, preco_venda_unitario: 0, modelo: 'sim', potencia_wp: 550 },
      inversor: { qtd: 1, preco_venda_unitario: 0, modelo: 'sim', potencia_kw: entrada.potencia_kwp },
      itens_ca: entrada.lista_ca > 0 ? [{ descricao: 'Lista CA (agregado)', qtd: 1, preco_unitario: entrada.lista_ca }] : [],
      potencia_kwp: entrada.potencia_kwp,
      distancia_km_extra: entrada.distancia_km_extra,
      subtotal_kit_weg_bruto_override: entrada.kit_bruto_weg,
    },
    params,
  )

  // v2 — reusa componentes do v1 (frete, projeto/ART, instalação, lista CA)
  const linha = inferirLinha(entrada.potencia_kwp)
  const v2 = calcularPropostaV2({
    linha,
    potencia_wp: entrada.potencia_wp,
    potencia_kwp: entrada.potencia_kwp,
    origem_lead: entrada.origem_lead,
    volume_mensal_consultor: entrada.volume_mensal_consultor,
    plano_om_anexado: entrada.plano_om_anexado,
    kit_fornecedor: v1.kit_weg_com_fator,
    lista_ca: v1.subtotal_lista_ca,
    frete: v1.frete,
    projeto_art: v1.projeto_art,
    instalacao: v1.instalacao,
    extras: 0,
    multiplicadores_ativos: entrada.multiplicadores_ativos,
    distancia_km_extra: entrada.distancia_km_extra,
    rbt12, anexo, comissao_modo,
    margens_alvo: (margensRes.data || []) as MargemAlvoRow[],
    aliquotas_simples: (aliqRes.data || []) as AliquotaSimplesRow[],
    multiplicadores: (multRes.data || []) as MultiplicadorRow[],
  })

  const delta = v1.pv_total > 0 ? ((v2.pv_total - v1.pv_total) / v1.pv_total) * 100 : 0

  return {
    sucesso: true,
    resultado: {
      v1: {
        pv_total: v1.pv_total,
        margem: v1.margem,
        comissao_vendedor: v1.comissao_vendedor,
        impostos_simples: v1.impostos_simples,
        kit_com_fator: v1.kit_weg_com_fator,
        reais_por_wp: entrada.potencia_wp > 0 ? v1.pv_total / entrada.potencia_wp : 0,
      },
      v2: {
        pv_total: v2.pv_total,
        margem_spin: v2.margem_spin,
        comissao_valor: v2.comissao_valor,
        imposto_valor: v2.imposto_valor,
        fatia_spin: v2.fatia_spin,
        reais_por_wp: v2.reais_por_wp,
        piso_aplicado: v2.piso_aplicado,
        aliquota_nominal: v2.aliquota_nominal,
        aliquota_efetiva: v2.aliquota_efetiva,
        comissao_efetiva: v2.comissao_efetiva,
        alertas: v2.alertas,
      },
      delta_pv_pct: delta,
      contexto: { linha, anexo, rbt12 },
    },
  }
}
