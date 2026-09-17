'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { mudarEtapaProjetoAction } from '@/app/projetos/[id]/etapa/actions'

/**
 * Define o valor_estimado de um projeto_item manualmente. Usado quando
 * o consultor já cotou fora do sistema e só quer registrar o total pra
 * fechar a proposta consolidada — não precisa passar pelo fluxo de
 * cálculo automático (kit → lista CA → orçamento com margens).
 */
export async function definirValorItemManualAction(
  itemId: string,
  valor: number,
  projetoId: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  if (!isFinite(valor) || valor <= 0) return { erro: 'Valor inválido' }

  const { error } = await supabase
    .from('projeto_itens')
    .update({ valor_estimado: valor })
    .eq('id', itemId)
    .eq('projeto_id', projetoId)

  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

/**
 * Remove um projeto_item da proposta consolidada. Não apaga o kit/orçamento
 * relacionado — só marca como 'removido' pra sair da conta e da tela.
 */
export async function excluirProjetoItemAction(
  itemId: string,
  projetoId: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }

  const { error } = await supabase
    .from('projeto_itens')
    .update({ status: 'removido' })
    .eq('id', itemId)
    .eq('projeto_id', projetoId)

  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

/**
 * Salva orçamento gerado. Também dispara transição de status → 'orcamento_gerado'
 * via mudarEtapaProjetoAction (registra histórico + automações).
 *
 * Kalebe 2026-09-16: aceita `consolidado` com pv_total real do projeto —
 * em modo multi-UC `proposta` só tem a UC ativa, então o pv_total do
 * jsonb é de UMA UC. Salvamos o total consolidado em `orcamento_consolidado`
 * pra dashboards e faturamento verem o número certo.
 */
export async function salvarOrcamentoAction(
  projetoId: string,
  proposta: any,
  urlPdf?: string,
  consolidado?: { pv_total: number; pv_bruto: number; modo_composicao: string; ucs_qtd: number },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const patch: any = { orcamento_final: proposta }
  if (urlPdf) patch.url_pdf_proposta = urlPdf
  if (consolidado) patch.orcamento_consolidado = consolidado

  const { error } = await supabase.from('projetos').update(patch).eq('id', projetoId)
  if (error) return { sucesso: false, erro: error.message }

  // Dispara transição de status com auditoria + automações
  await mudarEtapaProjetoAction(projetoId, 'orcamento_gerado', 'Orçamento gerado pelo consultor')

  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

/**
 * Marca proposta como enviada ao cliente → status vira 'proposta_enviada'
 * → automaticamente cai na coluna "Negócio → Negociando" no kanban CRM.
 * Também dispara Bianca criando follow-up em 3 dias.
 */
export async function marcarPropostaEnviadaAction(projetoId: string, observacoes?: string) {
  const res = await mudarEtapaProjetoAction(
    projetoId,
    'proposta_enviada',
    observacoes || 'Proposta enviada ao cliente',
  )
  return 'erro' in res && res.erro
    ? { sucesso: false, erro: res.erro }
    : { sucesso: true }
}

/**
 * Marca proposta como aceita → status vira 'vendido' → cria homologação
 * automática com 6 etapas + notifica admin/eletrotécnico.
 *
 * Kalebe 2026-09-17: aceita `venda` com preço final acordado e condição
 * de pagamento fechada com o cliente. Grava em venda_fechada (jsonb) e
 * atualiza orcamento_consolidado.pv_total pra dashboard bater com o
 * valor real da venda, não o simulado.
 */
export type DadosVendaAceita = {
  preco_final: number
  condicao_pagamento: string
  parcelas?: number | null
  observacoes?: string | null
}

export async function marcarPropostaAceitaAction(
  projetoId: string,
  observacoesOuVenda?: string | DadosVendaAceita,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  // Retrocompatível: aceita string (legado) ou objeto com dados da venda.
  const venda: DadosVendaAceita | null =
    typeof observacoesOuVenda === 'object' && observacoesOuVenda !== null
      ? observacoesOuVenda
      : null
  const observacoes =
    typeof observacoesOuVenda === 'string'
      ? observacoesOuVenda
      : venda?.observacoes || 'Cliente aceitou a proposta — venda fechada'

  // Se recebeu dados de venda, persiste em venda_fechada + atualiza
  // orcamento_consolidado.pv_total ANTES de mudar etapa, pra que
  // hooks/triggers de fechamento já vejam o valor real.
  if (venda && Number.isFinite(venda.preco_final) && venda.preco_final > 0) {
    const { data: proj } = await supabase
      .from('projetos')
      .select('orcamento_consolidado')
      .eq('id', projetoId)
      .maybeSingle()
    // Kalebe 2026-09-17: tudo vive dentro de orcamento_consolidado (jsonb
    // da migration 092) — evita coluna nova. Guarda também um bloco
    // venda_fechada:{...} pra histórico do fechamento (quem/quando).
    const consolidado = {
      ...(proj?.orcamento_consolidado || {}),
      pv_total: venda.preco_final,
      pv_acordado: venda.preco_final,
      condicao_pagamento_acordada: venda.condicao_pagamento,
      parcelas_acordadas: venda.parcelas || null,
      venda_fechada: {
        preco_final: venda.preco_final,
        condicao_pagamento: venda.condicao_pagamento,
        parcelas: venda.parcelas || null,
        observacoes: venda.observacoes || null,
        fechada_em: new Date().toISOString(),
        fechada_por: user.id,
      },
    }
    const { error: eUp } = await supabase
      .from('projetos')
      .update({ orcamento_consolidado: consolidado })
      .eq('id', projetoId)
    if (eUp) return { sucesso: false, erro: eUp.message }
  }

  const res = await mudarEtapaProjetoAction(projetoId, 'vendido', observacoes)
  if ('erro' in res && res.erro) return { sucesso: false, erro: res.erro }

  // Kalebe 2026-08-29: ao aceitar, exclui automaticamente as outras
  // propostas em andamento do mesmo cliente. Preserva as que já estão
  // em pós-venda pra não apagar histórico contratual.
  let excluidas = 0
  try {
    const { excluirOutrasPropostasDoClienteAction } = await import('@/app/projetos/actions')
    const r = await excluirOutrasPropostasDoClienteAction(projetoId)
    if ('excluidas' in r && typeof r.excluidas === 'number') excluidas = r.excluidas
  } catch (e: any) {
    console.error('[marcarPropostaAceitaAction] falha auto-exclusão:', e?.message)
  }
  return { sucesso: true, outras_excluidas: excluidas }
}

/**
 * Kalebe 2026-09-02: aplica desconto do admin no fechamento da proposta.
 * Aceita percentual (0-100) OU valor absoluto (R$). Se pct preenchido,
 * tem prioridade. Zero em ambos limpa o desconto.
 * Requer role admin.
 */
export async function aplicarDescontoAdminAction(
  projetoId: string,
  entrada: { pct?: number | null; valor?: number | null; motivo?: string | null },
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Só admin pode aplicar desconto' }

  const pct = entrada.pct != null && !Number.isNaN(entrada.pct) ? Number(entrada.pct) : null
  const valor = entrada.valor != null && !Number.isNaN(entrada.valor) ? Number(entrada.valor) : null
  // Kalebe 2026-09-02: agora aceita valores NEGATIVOS = acréscimo.
  // - pct positivo → desconto (%); pct negativo → acréscimo (%)
  // - valor positivo → desconto (R$); valor negativo → acréscimo (R$)
  // Cap do pct em ±100 pra evitar dobrar/zerar por acidente.
  if (pct != null && (pct < -100 || pct > 100)) {
    return { erro: 'Percentual deve ficar entre -100 e 100' }
  }

  const zerando = (pct === null || pct === 0) && (valor === null || valor === 0)

  const { error } = await supabase
    .from('projetos')
    .update({
      desconto_admin_pct: zerando ? null : pct,
      desconto_admin_valor: zerando ? null : valor,
      desconto_admin_motivo: zerando ? null : (entrada.motivo || null),
      desconto_admin_por: zerando ? null : user.id,
      desconto_admin_em: zerando ? null : new Date().toISOString(),
    })
    .eq('id', projetoId)
  if (error) return { erro: error.message }

  revalidatePath(`/projetos/${projetoId}/orcamento`)
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}

/**
 * Kalebe 2026-09-02: adiciona um item livre à proposta (extras).
 * Descrição + valor, sem passar pelo dimensionamento. Soma ao PV bruto
 * antes do ajuste final. Só admin.
 */
export type SecaoExtra = 'kit_weg' | 'lista_ca' | 'servicos'

/**
 * Kalebe 2026-09-14: extras agora são contextuais por seção (Kit WEG,
 * Lista CA, Serviços). Em Kit WEG e Lista CA a UI busca no catálogo e
 * puxa preço automático da tabela WEG. Em Serviços é livre.
 * Cada item guarda: { secao, descricao, valor, qtd?, unidade?, produto_id?, criado_em }.
 * Retrocompat: itens antigos sem `secao` → tratados como 'servicos' na UI.
 */
export async function adicionarExtraAction(
  projetoId: string,
  entrada: {
    descricao: string
    valor: number
    secao?: SecaoExtra
    qtd?: number
    unidade?: string
    produto_id?: string
    modelo?: string
    fabricante?: string
  },
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Só admin pode adicionar extras' }

  const desc = String(entrada.descricao || '').trim()
  const val = Number(entrada.valor) || 0
  const secao: SecaoExtra = (entrada.secao === 'kit_weg' || entrada.secao === 'lista_ca' || entrada.secao === 'servicos')
    ? entrada.secao : 'servicos'
  const qtd = entrada.qtd && entrada.qtd > 0 ? Number(entrada.qtd) : 1
  if (!desc) return { erro: 'Descrição obrigatória' }
  if (val === 0) return { erro: 'Valor não pode ser zero' }

  const { data: proj } = await supabase
    .from('projetos').select('extras_proposta').eq('id', projetoId).single()
  const atuais: any[] = Array.isArray(proj?.extras_proposta) ? proj.extras_proposta : []

  const novoItem = {
    secao,
    descricao: desc,
    valor: val,
    qtd,
    unidade: entrada.unidade || 'un',
    produto_id: entrada.produto_id || null,
    modelo: entrada.modelo || null,
    fabricante: entrada.fabricante || null,
    criado_em: new Date().toISOString(),
  }
  const novos = [...atuais, novoItem]

  const { error } = await supabase
    .from('projetos').update({ extras_proposta: novos }).eq('id', projetoId)
  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}/orcamento`)
  return { sucesso: true }
}

/**
 * Busca produtos do catálogo WEG por categoria + termo livre.
 * Retorna preço vigente hoje. Usado pelos modais de Kit WEG e Lista CA.
 */
export async function buscarProdutosCatalogoAction(entrada: {
  categoria?: string   // 'placa'|'inversor'|'bateria'|... — filtro opcional
  q?: string           // termo livre (nome, modelo, fabricante)
  limit?: number
}): Promise<{ produtos: Array<any> } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Só admin' }

  const hoje = new Date().toISOString().slice(0, 10)
  const q = String(entrada.q || '').trim()
  const limit = Math.min(entrada.limit || 50, 100)

  let query = supabase
    .from('produtos')
    .select(`
      id, modelo, fabricante, categoria, subcategoria, specs, disponivel_estoque,
      precos_produtos(preco_venda, vigente_de, vigente_ate)
    `)
    .eq('ativo', true)
    .limit(limit)

  if (entrada.categoria) query = query.eq('categoria', entrada.categoria)
  if (q) {
    // Busca por modelo, fabricante ou codigo_weg (or)
    query = query.or(`modelo.ilike.%${q}%,fabricante.ilike.%${q}%,codigo_weg.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return { erro: error.message }

  // Anexa preço vigente pra cada produto
  const produtos = (data || []).map((p: any) => {
    const precos = (p.precos_produtos || []) as any[]
    const vigentes = precos.filter((pr) =>
      (!pr.vigente_de || pr.vigente_de <= hoje)
      && (!pr.vigente_ate || pr.vigente_ate >= hoje),
    )
    const preco_venda = Number((vigentes[0] || precos[0])?.preco_venda) || 0
    return {
      id: p.id,
      modelo: p.modelo,
      fabricante: p.fabricante,
      categoria: p.categoria,
      subcategoria: p.subcategoria,
      specs: p.specs,
      disponivel_estoque: p.disponivel_estoque,
      preco_venda,
    }
  })

  return { produtos }
}

export async function removerExtraAction(
  projetoId: string,
  index: number,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Só admin' }

  const { data: proj } = await supabase
    .from('projetos').select('extras_proposta').eq('id', projetoId).single()
  const atuais: any[] = Array.isArray(proj?.extras_proposta) ? proj.extras_proposta : []
  if (index < 0 || index >= atuais.length) return { erro: 'Índice inválido' }
  const novos = atuais.filter((_, i) => i !== index)

  const { error } = await supabase
    .from('projetos').update({ extras_proposta: novos }).eq('id', projetoId)
  if (error) return { erro: error.message }
  revalidatePath(`/projetos/${projetoId}/orcamento`)
  return { sucesso: true }
}
