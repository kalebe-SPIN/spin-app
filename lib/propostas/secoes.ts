import { getInfoTipo } from '@/lib/tipos-projeto'

/**
 * Seções incorporadas às propostas (Kalebe 2026-10-13): "aluguel de máquinas
 * e equipamentos, serviço em alvenaria, elétrica predial e assim por diante
 * como se fossem dentro das propostas, incorporadas como sessões".
 *
 * Cada seção tem valor AO CLIENTE sugerido pela tabela de faixas
 * (faixas_precificacao_servicos — a mesma referência dos serviços avulsos,
 * editável em /admin/precificacao/faixas) e editável na proposta. Soma no
 * total; o cliente vê o escopo da seção e o total consolidado.
 * No projeto, cada tipo vira um projeto_item (formato de seção da dupla visão:
 * nome_secao, icone, descricao, quantidades, valor_cliente).
 *
 * Módulo puro (roda no servidor e no navegador).
 */

export type TipoSecao =
  | 'srv_eletrica_predial' | 'srv_padrao_entrada' | 'srv_alvenaria' | 'srv_serralheria'
  | 'srv_carpintaria' | 'aluguel_maquinas' | 'aluguel_equipamentos' | 'outros'

type ModoSecao = 'por_unidade' | 'faixa_total' | 'diaria' | 'manual'

export const CONFIG_SECAO: Record<TipoSecao, { faixa: string | null; modo: ModoSecao; unidade: string; rotuloQtd: string }> = {
  srv_eletrica_predial: { faixa: 'eletrica_predial', modo: 'por_unidade', unidade: 'h', rotuloQtd: 'Horas' },
  srv_padrao_entrada: { faixa: 'padrao_entrada', modo: 'faixa_total', unidade: 'A', rotuloQtd: 'Disjuntor geral (A)' },
  srv_alvenaria: { faixa: 'alvenaria', modo: 'por_unidade', unidade: 'm²', rotuloQtd: 'Área (m²)' },
  srv_serralheria: { faixa: 'serralheria', modo: 'por_unidade', unidade: 'm', rotuloQtd: 'Metros lineares' },
  srv_carpintaria: { faixa: 'carpintaria', modo: 'por_unidade', unidade: 'm²', rotuloQtd: 'Área (m²)' },
  aluguel_maquinas: { faixa: 'aluguel_maquinas', modo: 'diaria', unidade: 'dias', rotuloQtd: 'Dias' },
  aluguel_equipamentos: { faixa: 'aluguel_equipamentos', modo: 'diaria', unidade: 'dias', rotuloQtd: 'Dias' },
  outros: { faixa: null, modo: 'manual', unidade: '', rotuloQtd: 'Quantidade' },
}

export const TIPOS_SECAO_LISTA: TipoSecao[] = Object.keys(CONFIG_SECAO) as TipoSecao[]

/** Rótulo e emoji do tipo (mesmos do projeto), em ordem A→Z pros selects. */
export const TIPOS_SECAO = TIPOS_SECAO_LISTA
  .map((tipo) => ({ tipo, rotulo: getInfoTipo(tipo)?.label || tipo, emoji: getInfoTipo(tipo)?.emoji || '📦' }))
  .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

export const ehTipoSecao = (t: string): t is TipoSecao => (TIPOS_SECAO_LISTA as string[]).includes(t)

export type FaixaSecao = {
  chave_servico: string
  faixa_min: number
  faixa_max: number | null
  valor: number
  descricao: string | null
  ordem: number
}

export type SecaoProposta = {
  tipo: TipoSecao
  /** Escopo que o cliente lê */
  descricao: string
  /** horas / m² / m / A / dias */
  qtd: number
  /** Aluguel: máquina/equipamento da tabela (descrição da faixa) */
  item?: string | null
  /** Valor AO CLIENTE (R$) — sugerido pela faixa, editável */
  valor: number
}

const br = (n: number, c = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Máquinas/equipamentos de aluguel da tabela (A→Z). */
export function itensDeAluguel(faixas: FaixaSecao[], tipo: TipoSecao): Array<{ item: string; diaria: number }> {
  const cfg = CONFIG_SECAO[tipo]
  if (cfg.modo !== 'diaria') return []
  return faixas.filter((f) => f.chave_servico === cfg.faixa && f.descricao)
    .map((f) => ({ item: f.descricao as string, diaria: Number(f.valor) || 0 }))
    .sort((a, b) => a.item.localeCompare(b.item, 'pt-BR'))
}

/** Valor sugerido pela tabela de faixas (null = sem referência: valor manual). */
export function valorSugerido(faixas: FaixaSecao[], s: Pick<SecaoProposta, 'tipo' | 'qtd' | 'item'>): { valor: number; referencia: string } | null {
  const cfg = CONFIG_SECAO[s.tipo]
  if (!cfg.faixa || !(s.qtd > 0)) return null
  const doTipo = faixas.filter((f) => f.chave_servico === cfg.faixa).sort((a, b) => a.faixa_min - b.faixa_min || a.ordem - b.ordem)
  if (cfg.modo === 'diaria') {
    const f = doTipo.find((x) => x.descricao === s.item)
    if (!f) return null
    return { valor: f.valor * s.qtd, referencia: `${reais(f.valor)}/dia × ${br(s.qtd)}` }
  }
  // Primeira faixa que comporta a quantidade (vãos entre faixas caem na seguinte)
  const f = doTipo.find((x) => x.faixa_max == null || s.qtd <= x.faixa_max)
  if (!f) return null
  if (cfg.modo === 'faixa_total') return { valor: f.valor, referencia: f.descricao || `faixa ${br(f.faixa_min)}–${f.faixa_max ?? '∞'} ${cfg.unidade}` }
  return { valor: f.valor * s.qtd, referencia: `${reais(f.valor)}/${cfg.unidade} × ${br(s.qtd, s.qtd % 1 ? 1 : 0)}${f.descricao ? ` (${f.descricao})` : ''}` }
}

export const totalSecoes = (secoes: SecaoProposta[] | null | undefined) =>
  (secoes || []).reduce((s, x) => s + (Number(x.valor) > 0 ? Number(x.valor) : 0), 0)

/** Linha da seção pro PDF/cliente (sem preço): título, escopo e quantidade. */
export function rotuloSecao(s: SecaoProposta): { titulo: string; detalhe: string } {
  const info = getInfoTipo(s.tipo)
  const cfg = CONFIG_SECAO[s.tipo]
  const qtd = s.qtd > 0 && cfg.unidade ? `${br(s.qtd, s.qtd % 1 ? 1 : 0)} ${cfg.unidade}` : ''
  const partes = [s.item, s.descricao?.trim(), qtd].filter(Boolean)
  return { titulo: info?.label || s.tipo, detalhe: partes.join(' · ') }
}
