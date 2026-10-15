import type { OrcamentoLead } from './orcamento-lead'
import { TIPOS_TELHADO, rotuloDe, type PerfilLead } from './perfil'

/**
 * Auditor do orçamento da Laís (Kalebe 2026-10-10): "audita as informações
 * do cadastro e confirma a coerência delas com o orçamento gerado, aplica
 * conformidade técnica e normativa". Regras CELESC iguais às do gerador de
 * kits (lib/kit-auto/sugerir-kits.ts): monofásico até 8 kW CA, corrente do
 * inversor ≤ 80% do disjuntor geral, CC/CA até 150% (string on-grid).
 * Item "grave" reprovado = orçamento não sai até alguém resolver.
 */

export type ItemAuditoria = { ok: boolean; grave: boolean; grupo: 'Cadastro' | 'Técnico' | 'Normativo' | 'Coerência'; texto: string }
export type Auditoria = { aprovado: boolean; itens: ItemAuditoria[]; auditado_em: string }

const CELESC_LIMITE_MONO_KW = 8
const DESBALANCEAMENTO_MAX_KW = 5
const FATOR_SEGURANCA_DISJUNTOR = 0.8
const FCI_MAX_STRING = 1.5
const FCI_MIN = 0.8
const FCI_MAX_HIBRIDO = 2.0
const FCI_MAX_MICRO = 1.45
const AREA_PLACA_PADRAO_M2 = 2.6   // quando o catálogo não informa a área da placa

