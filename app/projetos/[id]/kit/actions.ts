'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { montarListaComplementarCA, type ItemKit } from '@/lib/kit-auto/montar-kit'
import { precificarLista, calcularSubtotais } from '@/lib/kit-auto/precificar-lista'

export type InversorNoKit = {
  id: string
  codigo_weg: string | null
  modelo: string
  potencia_kw: number
  preco_venda: number
  qtd: number
  fases?: 'monofasico' | 'bifasico' | 'trifasico'
}

export type KitSelecionado = {
  placa: { id: string; codigo_weg: string; modelo: string; potencia_wp: number; preco_venda: number }
  qtd_placas: number
  potencia_cc_kwp: number
  // Compat retro: 1º inversor da lista (ou único, se sistema legado)
  inversor: { id: string; codigo_weg: string; modelo: string; potencia_kw: number; preco_venda: number }
  qtd_inversores: number
  // NOVO: array de inversores no kit (permite mixar string + micro + potências diferentes)
  // Kalebe 2026-08-27: composição de invesores no modo manual do kit ongrid
  inversores?: InversorNoKit[]
  potencia_ca_kw: number
  fci_pct: number
  preco_total_kit_weg?: number
  observacoes?: string | null
}

/**
 * Salva o kit e AUTO-COMPLETA o resto do fluxo:
 *   1. Grava kit_selecionado
 *   2. Roda montarListaComplementarCA (estrutura, cabos, disjuntores, DPS, quadro,
 *      aterramento etc. seguindo os padrões Spin já estabelecidos)
 *   3. Precifica a lista com preços vigentes do catálogo
 *   4. Grava lista_ca_confirmada
 *   5. Calcula total (placas + inversor + lista CA) e preenche valor_estimado
 *      do projeto_item 'fv_ongrid' — destrava a proposta consolidada.
 *
 * Kalebe pediu 2026-08-22: "que o restante da montagem do kit seja feita
 * pelo sistema com os parâmetros que já estabelecemos na montagem de kits
 * padrão, e os valores sejam usados como padrão na precificação".
 */
