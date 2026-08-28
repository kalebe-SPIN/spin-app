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
  //    Total = placas + inversor + lista CA (materiais complementares)
  // Se veio invesores múltiplos, soma placa + soma(inversores × qtd cada)
  const precoInversoresTotal = kit.inversores && kit.inversores.length > 0
    ? kit.inversores.reduce((s, x) => s + x.preco_venda * x.qtd, 0)
    : kit.inversor.preco_venda * kit.qtd_inversores
  const precoKitWeg = kit.preco_total_kit_weg
    || (kit.placa.preco_venda * kit.qtd_placas) + precoInversoresTotal
  const totalFvOnGrid = precoKitWeg + precoListaCA

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