const br = (n: number, casas = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

export function auditarOrcamentoLead(o: OrcamentoLead, p: PerfilLead): Auditoria {
  const itens: ItemAuditoria[] = []
  const add = (grupo: ItemAuditoria['grupo'], ok: boolean, grave: boolean, texto: string) => itens.push({ ok, grave, grupo, texto })
  const end = p.contato.endereco || {}

  // ── Cadastro ──
  add('Cadastro', !!p.contato.primeiro_nome, false, p.contato.primeiro_nome ? `Nome: ${p.contato.primeiro_nome}` : 'Falta o nome do contato')
  add('Cadastro', !!p.contato.email, false, p.contato.email ? `E-mail: ${p.contato.email}` : 'Falta o e-mail pra proposta')
  add('Cadastro', !!(end.cidade || o.cidade), true, end.cidade || o.cidade ? `Cidade: ${end.cidade || o.cidade}${end.uf ? `/${end.uf}` : ''}` : 'Falta a cidade da instalação (define a irradiação)')
  const enderecoCompleto = !!(end.rua && end.numero && end.cidade)
  add('Cadastro', enderecoCompleto, false, enderecoCompleto ? 'Endereço da instalação completo' : 'Endereço incompleto — orçamento usa só a cidade; confirmar antes da visita')
  if (p.peculiaridades.titular_fatura === false) {
    add('Cadastro', false, false, `Projeto em nome de outra pessoa${p.peculiaridades.titular_nome ? ` (${p.peculiaridades.titular_nome})` : ''} — pedir documento do titular`)
  }

  // ── Normativo (CELESC) ──
  const tipoRede = p.infra_eletrica.tipo_rede || (o.tipo_rede.startsWith('mono') ? 'monofasico' : o.tipo_rede.startsWith('bi') ? 'bifasico' : 'trifasico')
  add('Normativo', !!p.infra_eletrica.tipo_rede, false, p.infra_eletrica.tipo_rede ? `Rede ${tipoRede}` : 'Tipo de rede não confirmado pelo cliente (usado monofásico)')
  const fasesInv = o.inversor.fases
  const fasesRede = tipoRede === 'trifasico' ? 'tri' : tipoRede === 'bifasico' ? 'bi' : 'mono'
  const nFases = fasesRede === 'tri' ? 3 : fasesRede === 'bi' ? 2 : 1
  const qtdInv = o.inversor.qtd || 1
  const potCa = o.inversor.potencia_kw * qtdInv   // potência CA total (todos os inversores)
  add('Normativo', !fasesInv || fasesInv === fasesRede || fasesInv === 'mono', true,
    `${qtdInv > 1 ? `${qtdInv} × ` : ''}${o.inversor.modelo} (${fasesInv || '?'}) compatível com rede ${tipoRede}`)
  if (tipoRede === 'monofasico') {
    add('Normativo', potCa <= CELESC_LIMITE_MONO_KW, true,
      `Monofásico: ${br(potCa)} kW CA (limite CELESC ${CELESC_LIMITE_MONO_KW} kW)`)
  } else if (fasesInv === 'mono') {
    // Inversores monofásicos em rede bi/tri: distribuídos entre as fases; se a
    // quantidade não fecha com o nº de fases, uma fase fica com um a mais
    const desbal = qtdInv % nFases === 0 ? 0 : o.inversor.potencia_kw
    add('Normativo', desbal <= DESBALANCEAMENTO_MAX_KW, true,
      `Desbalanceamento entre fases ${br(desbal)} kW (limite CELESC ${DESBALANCEAMENTO_MAX_KW} kW)`)
    if (o.tipo_sistema === 'micro') {
      add('Técnico', qtdInv % nFases === 0, true, `${qtdInv} microinversores ${qtdInv % nFases === 0 ? 'balanceados' : 'NÃO balanceados'} entre as ${nFases} fases`)
    }
  }
  const disj = Number(p.infra_eletrica.disjuntor_a) || 0
  if (disj > 0) {
    const tri = tipoRede === 'trifasico'
    const corrente = (potCa * 1000) / ((tri ? 380 : 220) * (tri ? Math.sqrt(3) : 1))
    const limite = disj * FATOR_SEGURANCA_DISJUNTOR
    add('Normativo', corrente <= limite, true,
      corrente <= limite
        ? `Disjuntor ${disj} A comporta o inversor (${br(corrente)} A ≤ ${br(limite)} A)`
        : `Disjuntor ${disj} A não comporta o inversor (${br(corrente)} A > ${br(limite)} A) — prever troca do padrão`)
  } else {
    add('Normativo', false, false, 'Disjuntor geral não informado — conferir na visita')
  }

  // ── Técnico ──
  // CC/CA máximo por tipo (mesmas regras do gerador de kits): string 150%, híbrido 200%, micro 145%
  const fciMax = o.tipo_sistema === 'hibrido' ? FCI_MAX_HIBRIDO : o.tipo_sistema === 'micro' ? FCI_MAX_MICRO : FCI_MAX_STRING
  const fci = o.kwp / potCa
  add('Técnico', fci >= FCI_MIN && fci <= fciMax, true, `Relação CC/CA ${br(fci * 100, 0)}% (faixa ${br(FCI_MIN * 100, 0)}–${br(fciMax * 100, 0)}%)`)
  const areaPlacas = o.qtd_placas * (o.placa.area_m2 || AREA_PLACA_PADRAO_M2)
  if (p.infra_civil.area_m2) {
    add('Técnico', areaPlacas <= p.infra_civil.area_m2 * 0.7, false,
      `${o.qtd_placas} placas ocupam ~${br(areaPlacas, 0)} m² de ${br(p.infra_civil.area_m2, 0)} m² do imóvel`)
  }
  if (p.infra_civil.tipo_telhado) {
    const especial = ['laje_impermeabilizada', 'solo', 'carport'].includes(p.infra_civil.tipo_telhado)
    add('Técnico', !especial, false, especial
      ? `Estrutura de ${rotuloDe(TIPOS_TELHADO, p.infra_civil.tipo_telhado).toLowerCase()}: confirmar suporte na visita`
      : `Telhado ${rotuloDe(TIPOS_TELHADO, p.infra_civil.tipo_telhado).toLowerCase()}${p.infra_civil.material_estrutura ? `, estrutura de ${p.infra_civil.material_estrutura}` : ''}`)
  } else {
    add('Técnico', false, false, 'Tipo de telhado não informado')
  }
  if (p.peculiaridades.sombreamento) {
    add('Técnico', false, false, `Sombreamento informado${p.peculiaridades.sombreamento_descricao ? ` (${p.peculiaridades.sombreamento_descricao})` : ''} — avaliar perda na visita`)
  }

  // ── Tarifa (Kalebe 2026-10-13: vem da fatura, não de valor fixo) ──
  if (o.entrada.modo === 'valor_mensal') {
    const t = o.entrada.tarifa
    if (!t?.tarifa_kwh) add('Coerência', false, true, 'Sem tarifa pra converter o valor da conta em kWh')
    else if (t.fonte === 'base') add('Coerência', false, false, `Tarifa estimada pela base (${t.amostras || '?'} faturas reais, sem subsídio) — confirmar com a fatura do cliente`)
    else add('Coerência', true, false, 'Tarifa calculada da fatura do cliente')
  }

  // ── Coerência consumo × geração ──
  if (o.consumo_kwh_mes) {
    // Kalebe 2026-10-15: com aumento extra de geração, a referência é o consumo + aumento
    const aumento = Number(o.aumento_geracao_pct) || 0
    const alvo = o.consumo_kwh_mes * (1 + aumento / 100)
    const cobertura = o.geracao_kwh_mes / alvo
    add('Coerência', cobertura >= 0.85 && cobertura <= 1.3, false,
      `Geração estimada ${br(o.geracao_kwh_mes, 0)} kWh/mês para consumo de ${br(o.consumo_kwh_mes, 0)} kWh/mês${aumento ? ` + ${aumento}% de aumento previsto` : ''} (${br(cobertura * 100, 0)}%)`)
  }
  add('Coerência', o.pv_total > 0, true, o.pv_total > 0 ? 'Preço calculado pelo motor de precificação' : 'Preço zerado — conferir catálogo/parâmetros')

  return { aprovado: !itens.some((i) => i.grave && !i.ok), itens, auditado_em: new Date().toISOString() }
}
