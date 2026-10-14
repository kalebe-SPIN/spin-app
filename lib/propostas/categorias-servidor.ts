import type { createAdminClient } from '@/lib/supabase/admin'
import { getNum, paramsToRecord, type ParametrosVigentes } from '@/lib/precificacao/calcular'
import { calcularBessPuro, normalizarKitBess, pendenciaKitBess, type CalculoBess, type ItemKitBess, type KitBess } from './bess'
import { totalSecoes, type FaixaSecao, type SecaoProposta } from './secoes'
import { calcularLimpezaAutomatico, type EntradasLimpeza, type ParametrosLimpeza } from '@/lib/precificacao/servico-limpeza'
import { calcularRevisao, type EntradasRevisao, type ParametrosRevisao } from '@/lib/precificacao/servico-revisao'
import { calcularRetiradaRecolocacao, type EntradasRetiradaRecolocacao, type ParametrosRetiradaRecolocacao } from '@/lib/precificacao/servico-retirada-recolocacao'

/**
 * Propostas de BESS, O&M e projetos técnicos montadas no Spinzap
 * (Kalebe 2026-10-14: "mesmo formato do fotovoltaico, em formulário próprio
 * num popup"). Cada uma usa o motor que já existia no projeto:
 *   - BESS: fórmula do kit BESS puro (lib/propostas/bess.ts)
 *   - O&M: calculadoras de limpeza, revisão e retirada/recolocação
 *     (parametros_precificacao_servicos) — valor = subtotal + ajuste
 *   - Projetos técnicos: projeto/ART e diagramas (parâmetros, são custo →
 *     margem + comissão + imposto por cima) e laudo / análise de rede
 *     (tabela de faixas, já é valor ao cliente)
 */

type Admin = ReturnType<typeof createAdminClient>

export async function carregarParams(admin: Admin): Promise<ParametrosVigentes> {
  const { data } = await admin.from('parametros_precificacao')
    .select('chave, valor_numero, valor_json, unidade').is('vigente_ate', null).eq('ativo', true)
  return paramsToRecord(data || [])
}

async function precosVigentes(admin: Admin, ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from('precos_produtos').select('produto_id, preco_venda, vigente_de')
      .in('produto_id', ids.slice(i, i + 300)).is('vigente_ate', null).order('vigente_de', { ascending: false })
    for (const p of (data || []) as any[]) if (!mapa.has(p.produto_id)) mapa.set(p.produto_id, Number(p.preco_venda) || 0)
  }
  return mapa
}

// ─────────────────────────── BESS ───────────────────────────

export type ProdutoBessCat = { id: string; marca: string | null; modelo: string; potencia_kw: number | null; preco_venda: number; disponivel: boolean }
export type CatalogoBess = {
  baterias: ProdutoBessCat[]; controladoras: ProdutoBessCat[]; medidores: ProdutoBessCat[]
  caixas_juncao: ProdutoBessCat[]; opcionais: ProdutoBessCat[]; placas: ProdutoBessCat[]
}

