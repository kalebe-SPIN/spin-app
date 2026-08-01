'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TipoItem } from '@/lib/tipos-projeto'
import type { ModoEntrada, ResultadoOrcamento, TipoRede } from '@/lib/orcamento-rapido/tipos'
import { PARAMETROS_DEFAULT, TIPOS_REDE_INFO, fatorSolPorCidade } from '@/lib/orcamento-rapido/tipos'
import { adaptadorSolar, type EntradaSolar } from '@/lib/orcamento-rapido/solar'
import { adaptadorServicoPlacas, type EntradaServicoPlacas } from '@/lib/orcamento-rapido/servico-placas'
import { montarKit, buscarPrecoKwpPorFaixa } from '@/lib/orcamento-rapido/catalogo'

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
 *
 * PRA SOLAR: se conseguir montar kit real do catálogo (placa disponível +
 * inversor compatível com tipo_rede), sobrescreve o valor_estimado com o
 * custo bruto REAL (placa+inversor da WEG) — muito mais fiel que R$/kWp fixo.
 * Cai no fallback (R$/kWp) só quando catálogo desabastecido ou entrada.qtd_placas
 * (nesse modo o usuário já definiu qtd, não precisa reescolher placa).
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
    const resultado = (adaptador as any).calcular(entrada, PARAMETROS_DEFAULT) as ResultadoOrcamento

    // Solar: tenta enriquecer com kit real do catálogo E preço R$/kWp do banco
    const tipoSolar: TipoItem[] = ['fv_ongrid', 'fv_hibrido', 'fv_zero_grid', 'fv_offgrid']
    if (tipoSolar.includes(tipo)) {
      const es = entrada as EntradaSolar
      const kwpEstimado = (resultado.estimativa_tecnica as { kwp?: number } | undefined)?.kwp || 0
      const infoRede = TIPOS_REDE_INFO[es.tipo_rede]

      // Sobrescreve valor_estimado com R$/kWp da FAIXA do banco (se cadastrado)
      // Vem do painel /admin/precificacao/fotovoltaico → tabela parametros_precificacao.
      if (kwpEstimado > 0) {
        const faixaBanco = await buscarPrecoKwpPorFaixa(kwpEstimado)
        if (faixaBanco) {
          resultado.valor_estimado = Math.round(kwpEstimado * faixaBanco.preco_kwp)
          resultado.detalhes.push({
            label: 'R$/kWp praticado',
            valor: `R$ ${faixaBanco.preco_kwp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${faixaBanco.descricao})`,
          })
        }
      }

      if (kwpEstimado > 0 && infoRede) {
        const kit = await montarKit({
          kwp_desejado: kwpEstimado,
          fases: infoRede.fases,
          tensao_v: infoRede.tensao,
        })
        if (kit.placa && kit.inversor) {
          // Substitui o valor_estimado (chute) pelo custo bruto REAL WEG.
          // O R$/kWp do fallback vira só uma referência inicial — nunca o final.
          resultado.detalhes = [
            { label: 'Placa selecionada', valor: `${kit.qtd_placas} × ${kit.placa.modelo} (${kit.placa.potencia_wp}Wp)` },
            { label: 'Inversor selecionado', valor: `${kit.inversor.modelo} (${kit.inversor.potencia_kw}kW ${infoRede.label})` },
            { label: 'Potência real do kit', valor: `${kit.kwp_real.toFixed(2).replace('.', ',')} kWp` },
            ...resultado.detalhes.filter(d => !d.label.startsWith('Placa') && !d.label.startsWith('Quantidade')),
            { label: 'Custo bruto WEG (placa+inv)', valor: `R$ ${kit.custo_bruto_weg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
          ]
          // ⚠️ valor_estimado = custo BRUTO (sem MO, frete, projeto, ART, margem, impostos).
          // Vai continuar mostrando o valor do fallback como referência até Kalebe
          // definir os parâmetros comerciais reais (task #79 item F).
          resultado.estimativa_tecnica = {
            ...(resultado.estimativa_tecnica || {}),
            kit_real: {
              placa_id: kit.placa.id,
              placa_modelo: kit.placa.modelo,
              placa_wp: kit.placa.potencia_wp,
              qtd_placas: kit.qtd_placas,
              inversor_id: kit.inversor.id,
              inversor_modelo: kit.inversor.modelo,
              inversor_kw: kit.inversor.potencia_kw,
              custo_bruto_weg: kit.custo_bruto_weg,
              preco_tabela_weg: kit.preco_tabela_weg,
            },
          }
        } else if (kit.aviso_estoque) {
          resultado.detalhes.push({ label: '⚠️ Estoque', valor: kit.aviso_estoque })
        }
      }
    }

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