export async function salvarKitAction(projetoId: string, kit: KitSelecionado, tipoProjeto?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  // 1. Grava kit
  const patch: any = {
    kit_selecionado: kit,
    status: 'kit_selecionado',
  }
  if (tipoProjeto) patch.tipo_projeto = tipoProjeto

  // Só colunas que existem em projetos. tipo_ligacao e
  // distancia_string_qgbt_m ficam DENTRO do JSONB padrao_entrada; seções
  // de telhado ficam em projetos_telhado_secoes (tabela separada).
  const { data: projetoAtual } = await supabase
    .from('projetos')
    .select('padrao_entrada')
    .eq('id', projetoId)
    .maybeSingle()

  const { data: telhadoSecoesData } = await supabase
    .from('projetos_telhado_secoes')
    .select('tipo_cobertura')
    .eq('projeto_id', projetoId)
    .limit(1)

  const { error: erroKit } = await supabase
    .from('projetos')
    .update(patch)
    .eq('id', projetoId)
  if (erroKit) return { sucesso: false, erro: erroKit.message }

  // 2. Monta lista CA seguindo padrões Spin
  let itensListaComPreco: ItemKit[] = []
  let precoListaCA = 0
  try {
    const padrao = (projetoAtual as any)?.padrao_entrada || {}
    // tipo_ligacao vive dentro de padrao_entrada.tipo_ligacao (JSONB)
    const tipoLigacao = padrao?.tipo_ligacao || 'monofasico'
    // telhado_secoes é tabela separada — usamos a 1ª seção pro tipo de cobertura
    const telhadoSecoes = telhadoSecoesData || []

    const itensBrutos = montarListaComplementarCA(
      {
        id: kit.placa.id,
        potencia_wp: kit.placa.potencia_wp,
      },
      {
        id: kit.inversor.id,
        potencia_kw: kit.inversor.potencia_kw,
        tensao_desc: '',
        modelo: kit.inversor.modelo,
      },
      {
        qtd_placas: kit.qtd_placas,
        // Se o kit tem invesores múltiplos (novo), soma todas as qtds pra o
        // dimensionamento da lista CA (disjuntores individuais, etc).
        qtd_inversores: kit.inversores && kit.inversores.length > 0
          ? kit.inversores.reduce((s, x) => s + (x.qtd || 0), 0)
          : kit.qtd_inversores,
        distancia_string_qgbt_m: padrao?.distancia_string_qgbt_m || 15,
        tipo_telhado: Array.isArray(telhadoSecoes) && telhadoSecoes[0]?.tipo_cobertura,
        potencia_ca_total_kw: kit.potencia_ca_kw,
        tipo_ligacao: tipoLigacao,
      },
    )

    // 3. Precifica pelo catálogo
    itensListaComPreco = await precificarLista(supabase as any, itensBrutos)
    const subtotais = calcularSubtotais(itensListaComPreco)
    precoListaCA = subtotais.totalGeral

    // 4. Grava lista CA no projeto
    await supabase
      .from('projetos')
      .update({ lista_ca_confirmada: itensListaComPreco })
      .eq('id', projetoId)
  } catch (e: any) {
    // Falha na lista CA não deve bloquear salvar o kit — só loga
    console.error('[salvarKitAction] lista CA falhou:', e?.message || e)
  }

  // 5. Preenche valor_estimado do projeto_item fv_ongrid com o total
  //    Total = placas + inversor + complementos CC + lista CA
  // Se veio invesores múltiplos, soma placa + soma(inversores × qtd cada)
  const precoInversoresTotal = kit.inversores && kit.inversores.length > 0
    ? kit.inversores.reduce((s, x) => s + x.preco_venda * x.qtd, 0)
    : kit.inversor.preco_venda * kit.qtd_inversores
  const precoKitWeg = kit.preco_total_kit_weg
    || (kit.placa.preco_venda * kit.qtd_placas) + precoInversoresTotal

  // Kalebe pediu 2026-08-27: incluir cabo solar CC + estrutura + MC4
  // puxando do /admin/catalogo (mesma lógica das outras categorias).
  // Se algum produto não estiver cadastrado, o item entra com preço 0 e
  // um alerta é registrado nas observações do kit — consultor sabe que
  // precisa cadastrar em /admin/catalogo.
  const complementosCC = await precificarComplementosCC(supabase, {
    qtd_placas: kit.qtd_placas,
    tipo_telhado: (telhadoSecoesData || [])[0]?.tipo_cobertura || null,
    distancia_string_qgbt_m: (projetoAtual as any)?.padrao_entrada?.distancia_string_qgbt_m || 15,
  })
  const precoComplementosCC = complementosCC.total

  // Grava composição CC no projeto pra ficar rastreável
  await supabase
    .from('projetos')
    .update({
      lista_complementos_cc: {
        itens: complementosCC.itens,
        total: precoComplementosCC,
        avisos: complementosCC.avisos,
        gerado_em: new Date().toISOString(),
      },
    })
    .eq('id', projetoId)

  const totalFvOnGrid = precoKitWeg + precoComplementosCC + precoListaCA

  if (totalFvOnGrid > 0) {
    await supabase
      .from('projeto_itens')
      .update({ valor_estimado: totalFvOnGrid })
      .eq('projeto_id', projetoId)
      .in('tipo', ['fv_ongrid', 'fv_hibrido', 'expansao_ongrid', 'expansao_hibrido'])
      .neq('status', 'removido')
  }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}

// ═══════════════════════════════════════════════════════════════════════
// Complementos CC (cabo solar, estrutura, MC4) — puxa do /admin/catalogo
// ═══════════════════════════════════════════════════════════════════════

type EntradaComplementosCC = {
  qtd_placas: number
  tipo_telhado: string | null
  distancia_string_qgbt_m: number
}

type ItemComplementoCC = {
  categoria: 'cabo_cc' | 'estrutura' | 'conector'
  modelo: string
  qtd: number
  unidade: string
  preco_unitario: number
  subtotal: number
}

/**
 * Calcula os complementos CC do kit usando parâmetros pré-estabelecidos
 * em parametros_precificacao (grupo 'complementos_cc') editados no
 * /admin/precificacao. Kalebe 2026-08-27: 'sistema calcule sozinho
 * baseado em parâmetros pré-estabelecidos'.
 *
 * Estimativas de qtd (regras Spin):
 * - Cabo solar 6mm²: 2 × (distancia_qgbt_m + 30m folga por string)
 * - Estrutura: 1 kit pra cada 4 placas (tipo escolhido pelo telhado)
 * - MC4: 2 pares por STRING (1 na saída, 1 na entrada do inversor).
 *   Estimativa: 2 × ceil(qtd_placas / 12).
 */