/** Mesmos buckets do /kit (classifica pelo nome do modelo + categoria). */
export async function carregarCatalogoBess(admin: Admin): Promise<CatalogoBess> {
  const { data } = await admin.from('produtos')
    .select('id, fabricante, modelo, categoria, subcategoria, specs, disponivel_estoque').eq('ativo', true).limit(3000)
  const todos = (data || []) as any[]
  const precos = await precosVigentes(admin, todos.map((p) => p.id))
  const norm = (s: any) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-_.]/g, '')
  const contem = (...t: string[]) => (p: any) => t.some((x) => norm(p.modelo).includes(x))
  // Mesma regra do /kit: categoria (não subcategoria) — "EDGE BOX" (monitoramento/controlador) não é inversor
  const cat = (...c: string[]) => (p: any) => c.includes(String(p.categoria || ''))
  const mapear = (p: any): ProdutoBessCat => ({
    id: p.id, marca: p.fabricante || null, modelo: String(p.modelo || ''),
    potencia_kw: Number(p.specs?.potencia_kw || p.specs?.capacidade_kwh) || (p.categoria === 'placa' && p.specs?.potencia_wp ? Number(p.specs.potencia_wp) / 1000 : null),
    preco_venda: precos.get(p.id) || 0, disponivel: p.disponivel_estoque !== false,
  })
  const az = (a: ProdutoBessCat, b: ProdutoBessCat) => a.modelo.localeCompare(b.modelo, 'pt-BR')
  const baterias = todos.filter((p) => contem('LUNA', 'SBW', 'BESS', 'PLW', 'BATERIA')(p) || cat('bateria')(p))
  const controladoras = todos.filter((p) => contem('SIW200H', 'SIW400H', 'SIW300H', 'SIW500H', 'HIBRIDO', 'HIBRID', 'CONTROLADOR')(p) || cat('controlador')(p) || p.subcategoria === 'inversor_hibrido')
  const medidores = todos.filter((p) => contem('DTSU', 'DTS100', 'DTS200', 'DTS3', 'MMW', 'SMARTMETER', 'MEDIDOR')(p) || cat('multimedidor', 'smart_meter', 'medidor')(p))
  const caixas = todos.filter((p) => contem('EMBOX', 'CAIXAJUN', 'STRINGBOX')(p) || cat('caixa_juncao')(p))
  const placas = todos.filter((p) => p.categoria === 'placa' && Number(p.specs?.potencia_wp) >= 100)
  const usados = new Set([...baterias, ...controladoras, ...medidores, ...caixas, ...placas].map((p) => p.id))
  // Opcionais: o resto que tem preço, menos inversor de outra linha e frete
  const opcionais = todos.filter((p) => !usados.has(p.id) && p.categoria !== 'frete' && p.categoria !== 'inversor' && (precos.get(p.id) || 0) > 0)
  return {
    baterias: baterias.map(mapear).sort(az), controladoras: controladoras.map(mapear).sort(az),
    medidores: medidores.map(mapear).sort(az), caixas_juncao: caixas.map(mapear).sort(az),
    opcionais: opcionais.map(mapear).sort(az),
    placas: placas.map(mapear).filter((p) => p.preco_venda > 0).sort((a, b) => (b.potencia_kw || 0) - (a.potencia_kw || 0) || az(a, b)),
  }
}

export type EntradaBess = { kit: KitBess; secoes?: SecaoProposta[]; margem_pct?: number | null; comissao_pct?: number | null }
export type ResultadoBess = { calculo: CalculoBess; total_secoes: number; total: number; pendencia: string | null }

export function calcularEntradaBess(e: EntradaBess, params: ParametrosVigentes, ehAdmin: boolean): ResultadoBess {
  const calculo = calcularBessPuro(e.kit, params, ehAdmin ? { margem_pct: e.margem_pct, comissao_pct: e.comissao_pct } : undefined)
  const ts = totalSecoes(e.secoes)
  return { calculo, total_secoes: ts, total: Math.round((calculo.pv_total + ts) * 100) / 100, pendencia: pendenciaKitBess(normalizarKitBess(e.kit)) }
}

export function semInternoBess(r: ResultadoBess, ehAdmin: boolean): ResultadoBess {
  if (ehAdmin) return r
  return { ...r, calculo: { ...r.calculo, margem: 0, comissao: 0, imposto: 0, desconto_max: 0, margem_pct: 0, comissao_pct: 0, impostos_pct: 0, kit_com_fator: 0, base_impostavel: 0 } }
}

export function blocosPdfBess(k: KitBess, c: CalculoBess) {
  const linhas = (arr: ItemKitBess[], unidade: (i: ItemKitBess) => string) =>
    arr.map((i) => ({ rotulo: `${i.qtd} × ${i.modelo}`, valor: unidade(i) }))
  const kw = (i: ItemKitBess) => (i.potencia_kw ? `${Number(i.potencia_kw).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kW` : '')
  return [
    {
      titulo: '1. Equipamentos',
      linhas: [
        ...linhas(k.controladoras, kw),
        ...linhas(k.baterias, () => ''),
        ...linhas(k.medidores, () => ''),
        ...linhas(k.placas, () => ''),
        ...linhas(k.caixas_juncao, () => ''),
        ...linhas(k.opcionais, () => ''),
        ...(c.potencia_ca_total_kw > 0 ? [{ rotulo: 'Potência dos inversores', valor: `${c.potencia_ca_total_kw.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kW` }] : []),
      ],
    },
    {
      titulo: '2. Projeto e execução',
      servicos: [
        { nome: 'Projeto e ART', texto: 'projeto elétrico do sistema de armazenamento com Anotação de Responsabilidade Técnica.' },
        { nome: 'Instalação e comissionamento', texto: 'montagem, testes, energização e treinamento inicial de operação.' },
        { nome: 'Frete', texto: 'entrega dos equipamentos no local da instalação.' },
        ...(k.lista_ca.length ? [{ nome: 'Materiais elétricos', texto: 'materiais complementares para instalação em conformidade com a NBR 5410.' }] : []),
      ],
    },
  ]
}

