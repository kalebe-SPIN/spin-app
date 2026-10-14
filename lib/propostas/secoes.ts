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
  id?: string
  chave_servico: string
  /** Variável dona da faixa (mig 156); null = variável principal */
  variavel?: string | null
  faixa_min: number
  faixa_max: number | null
  valor: number
  descricao: string | null
  ordem: number
}

/**
 * Variável de precificação de um item (Kalebe 2026-10-14, mig 156): o admin
 * estrutura — rótulo, grandeza/unidade e modo de cobrança pelas faixas.
 *   por_unidade = valor da faixa × quantidade · faixa_total = valor da faixa
 *   por_item = item escolhido da tabela × quantidade · fixo = valor fixo
 */
export type ModoVariavel = 'por_unidade' | 'faixa_total' | 'por_item' | 'fixo'
export type VariavelPreco = {
  id?: string
  chave_servico: string
  chave: string
  rotulo: string
  unidade: string
  modo: ModoVariavel
  ordem: number
}

export type SecaoProposta = {
  tipo: TipoSecao
  /** Escopo que o cliente lê */
  descricao: string
  /** horas / m² / m / A / dias (variável principal) */
  qtd: number
  /** Aluguel: máquina/equipamento da tabela (descrição da faixa) */
  item?: string | null
  /** Valores de cada variável do item (quando o admin estruturou variáveis) */
  valores?: Record<string, { qtd: number; item?: string | null }>
  /** Escopo + quantidades já descritos (vai pro PDF sem precisar das variáveis) */
  resumo?: string
  /** Valor AO CLIENTE (R$) — sugerido pela faixa, editável */
  valor: number
}

/** Variáveis do tipo de seção (em ordem); vazio = comportamento fixo de antes. */
export function variaveisDoTipo(variaveis: VariavelPreco[] | null | undefined, tipo: TipoSecao): VariavelPreco[] {
  const faixa = CONFIG_SECAO[tipo].faixa || tipo
  return (variaveis || []).filter((v) => v.chave_servico === faixa).sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

/** Valor de uma variável pela tabela de faixas. */
export function valorDaVariavel(faixas: FaixaSecao[], v: VariavelPreco, principal: boolean, entrada: { qtd: number; item?: string | null }): { valor: number; referencia: string } | null {
  const fs = faixas
    .filter((f) => f.chave_servico === v.chave_servico && (f.variavel === v.chave || (principal && !f.variavel)))
    .sort((a, b) => a.faixa_min - b.faixa_min || a.ordem - b.ordem)
  const qtd = Number(entrada.qtd) || 0
  if (v.modo === 'fixo') {
    const f = fs[0]
    return f ? { valor: f.valor, referencia: `${v.rotulo}: ${reais(f.valor)}` } : null
  }
  if (v.modo === 'por_item') {
    const f = fs.find((x) => x.descricao === entrada.item)
    if (!f) return null
    const q = qtd > 0 ? qtd : 1
    return { valor: f.valor * q, referencia: `${f.descricao}: ${reais(f.valor)}${v.unidade ? `/${v.unidade}` : ''} × ${br(q, q % 1 ? 1 : 0)}` }
  }
  if (!(qtd > 0)) return null
  const f = fs.find((x) => x.faixa_max == null || qtd <= x.faixa_max)
  if (!f) return null
  if (v.modo === 'faixa_total') return { valor: f.valor, referencia: `${v.rotulo} ${br(qtd, qtd % 1 ? 1 : 0)} ${v.unidade}: ${f.descricao || reais(f.valor)}` }
  return { valor: f.valor * qtd, referencia: `${v.rotulo}: ${reais(f.valor)}/${v.unidade} × ${br(qtd, qtd % 1 ? 1 : 0)}` }
}

/** Entrada da variável numa seção (a principal também fica em qtd/item, pra compatibilidade). */
export function entradaDaVariavel(s: SecaoProposta, v: VariavelPreco, principal: boolean): { qtd: number; item?: string | null } {
  return s.valores?.[v.chave] || (principal ? { qtd: s.qtd, item: s.item } : { qtd: 0, item: null })
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
export function valorSugerido(faixas: FaixaSecao[], s: Pick<SecaoProposta, 'tipo' | 'qtd' | 'item' | 'valores'>, variaveis?: VariavelPreco[] | null): { valor: number; referencia: string } | null {
  // Variáveis estruturadas pelo admin: soma de cada uma
  const vs = variaveisDoTipo(variaveis, s.tipo)
  if (vs.length) {
    const partes = vs.map((v, i) => valorDaVariavel(faixas, v, i === 0, entradaDaVariavel(s as SecaoProposta, v, i === 0))).filter(Boolean) as Array<{ valor: number; referencia: string }>
    if (!partes.length) return null
    return { valor: partes.reduce((t, p) => t + p.valor, 0), referencia: partes.map((p) => p.referencia).join(' + ') }
  }
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
export function rotuloSecao(s: SecaoProposta, variaveis?: VariavelPreco[] | null): { titulo: string; detalhe: string } {
  const info = getInfoTipo(s.tipo)
  const vs = variaveisDoTipo(variaveis, s.tipo)
  if (vs.length) {
    const qtds = vs.map((v, i) => {
      const e = entradaDaVariavel(s, v, i === 0)
      if (v.modo === 'por_item') return e.item ? `${e.item}${e.qtd > 1 ? ` × ${br(e.qtd, e.qtd % 1 ? 1 : 0)}${v.unidade ? ` ${v.unidade}` : ''}` : ''}` : ''
      return e.qtd > 0 ? `${v.rotulo.toLowerCase()} ${br(e.qtd, e.qtd % 1 ? 1 : 0)} ${v.unidade}`.trim() : ''
    }).filter(Boolean)
    return { titulo: info?.label || s.tipo, detalhe: [s.descricao?.trim(), ...qtds].filter(Boolean).join(' · ') }
  }
  if (s.resumo) return { titulo: info?.label || s.tipo, detalhe: s.resumo }
  const cfg = CONFIG_SECAO[s.tipo]
  const qtd = s.qtd > 0 && cfg.unidade ? `${br(s.qtd, s.qtd % 1 ? 1 : 0)} ${cfg.unidade}` : ''
  const partes = [s.item, s.descricao?.trim(), qtd].filter(Boolean)
  return { titulo: info?.label || s.tipo, detalhe: partes.join(' · ') }
}
