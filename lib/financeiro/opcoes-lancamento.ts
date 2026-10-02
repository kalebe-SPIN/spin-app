import type { createClient } from '@/lib/supabase/server'
import { getInfoTipo, type TipoItem } from '@/lib/tipos-projeto'

/**
 * Opções do cadastro de lançamento (Kalebe 2026-10-02): custo/despesa pode
 * ser ligado a qualquer projeto ativo e, dentro dele, a um serviço (item do
 * projeto: solar, limpeza, venda de equipamentos...). Tudo A→Z.
 */
export type OpcaoProjeto = { id: string; nome: string }
export type OpcaoServico = { id: string; projeto_id: string; nome: string }

export async function carregarProjetosEServicos(
  supabase: ReturnType<typeof createClient>,
): Promise<{ projetos: OpcaoProjeto[]; servicos: OpcaoServico[] }> {
  const [{ data: projetos }, { data: itens }] = await Promise.all([
    supabase.from('projetos').select('id, codigo, cliente_razao_social').is('excluida_em', null).limit(3000),
    supabase.from('projeto_itens').select('id, projeto_id, tipo, titulo').neq('status', 'removido').limit(10000),
  ])
  const lista = ((projetos || []) as any[])
    .map((p) => ({ id: p.id as string, nome: [p.codigo, p.cliente_razao_social || 'Sem nome'].filter(Boolean).join(' · ') }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const ids = new Set(lista.map((p) => p.id))
  const servicos = ((itens || []) as any[])
    .filter((i) => ids.has(i.projeto_id))
    .map((i) => ({
      id: i.id as string,
      projeto_id: i.projeto_id as string,
      nome: i.titulo || getInfoTipo(i.tipo as TipoItem)?.label || String(i.tipo),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { projetos: lista, servicos }
}