async function precificarComplementosCC(
  supabase: any,
  entrada: EntradaComplementosCC,
): Promise<{ total: number; itens: ItemComplementoCC[]; avisos: string[] }> {
  const avisos: string[] = []
  const itens: ItemComplementoCC[] = []

  // Busca todos os parâmetros de complementos_cc numa query
  const { data: paramsRows } = await supabase
    .from('parametros_precificacao')
    .select('chave, valor_numero')
    .eq('grupo', 'complementos_cc')
    .eq('ativo', true)
  const params: Record<string, number> = {}
  for (const p of paramsRows || []) {
    if (p.valor_numero != null) params[p.chave] = Number(p.valor_numero)
  }

  // Fallbacks razoáveis quando a migration 090 ainda não rodou
  const precoCaboMetro = params.preco_metro_cabo_solar_6mm2 || 12
  const precoMc4Par = params.preco_par_mc4 || 25
  const precoEstruturaPorTipo: Record<string, { chave: string; preco: number; label: string }> = {
    fibrocimento: { chave: 'preco_kit_estrutura_fibrocimento', preco: params.preco_kit_estrutura_fibrocimento || 320, label: 'Fibrocimento' },
    metal:        { chave: 'preco_kit_estrutura_metal',         preco: params.preco_kit_estrutura_metal || 380,         label: 'Metálico' },
    ceramica:     { chave: 'preco_kit_estrutura_ceramica',      preco: params.preco_kit_estrutura_ceramica || 350,      label: 'Cerâmica' },
    laje:         { chave: 'preco_kit_estrutura_laje',          preco: params.preco_kit_estrutura_laje || 420,          label: 'Laje/Concreto' },
  }

  // Se algum parâmetro não veio, avisa
  const faltando: string[] = []
  if (!('preco_metro_cabo_solar_6mm2' in params)) faltando.push('preco_metro_cabo_solar_6mm2')
  if (!('preco_par_mc4' in params)) faltando.push('preco_par_mc4')
  if (faltando.length > 0) {
    avisos.push(`Parâmetros de complementos CC não cadastrados: ${faltando.join(', ')}. Rode a migration 090 e ajuste em /admin/precificacao. Valores fallback foram aplicados.`)
  }

  // 1. Cabo solar 6mm² — metragem = 2 × (distância + 30m folga)
  const metrosCabo = Math.ceil(2 * (entrada.distancia_string_qgbt_m + 30))
  itens.push({
    categoria: 'cabo_cc',
    modelo: `Cabo solar 6mm² (preto + vermelho) — ${metrosCabo}m`,
    qtd: metrosCabo, unidade: 'm', preco_unitario: precoCaboMetro,
    subtotal: metrosCabo * precoCaboMetro,
  })

  // 2. Estrutura — decide tipo pelo telhado
  const tipo = String(entrada.tipo_telhado || '').toLowerCase()
  let chaveTipo: keyof typeof precoEstruturaPorTipo = 'fibrocimento'
  if (/fibro/.test(tipo)) chaveTipo = 'fibrocimento'
  else if (/metal|zinco|alumin/.test(tipo)) chaveTipo = 'metal'
  else if (/ceram|barro|colonial/.test(tipo)) chaveTipo = 'ceramica'
  else if (/laje|concreto/.test(tipo)) chaveTipo = 'laje'
  const estrut = precoEstruturaPorTipo[chaveTipo]
  const qtdKitsEstrutura = Math.ceil(entrada.qtd_placas / 4)
  itens.push({
    categoria: 'estrutura',
    modelo: `Kit estrutura ${estrut.label} (4 placas por kit)`,
    qtd: qtdKitsEstrutura, unidade: 'kit', preco_unitario: estrut.preco,
    subtotal: qtdKitsEstrutura * estrut.preco,
  })

  // 3. Conector MC4 — 2 pares por string (1 string ≈ 12 placas)
  const qtdMc4 = 2 * Math.ceil(entrada.qtd_placas / 12)
  itens.push({
    categoria: 'conector',
    modelo: 'Par MC4 (macho + fêmea)',
    qtd: qtdMc4, unidade: 'par', preco_unitario: precoMc4Par,
    subtotal: qtdMc4 * precoMc4Par,
  })

  const total = itens.reduce((s, x) => s + x.subtotal, 0)
  return { total, itens, avisos }
}