// ─────────────────────────── O&M ───────────────────────────

export type ServicoOM = 'limpeza' | 'revisao' | 'retirada'
export const TIPO_DO_SERVICO_OM: Record<ServicoOM, string> = { limpeza: 'srv_limpeza', revisao: 'srv_manutencao', retirada: 'srv_retirada_recolocacao' }
const CHAVE_PARAM_OM: Record<ServicoOM, string> = { limpeza: 'limpeza_fotovoltaica', revisao: 'revisao_manutencao', retirada: 'retirada_recolocacao' }

export type ParamsOM = { limpeza: ParametrosLimpeza | null; revisao: ParametrosRevisao | null; retirada: ParametrosRetiradaRecolocacao | null }

export async function carregarParamsOM(admin: Admin): Promise<{ params: ParamsOM; faixas: FaixaSecao[] }> {
  const chaves = Object.values(CHAVE_PARAM_OM)
  const [{ data: ps }, { data: fs }] = await Promise.all([
    admin.from('parametros_precificacao_servicos').select('chave, parametros').in('chave', chaves),
    admin.from('faixas_precificacao_servicos').select('chave_servico, faixa_min, faixa_max, valor, descricao, ordem').in('chave_servico', chaves).eq('ativo', true).order('ordem'),
  ])
  const de = (c: string) => ((ps || []) as any[]).find((p) => p.chave === c)?.parametros || null
  return {
    params: { limpeza: de(CHAVE_PARAM_OM.limpeza), revisao: de(CHAVE_PARAM_OM.revisao), retirada: de(CHAVE_PARAM_OM.retirada) },
    faixas: ((fs || []) as any[]).map((f) => ({ ...f, faixa_min: Number(f.faixa_min) || 0, faixa_max: f.faixa_max == null ? null : Number(f.faixa_max), valor: Number(f.valor) || 0 })),
  }
}

export type EntradaOM = {
  servico: ServicoOM
  limpeza?: EntradasLimpeza
  revisao?: EntradasRevisao
  retirada?: EntradasRetiradaRecolocacao
  /** Ajuste em R$ sobre o calculado (margem/desconto), como nas telas do projeto */
  ajuste: number
  secoes?: SecaoProposta[]
}
export type ResultadoOM = { subtotal: number; valor_servico: number; total_secoes: number; total: number; resultado: any; memoria: string[]; erro: string | null }

export function calcularEntradaOM(e: EntradaOM, p: ParamsOM): ResultadoOM {
  let resultado: any = null
  let erro: string | null = null
  if (e.servico === 'limpeza') {
    if (!p.limpeza) erro = 'Parâmetros da limpeza não configurados (migration 050)'
    else if (!e.limpeza || !(e.limpeza.qtd_modulos > 0)) erro = 'Informe a quantidade de placas'
    else resultado = calcularLimpezaAutomatico(e.limpeza, p.limpeza)
  } else if (e.servico === 'revisao') {
    if (!p.revisao) erro = 'Parâmetros da revisão não configurados'
    else if (!e.revisao || !(e.revisao.qtd_modulos > 0)) erro = 'Informe a quantidade de placas'
    else resultado = calcularRevisao(e.revisao, p.revisao)
  } else {
    if (!p.retirada) erro = 'Parâmetros da retirada não configurados'
    else if (!e.retirada || !(e.retirada.qtd_modulos > 0)) erro = 'Informe a quantidade de placas'
    else resultado = calcularRetiradaRecolocacao(e.retirada, p.retirada)
  }
  const subtotal = Number(resultado?.subtotal) || 0
  const valor = Math.max(0, Math.round((subtotal + (Number(e.ajuste) || 0)) * 100) / 100)
  const ts = totalSecoes(e.secoes)
  return { subtotal, valor_servico: valor, total_secoes: ts, total: Math.round((valor + ts) * 100) / 100, resultado, memoria: resultado?.memoria_calculo || [], erro }
}

