import type { createAdminClient } from '@/lib/supabase/admin'
import { getInfoTipo } from '@/lib/tipos-projeto'
import {
  CONFIG_SECAO, TIPOS_SECAO_LISTA, ehTipoSecao, rotuloSecao, totalSecoes,
  type FaixaSecao, type SecaoProposta, type TipoSecao,
} from './secoes'

/** Seções das propostas no banco: tabela de faixas e projeto_itens do projeto. */

type Admin = ReturnType<typeof createAdminClient>

export async function carregarFaixasSecoes(admin: Admin): Promise<FaixaSecao[]> {
  const chaves = TIPOS_SECAO_LISTA.map((t) => CONFIG_SECAO[t].faixa).filter(Boolean) as string[]
  const { data } = await admin.from('faixas_precificacao_servicos')
    .select('chave_servico, faixa_min, faixa_max, valor, descricao, ordem, ativo')
    .in('chave_servico', chaves).eq('ativo', true).order('ordem')
  return ((data || []) as any[]).map((f) => ({
    chave_servico: f.chave_servico, faixa_min: Number(f.faixa_min) || 0,
    faixa_max: f.faixa_max == null ? null : Number(f.faixa_max), valor: Number(f.valor) || 0,
    descricao: f.descricao || null, ordem: Number(f.ordem) || 0,
  }))
}

/** Seções já no projeto (inclusive as criadas pela tela de serviço avulso). */
export async function secoesDoProjeto(admin: Admin, projetoId: string | null): Promise<SecaoProposta[]> {
  if (!projetoId) return []
  const { data } = await admin.from('projeto_itens').select('tipo, dados, valor_estimado, ordem')
    .eq('projeto_id', projetoId).in('tipo', TIPOS_SECAO_LISTA).neq('status', 'removido').order('ordem')
  const out: SecaoProposta[] = []
  for (const it of (data || []) as any[]) {
    if (!ehTipoSecao(it.tipo)) continue
    const d = it.dados || {}
    if (Array.isArray(d.secoes_proposta) && d.secoes_proposta.length) {
      for (const s of d.secoes_proposta) out.push({ ...s, tipo: it.tipo as TipoSecao })
    } else {
      out.push({
        tipo: it.tipo as TipoSecao,
        descricao: String(d.descricao || ''),
        qtd: 0,
        item: null,
        valor: Number(d.valor_cliente ?? it.valor_estimado) || 0,
      })
    }
  }
  return out
}

/**
 * Grava as seções no projeto: um projeto_item por tipo (formato de seção da
 * dupla visão). Tipo de seção que saiu da proposta fica 'removido'.
 */
export async function salvarSecoesNoProjeto(admin: Admin, projetoId: string, secoes: SecaoProposta[], usuarioId: string): Promise<void> {
  const validas = (secoes || []).filter((s) => ehTipoSecao(s.tipo) && Number(s.valor) > 0)
  const porTipo = new Map<TipoSecao, SecaoProposta[]>()
  for (const s of validas) porTipo.set(s.tipo, [...(porTipo.get(s.tipo) || []), s])

  const { data: existentes } = await admin.from('projeto_itens').select('id, tipo, ordem')
    .eq('projeto_id', projetoId).in('tipo', TIPOS_SECAO_LISTA).neq('status', 'removido')
  const { data: ult } = await admin.from('projeto_itens').select('ordem').eq('projeto_id', projetoId)
    .order('ordem', { ascending: false }).limit(1).maybeSingle()
  let proximaOrdem = (Number((ult as any)?.ordem) || 0) + 1

  for (const [tipo, linhas] of Array.from(porTipo.entries())) {
    const info = getInfoTipo(tipo)
    const valor = Math.round(totalSecoes(linhas) * 100) / 100
    const payload = {
      tipo,
      titulo: info?.label || tipo,
      dados: {
        nome_secao: info?.label || tipo,
        icone: info?.emoji || '📦',
        descricao: linhas.map((l) => rotuloSecao(l).detalhe).filter(Boolean).join(' | '),
        quantidades: linhas.map((l) => ({ item: rotuloSecao(l).detalhe || info?.label || tipo, qtd: l.qtd || 1 })),
        valor_cliente: valor,
        secoes_proposta: linhas,
        origem: 'proposta',
        _salvo_por: usuarioId,
      },
      valor_estimado: valor,
      status: 'concluido',
    }
    const ja = ((existentes || []) as any[]).find((e) => e.tipo === tipo)
    if (ja) await admin.from('projeto_itens').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ja.id)
    else await admin.from('projeto_itens').insert({ ...payload, projeto_id: projetoId, ordem: proximaOrdem++ })
  }
  const sairam = ((existentes || []) as any[]).filter((e) => !porTipo.has(e.tipo))
  if (sairam.length) await admin.from('projeto_itens').update({ status: 'removido' }).in('id', sairam.map((e) => e.id))
}
