/**
 * Tabela de preços estimados por categoria/subcategoria — mercado SC 2026-07.
 * Usada como fallback quando o item não tem produto no catálogo e a cotação
 * online do Davi ainda não rodou.
 *
 * Ao consultor: preços podem ser sobrescritos manualmente no form.
 * Ao Davi de compras: quando cotar via web, sobrescreve essas estimativas.
 *
 * Cada entrada retorna: preco_unitario médio de mercado + observação.
 */

import type { ItemKit } from './montar-kit'

type Estimativa = { preco: number; nota?: string }

/**
 * Estimativas por subcategoria (mais específico) ou categoria (fallback).
 * Ao adicionar novo item na Lista CA, cadastre aqui também.
 */
const PRECOS_ESTIMADOS: Record<string, (item: ItemKit) => Estimativa | null> = {
  // === CABOS ===
  cabo_terra: (i) => {
    // Bitola do texto (6mm², 10mm² etc)
    const bitola = extrairBitola(i.descricao)
    const precoPorBitola: Record<number, number> = { 6: 8, 10: 12, 16: 18, 25: 28 }
    return { preco: precoPorBitola[bitola] || 8, nota: `estimativa mercado SC` }
  },
  cabo_hepr_fase: (i) => {
    const bitola = extrairBitola(i.descricao)
    const precoPorBitola: Record<number, number> = { 4: 6, 6: 8, 10: 12, 16: 18, 25: 28 }
    return { preco: precoPorBitola[bitola] || 8, nota: `estimativa mercado SC` }
  },
  cabo_hepr_neutro: (i) => {
    const bitola = extrairBitola(i.descricao)
    const precoPorBitola: Record<number, number> = { 4: 6, 6: 8, 10: 12, 16: 18, 25: 28 }
    return { preco: precoPorBitola[bitola] || 8, nota: `estimativa mercado SC` }
  },

  // === ELETRODUTOS ===
  eletroduto_ca: (i) => {
    const polegadas = extrairPolegadas(i.descricao)
    const precoPorPol: Record<string, number> = {
      '3/4"': 12,
      '1"': 15,
      '1.1/4"': 22,
      '1.1/2"': 30,
      '2"': 45,
      '2.1/2"': 65,
      '3"': 90,
    }
    return { preco: precoPorPol[polegadas] || 15, nota: `barra 3m` }
  },

  // === FIXAÇÃO ===
  abracadeira_d: (i) => {
    const polegadas = extrairPolegadas(i.descricao)
    const precoPorPol: Record<string, number> = {
      '3/4"': 1.8,
      '1"': 2.2,
      '1.1/4"': 3.0,
      '1.1/2"': 3.8,
      '2"': 5.0,
    }
    return { preco: precoPorPol[polegadas] || 2.5 }
  },
  abracadeira_nylon: () => ({ preco: 0.35, nota: '300mm UV' }),
  luva: (i) => {
    const polegadas = extrairPolegadas(i.descricao)
    const precoPorPol: Record<string, number> = { '3/4"': 2.5, '1"': 3.0, '1.1/4"': 4.5, '1.1/2"': 6, '2"': 8 }
    return { preco: precoPorPol[polegadas] || 3.5 }
  },
  curva: (i) => {
    const polegadas = extrairPolegadas(i.descricao)
    const precoPorPol: Record<string, number> = { '3/4"': 3, '1"': 4.5, '1.1/4"': 7, '1.1/2"': 10, '2"': 15 }
    return { preco: precoPorPol[polegadas] || 5 }
  },
  caixa_passagem: () => ({ preco: 18, nota: '100×100mm PVC com tampa' }),

  // === PROTEÇÃO ===
  corrugado_solar: () => ({ preco: 4.5, nota: 'UV — por metro' }),

  // === QUADROS ===
  quadro_plastico: () => ({ preco: 130, nota: 'WEG até 6 disjuntores' }),
  quadro_metalico: () => ({ preco: 280, nota: 'metálico com barramento — comercial' }),

  // === BARRAMENTOS ===
  barramento_neutro: () => ({ preco: 35 }),
  barramento_terra: () => ({ preco: 35 }),

  // === PARAFUSOS E BUCHAS ===
  bucha_s8: () => ({ preco: 0.35 }),
  parafuso_6x40: () => ({ preco: 0.45 }),
  bucha_s6: () => ({ preco: 0.22 }),
  parafuso_4x30: () => ({ preco: 0.28 }),

  // === TERMINAIS ===
  terminal_tubular: (i) => {
    const bitola = extrairBitola(i.descricao)
    const precoPorBitola: Record<number, number> = { 4: 1.2, 6: 1.6, 10: 2.2, 16: 3.2, 25: 5, 35: 8 }
    return { preco: precoPorBitola[bitola] || 2 }
  },
  terminal_olhal: (i) => {
    const bitola = extrairBitola(i.descricao)
    const precoPorBitola: Record<number, number> = { 4: 1.5, 6: 2.2, 10: 3, 16: 4.5, 25: 7 }
    return { preco: precoPorBitola[bitola] || 2.5 }
  },

  // === ATERRAMENTO ===
  balde: () => ({ preco: 28, nota: 'caixa de inspeção' }),
  haste: () => ({ preco: 65, nota: '5/8" × 2,4m cobreada' }),
  conector_terra: () => ({ preco: 18, nota: 'grampo GAR' }),

  // === SINALIZAÇÃO ===
  placa_geracao_grande: () => ({ preco: 48, nota: '20×30cm padrão CELESC' }),
  placa_geracao_pequena: () => ({ preco: 28, nota: '10×15cm identificação relógio' }),
}

/**
 * Aplica estimativas em todos os itens sem preço.
 * Marca como origem_preco='catalogo' com observação indicando estimativa.
 */
export function aplicarPrecosEstimados(itens: ItemKit[]): ItemKit[] {
  return itens.map((item) => {
    // Preserva preços já definidos (catálogo ou manual)
    if (item.preco_unitario && item.origem_preco !== 'sem_preco') return item

    const fn = PRECOS_ESTIMADOS[item.subcategoria]
    if (!fn) return item

    const est = fn(item)
    if (!est) return item

    return {
      ...item,
      preco_unitario: est.preco,
      origem_preco: 'catalogo' as const,
      observacao: `${item.observacao || ''}${est.nota ? ` · ~${est.nota}` : ''} · 💡 estimativa`.trim(),
    }
  })
}

// ============ HELPERS ============

function extrairBitola(texto: string): number {
  const match = texto.match(/(\d+(?:[.,]\d+)?)\s*mm[²2]/i)
  if (!match) return 0
  return parseFloat(match[1].replace(',', '.'))
}

function extrairPolegadas(texto: string): string {
  // 3/4", 1", 1.1/4", 1.1/2", 2", 2.1/2", 3"
  const match = texto.match(/(\d+(?:\.\d+\/\d+)?|\d+\/\d+)\s*"/)
  if (!match) return ''
  return `${match[1]}"`
}
