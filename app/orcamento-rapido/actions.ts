'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TipoItem } from '@/lib/tipos-projeto'
import type { ModoEntrada, ResultadoOrcamento } from '@/lib/orcamento-rapido/tipos'
import { PARAMETROS_DEFAULT } from '@/lib/orcamento-rapido/tipos'
import { adaptadorSolar, type EntradaSolar } from '@/lib/orcamento-rapido/solar'
import { adaptadorServicoPlacas, type EntradaServicoPlacas } from '@/lib/orcamento-rapido/servico-placas'

type EntradaGenerica = EntradaSolar | EntradaServicoPlacas

/**
 * Seleciona adaptador certo pelo tipo de item.
 */
function pegarAdaptador(tipo: TipoItem) {
  const solarTipos: TipoItem[] = ['fv_ongrid', 'fv_hibrido', 'fv_zero_grid', 'fv_offgrid']
  if (solarTipos.includes(tipo)) return adaptadorSolar
  if (tipo === 'srv_limpeza') return adaptadorServicoPlacas
  return null
}

/**
 * Calcula orçamento (chamada síncrona pra preview em tempo real).
 * NÃO persiste — só devolve o resultado.
 */
export async function calcularOrcamentoAction(
  tipo: TipoItem,
  entrada: EntradaGenerica,
): Promise<{ resultado: ResultadoOrcamento } | { erro: string }> {
  const adaptador = pegarAdaptador(tipo)
  if (!adaptador) {
    return { erro: `Adaptador não encontrado pra tipo "${tipo}"` }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultado = (adaptador as any).calcular(entrada, PARAMETROS_DEFAULT)
    return { resultado }
  } catch (e) {
    return { erro: `Erro no cálculo: ${(e as Error).message}` }
  }
}

/**
 * Salva rascunho de orçamento rápido — cria linha em orcamentos_rapidos.
 */
export async function salvarOrcamentoRapidoAction(input: {
  tipo: TipoItem
  modo_entrada: ModoEntrada
  entrada: EntradaGenerica
  resultado: ResultadoOrcamento
  ajuste_percentual: number
  ajuste_justificativa?: string
  valor_final: number
  lead_id?: string
  cliente_id?: string
  telefone_destino?: string
}): Promise<{ id: string } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  if (Math.abs(input.ajuste_percentual) > 10 && !input.ajuste_justificativa?.trim()) {
    return { erro: 'Ajuste maior que 10% requer justificativa' }
  }
  if (input.valor_final < 0) return { erro: 'Valor final não pode ser negativo' }

  const { data, error } = await supabase
    .from('orcamentos_rapidos')
    .insert({
      lead_id: input.lead_id || null,
      cliente_id: input.cliente_id || null,
      consultor_id: user.id,
      tipo: input.tipo,
      modo_entrada: input.modo_entrada,
      entrada: input.entrada,
      resultado: input.resultado,
      ajuste_percentual: input.ajuste_percentual,
      ajuste_justificativa: input.ajuste_justificativa || null,
      valor_final: input.valor_final,
      status: 'rascunho',
      telefone_destino: input.telefone_destino || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) return { erro: `Erro ao salvar: ${error?.message || 'sem detalhes'}` }

  if (input.lead_id) {
    await supabase
      .from('leads')
      .update({ orcamento_rapido_atual_id: data.id })
      .eq('id', input.lead_id)
    revalidatePath(`/crm/leads/${input.lead_id}`)
  }

  revalidatePath('/orcamento-rapido')
  return { id: data.id }
}

/**
 * Marca orçamento como enviado (WhatsApp/e-mail/presencial).
 */
export async function marcarComoEnviadoAction(
  id: string,
  canal: 'whatsapp' | 'email' | 'presencial' | 'outro',
  mensagem: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { error } = await supabase
    .from('orcamentos_rapidos')
    .update({
      status: 'enviado',
      enviado_em: new Date().toISOString(),
      canal_envio: canal,
      mensagem_enviada: mensagem,
      updated_by: user.id,
    })
    .eq('id', id)

  if (error) return { erro: error.message }
  revalidatePath('/orcamento-rapido')
  return { sucesso: true }
}

/**
 * Converte orçamento rápido em projeto formal — cria projeto e liga os dois.
 */
export async function converterEmProjetoAction(orcamentoId: string): Promise<
  { projeto_id: string } | { erro: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { data: orc, error: erroOrc } = await supabase
    .from('orcamentos_rapidos')
    .select('*, leads(id, nome, telefone, whatsapp, email, cliente_id)')
    .eq('id', orcamentoId)
    .single()
  if (erroOrc || !orc) return { erro: 'Orçamento não encontrado' }

  let clienteId: string | null = orc.cliente_id
  const lead = (orc as { leads?: {
    id: string; nome?: string | null; telefone?: string | null;
    whatsapp?: string | null; email?: string | null; cliente_id?: string | null
  } }).leads

  if (!clienteId && lead) {
    if (lead.cliente_id) {
      clienteId = lead.cliente_id
    } else if (lead.nome) {
      const { data: cliCriado } = await supabase
        .from('clientes')
        .insert({
          tipo: 'pf',
          razao_social: lead.nome,
          email: lead.email || null,
          telefone: lead.telefone || null,
          whatsapp: lead.whatsapp || lead.telefone || null,
          proprietario_id: user.id,
        })
        .select('id')
        .single()
      clienteId = cliCriado?.id || null
    }
  }

  const { data: novoProjeto, error: erroProj } = await supabase
    .from('projetos')
    .insert({
      consultor_id: user.id,
      cliente_id: clienteId,
      titular_cliente_id: clienteId,
      titular_igual_cliente: true,
      endereco_igual_titular: true,
      cliente_razao_social: lead?.nome || 'Lead sem nome',
      cliente_telefone: lead?.telefone || null,
      cliente_email: lead?.email || null,
      status: 'rascunho',
      orcamento_rapido_origem_id: orcamentoId,
      observacoes_consultor:
        `Convertido do orçamento rápido ${orcamentoId}.\n` +
        `Estimativa inicial: ${orc.resultado?.resumo || ''} — R$ ${orc.valor_final}`,
    })
    .select('id')
    .single()

  if (erroProj || !novoProjeto) return { erro: `Erro ao criar projeto: ${erroProj?.message || ''}` }

  await supabase
    .from('orcamentos_rapidos')
    .update({
      status: 'convertido',
      projeto_id: novoProjeto.id,
      convertido_em: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('id', orcamentoId)

  revalidatePath('/orcamento-rapido')
  revalidatePath('/projetos')
  redirect(`/projetos/${novoProjeto.id}`)
}