const br = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
export function blocosPdfOM(e: EntradaOM) {
  const servicos: Array<{ nome: string; texto: string }> = []
  if (e.servico === 'limpeza' && e.limpeza) {
    servicos.push({ nome: 'Limpeza fotovoltaica', texto: `limpeza de ${br(e.limpeza.qtd_modulos)} módulos fotovoltaicos.` })
    if (!e.limpeza.tem_ponto_agua) servicos.push({ nome: 'Água', texto: 'fornecimento de água para a limpeza (sem ponto de água no local).' })
  } else if (e.servico === 'revisao' && e.revisao) {
    servicos.push({ nome: 'Manutenção com revisão', texto: `revisão da usina com ${br(e.revisao.qtd_modulos)} módulos fotovoltaicos.` })
    if (e.revisao.inclui_termografia) servicos.push({ nome: 'Termografia', texto: 'inspeção termográfica dos módulos.' })
    if (e.revisao.inclui_teste_string) servicos.push({ nome: 'Teste de strings', texto: `${br(e.revisao.qtd_strings)} string(s).` })
    if (e.revisao.inclui_teste_inversor) servicos.push({ nome: 'Teste de inversores', texto: `${br(e.revisao.qtd_inversores)} inversor(es).` })
    if (e.revisao.inclui_relatorio_tecnico) servicos.push({ nome: 'Relatório técnico', texto: 'assinado por RT habilitado.' })
  } else if (e.retirada) {
    servicos.push({ nome: 'Retirada e recolocação', texto: `desmontagem e remontagem de ${br(e.retirada.qtd_modulos)} módulos fotovoltaicos.` })
    if (e.retirada.tipo_telhado_atual !== e.retirada.tipo_telhado_apos) servicos.push({ nome: 'Fixação', texto: 'suportes novos para o telhado após a obra.' })
    if (!e.retirada.reaproveita_cabeamento) servicos.push({ nome: 'Cabeamento', texto: 'cabos solares novos.' })
  }
  return [{ titulo: '1. Escopo do serviço', servicos }]
}

// ─────────────────────── Projetos técnicos ───────────────────────

export type EntradaTecnico = {
  projeto_art: boolean
  potencia_kw: number
  unifilar: boolean
  trifilar: boolean
  /** Laudo: faixa_min da tabela (1 simples, 2 médio, 3 complexo, 4 pericial); 0 = sem laudo */
  laudo_nivel: number
  /** Análise de rede: dias de coleta; 0 = sem análise */
  analise_dias: number
  descricao?: string
  secoes?: SecaoProposta[]
  margem_pct?: number | null
  comissao_pct?: number | null
}
export type LinhaTecnico = { chave: string; descricao: string; detalhe: string; valor: number; tipo: 'custo' | 'tabela' }
export type ResultadoTecnico = {
  linhas: LinhaTecnico[]
  custo: number
  pv_custos: number
  tabela: number
  total_secoes: number
  total: number
  margem: number; comissao: number; imposto: number
  margem_pct: number; comissao_pct: number; imposto_pct: number
  erro: string | null
}

export async function carregarFaixasTecnico(admin: Admin): Promise<FaixaSecao[]> {
  const { data } = await admin.from('faixas_precificacao_servicos').select('chave_servico, faixa_min, faixa_max, valor, descricao, ordem')
    .in('chave_servico', ['laudo_tecnico', 'analise_rede']).eq('ativo', true).order('ordem')
  return ((data || []) as any[]).map((f) => ({ ...f, faixa_min: Number(f.faixa_min) || 0, faixa_max: f.faixa_max == null ? null : Number(f.faixa_max), valor: Number(f.valor) || 0 }))
}

