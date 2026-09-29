/**
 * Preço vigente de um produto a partir de precos_produtos: linha sem
 * vigente_ate; se houver várias, a de vigente_de mais recente.
 */
export function precoVigente(rows: any): number | null {
  const lista: any[] = Array.isArray(rows) ? rows : rows ? [rows] : []
  const vigentes = lista.filter((r) => !r.vigente_ate)
  const escolhido = (vigentes.length ? vigentes : lista)
    .slice()
    .sort((a, b) => String(b.vigente_de || '').localeCompare(String(a.vigente_de || '')))[0]
  const v = Number(escolhido?.preco_venda)
  return v > 0 ? v : null
}

export type ProdutoCatalogoVD = {
  id: string
  modelo: string
  fabricante: string | null
  descricao: string | null
  categoria: string | null
  subcategoria: string | null
  detalhe: string | null          // specs.descricao (ex.: "Estação recarga trifásico 380 V")
  preco_tabela: number            // 0 = sem preço na planilha
  sem_preco: boolean
}

/** Rótulos das categorias (mesmos do /admin/catalogo). */
export const ROTULO_CATEGORIA: Record<string, string> = {
  aterramento: '⏚ Aterramento',
  bateria: '🔋 Baterias',
  cabo_ca: '🔌 Cabos CA',
  cabo_cc: '🔌 Cabos CC',
  conector: '🔗 Conectores',
  disjuntor: '⚙️ Disjuntores',
  dps: '⚡ DPS',
  eletroduto: '🟫 Eletrodutos',
  estrutura: '🏗️ Estruturas',
  inversor: '⚡ Inversores',
  monitoramento: '📡 Monitoramento',
  outro: '📦 Outros',
  placa: '☀️ Placas',
  quadro: '🗄️ Quadros',
  smart_meter: '📊 Smart Meters',
  string_box: '📦 String Boxes',
}

const ROTULO_SUB: Record<string, string> = {
  bess: 'Bateria (BESS)',
  caixa_juncao: 'Caixa de junção',
  correcao_fp: 'Correção de fator de potência',
  inversor_bombeamento: 'Inversor de bombeamento',
  inversor_hibrido: 'Inversor híbrido',
  inversor_string: 'Inversor string',
  kit_acessorios: 'Kit de acessórios',
  modulo_fotovoltaico: 'Módulo fotovoltaico',
  quadro_transferencia: 'Quadro de transferência',
  rapid_shutdown: 'Rapid shutdown',
  sem_categoria: 'Sem subcategoria',
  smart_home: 'Smart home',
  stringbox_cc: 'String box CC',
  ve_wallbox: 'Estação de recarga veicular (VE)',
}

export function rotuloSubcategoria(s: string | null | undefined): string {
  if (!s) return '—'
  if (ROTULO_SUB[s]) return ROTULO_SUB[s]
  const t = s.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const rotuloCategoria = (c: string | null | undefined) => (c ? ROTULO_CATEGORIA[c] || c : '—')
