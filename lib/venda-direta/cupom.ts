import type { SupabaseClient } from '@supabase/supabase-js'
import type { CupomAplicado } from '@/lib/precificacao/venda-direta'

/**
 * Cupom de desconto da venda direta (Kalebe 2026-09-30). Só admin cria e
 * aplica (RLS de cupons_desconto/cupons_usos é admin). Aqui só a validação:
 * existe, ativo, dentro da validade e do limite de usos.
 */

export const normalizarCodigo = (c: string) =>
  c.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '')

export async function buscarCupomValido(
  supabase: SupabaseClient,
  codigoDigitado: string,
  projetoId: string,
  hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }),
): Promise<{ cupom: CupomAplicado } | { erro: string }> {
  const codigo = normalizarCodigo(codigoDigitado || '')
  if (codigo.length < 3) return { erro: 'Digite o código do cupom' }

  const { data: c, error } = await supabase
    .from('cupons_desconto')
    .select('id, codigo, tipo, valor, valido_de, valido_ate, limite_usos, ativo, aplica_em')
    .eq('codigo', codigo)
    .maybeSingle()
  if (error) return { erro: /cupons_desconto/.test(error.message) ? 'Falta rodar a migration 128 no Supabase.' : error.message }
  if (!c) return { erro: `Cupom ${codigo} não existe` }
  if (!c.ativo) return { erro: `Cupom ${codigo} está desativado` }
  if (c.aplica_em !== 'venda_direta') return { erro: `Cupom ${codigo} não vale para venda de equipamentos` }
  if (c.valido_de && hoje < c.valido_de) return { erro: `Cupom ${codigo} só vale a partir de ${c.valido_de.split('-').reverse().join('/')}` }
  if (c.valido_ate && hoje > c.valido_ate) return { erro: `Cupom ${codigo} venceu em ${c.valido_ate.split('-').reverse().join('/')}` }

  if (c.limite_usos) {
    const { count } = await supabase
      .from('cupons_usos')
      .select('projeto_id', { count: 'exact', head: true })
      .eq('cupom_id', c.id)
      .neq('projeto_id', projetoId)   // reaplicar na mesma proposta não gasta outro uso
    if ((count || 0) >= c.limite_usos) return { erro: `Cupom ${codigo} já atingiu o limite de ${c.limite_usos} uso(s)` }
  }

  return { cupom: { id: c.id, codigo: c.codigo, tipo: c.tipo, valor: Number(c.valor) } }
}