export function calcularEntradaTecnico(e: EntradaTecnico, params: ParametrosVigentes, faixas: FaixaSecao[], ehAdmin: boolean): ResultadoTecnico {
  const linhas: LinhaTecnico[] = []
  if (e.projeto_art) {
    const pot = Math.max(0, Number(e.potencia_kw) || 0)
    const base = getNum(params, 'projeto_valor_fixo_ate_30kwp', 400)
    const acima = getNum(params, 'projeto_rs_por_kwp_acima_30kwp', 30)
    linhas.push({ chave: 'projeto_art', descricao: 'Projeto elétrico e ART', detalhe: pot ? `${br(pot)} kW` : 'até 30 kW', valor: pot <= 30 ? base : base + (pot - 30) * acima, tipo: 'custo' })
  }
  if (e.unifilar) linhas.push({ chave: 'unifilar', descricao: 'Diagrama unifilar', detalhe: 'documento técnico', valor: getNum(params, 'valor_diagrama_unifilar', 350), tipo: 'custo' })
  if (e.trifilar) linhas.push({ chave: 'trifilar', descricao: 'Diagrama trifilar', detalhe: 'fases, neutros e proteções', valor: getNum(params, 'valor_diagrama_trifilar', 250), tipo: 'custo' })
  let erro: string | null = null
  if (e.laudo_nivel > 0) {
    const f = faixas.find((x) => x.chave_servico === 'laudo_tecnico' && x.faixa_min === e.laudo_nivel)
    if (f) linhas.push({ chave: 'laudo', descricao: 'Laudo técnico', detalhe: f.descricao || '', valor: f.valor, tipo: 'tabela' })
    else erro = 'Faixa do laudo não encontrada na tabela'
  }
  if (e.analise_dias > 0) {
    const f = faixas.filter((x) => x.chave_servico === 'analise_rede').sort((a, b) => a.faixa_min - b.faixa_min)
      .find((x) => x.faixa_max == null || e.analise_dias <= x.faixa_max)
    if (f) linhas.push({ chave: 'analise', descricao: 'Análise de rede', detalhe: `${br(e.analise_dias)} dia(s) · ${f.descricao || ''}`, valor: f.valor, tipo: 'tabela' })
    else erro = 'Faixa da análise de rede não encontrada na tabela'
  }
  const custo = linhas.filter((l) => l.tipo === 'custo').reduce((s, l) => s + l.valor, 0)
  const tabela = linhas.filter((l) => l.tipo === 'tabela').reduce((s, l) => s + l.valor, 0)
  const m = (ehAdmin ? e.margem_pct : null) ?? getNum(params, 'margem_contribuicao_perc', 20)
  const c = (ehAdmin ? e.comissao_pct : null) ?? getNum(params, 'comissao_vendedor_perc', 5)
  const i = getNum(params, 'aliquota_simples_perc', 15)
  const div = 1 - (m + c + i) / 100
  const pvCustos = custo > 0 && div > 0.05 ? custo / div : 0
  const ts = totalSecoes(e.secoes)
  if (!linhas.length && !erro) erro = 'Escolha pelo menos um serviço'
  return {
    linhas, custo, pv_custos: Math.round(pvCustos * 100) / 100, tabela, total_secoes: ts,
    total: Math.round((pvCustos + tabela + ts) * 100) / 100,
    margem: pvCustos * (m / 100), comissao: pvCustos * (c / 100), imposto: pvCustos * (i / 100),
    margem_pct: m, comissao_pct: c, imposto_pct: i, erro,
  }
}

export function semInternoTecnico(r: ResultadoTecnico, ehAdmin: boolean): ResultadoTecnico {
  if (ehAdmin) return r
  return { ...r, custo: 0, margem: 0, comissao: 0, imposto: 0, margem_pct: 0, comissao_pct: 0, imposto_pct: 0, linhas: r.linhas.map((l) => ({ ...l, valor: l.tipo === 'custo' ? 0 : l.valor })) }
}

export function tipoDoTecnico(e: EntradaTecnico): string {
  if (e.projeto_art || e.unifilar || e.trifilar) return 'srv_projeto_tecnico'
  if (e.laudo_nivel > 0) return 'srv_laudo_tecnico'
  return 'srv_analise_rede'
}

export function blocosPdfTecnico(e: EntradaTecnico, r: ResultadoTecnico) {
  const textos: Record<string, string> = {
    projeto_art: 'projeto elétrico com Anotação de Responsabilidade Técnica (ART).',
    unifilar: 'elaboração do documento técnico da instalação, assinado por RT habilitado.',
    trifilar: 'detalhamento das fases, neutros e proteções, assinado por RT habilitado.',
    laudo: 'emissão de laudo técnico assinado por engenheiro.',
    analise: 'medição da qualidade de energia com relatório.',
  }
  return [{
    titulo: '1. Serviços técnicos',
    paragrafo: e.descricao?.trim() || undefined,
    servicos: r.linhas.map((l) => ({ nome: `${l.descricao}${l.detalhe ? ` (${l.detalhe})` : ''}`, texto: textos[l.chave] || '' })),
  }]
}
