/**
 * Agregações do dashboard do representante Spin.
 *
 * Kalebe 2026-09-06: espelha a proposta de credenciamento pra que o
 * representante veja em tempo real o mesmo motor que foi vendido:
 *   - acelerador de volume ao vivo
 *   - portfólio segmentado (residencial · comercial · usina · carregador · O&M)
 *   - carteira recorrente (MRR) com faixa de anuidade
 *   - próximo nível (Credenciado → Sênior → Master)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { CONFIG as CRED, acelerador as calcularAcelerador } from '@/lib/proposta-credenciamento'
import { TAXA_BASE_POR_LINHA, ORIGEM_MULT, type Linha, type OrigemLead } from '@/lib/precificacao/calcular-v2'

export type Segmento = 'residencial' | 'comercial' | 'usina' | 'carregador' | 'om_avulso' | 'servico_avulso' | 'outro'

export type PortfolioSegmento = {
  segmento: Segmento
  qtd_vendas: number
  volume: number
  comissao_estimada: number
  taxa_media_pct: number
}

export type DashboardRepresentante = {
  representante_id: string
  nome: string
  data_credenciamento: string | null
  nivel: 'Credenciado' | 'Sênior' | 'Master'
  // Mês corrente
  volume_mes: number
  acelerador_mult: number
  faixa_atual: { faixa: string; falta_ate_proxima: number; proxima_mult: number | null }
  // Portfólio segmentado
  portfolio: PortfolioSegmento[]
  // Comissão do mês (soma das vendas)
  comissao_bruta_mes: number
  bonus_anexacao_mes: number
  // Carteira recorrente
  mrr_carteira: number
  anuidade_mensal: number
  faixa_anuidade: { limite: string; pct: number; falta_ate_proxima: number; proxima_pct: number | null }
  // Verba e retirada
  verba_apoio: number
  retirada_fixa: number
  // Total mês
  total_mes: number
  // Progresso pro próximo nível
  progresso_proximo_nivel: {
    proximo: string
    criterios: Array<{ label: string; atingido: number; alvo: number; unidade: string; ok: boolean }>
  } | null
  // Meta últimas 30 dias (breakdown por origem — pra ele ver que prospecção rende mais)
  breakdown_origem: Array<{ origem: OrigemLead; qtd: number; comissao_estimada: number }>
}

function inferirSegmento(projeto: any): Segmento {
  const potencia = Number(projeto?.kit_selecionado?.potencia_cc_kwp) || 0
  const tipos: string[] = Array.isArray(projeto?.tipos_projeto) ? projeto.tipos_projeto : []
  if (tipos.includes('ve_recarga') || projeto?.ve_recarga_selecionada) return 'carregador'
  if (tipos.includes('om')) return 'om_avulso'
  if (tipos.includes('servico')) return 'servico_avulso'
  if (potencia === 0) return 'outro'
  if (potencia <= 20) return 'residencial'
  if (potencia <= 200) return 'comercial'
  return 'usina'
}

function segmentoParaLinha(seg: Segmento): Linha {
  if (seg === 'residencial') return 'residencial'
  if (seg === 'comercial') return 'comercial'
  if (seg === 'usina') return 'usina'
  if (seg === 'carregador') return 'carregador'
  return 'om'
}

/** Faixa marginal do acelerador — pra mostrar "faltam Rx pra 1,20×" */
function proximaFaixaAcelerador(volume: number): { faixa: string; falta_ate_proxima: number; proxima_mult: number | null } {
  let prev = 0
  for (const f of CRED.FAIXAS) {
    if (volume <= f.ate) {
      const proximaIdx = CRED.FAIXAS.findIndex(x => x.ate > f.ate)
      const proxima = proximaIdx >= 0 ? CRED.FAIXAS[proximaIdx] : null
      const label = f.ate === Infinity
        ? `Acima de R$ ${(prev / 1000).toFixed(0)}k`
        : `Até R$ ${(f.ate / 1000).toFixed(0)}k · ${f.mult.toFixed(2)}×`
      return {
        faixa: label,
        falta_ate_proxima: Math.max(0, f.ate - volume),
        proxima_mult: proxima?.mult ?? null,
      }
    }
    prev = f.ate
  }
  return { faixa: 'Máx', falta_ate_proxima: 0, proxima_mult: null }
}

function proximaFaixaAnuidade(mrr: number) {
  let prev = 0
  for (const f of CRED.ANUIDADE) {
    if (mrr <= f.ate) {
      const proxIdx = CRED.ANUIDADE.findIndex(x => x.ate > f.ate)
      const prox = proxIdx >= 0 ? CRED.ANUIDADE[proxIdx] : null
      const label = f.ate === Infinity ? `Acima de R$ ${(prev / 1000).toFixed(1)}k` : `Até R$ ${(f.ate / 1000).toFixed(1)}k/mês`
      return { limite: label, pct: f.pct, falta_ate_proxima: Math.max(0, f.ate - mrr), proxima_pct: prox?.pct ?? null }
    }
    prev = f.ate
  }
  return { limite: 'Máx', pct: CRED.ANUIDADE[CRED.ANUIDADE.length - 1].pct, falta_ate_proxima: 0, proxima_pct: null }
}

function calcularNivel(
  mesesAtivo: number,
  mrr: number,
  fechadorMesCount: number,
  credenciadosFormados: number,
): DashboardRepresentante['nivel'] {
  if (mesesAtivo >= 24 && mrr >= 15000 && credenciadosFormados >= 1) return 'Master'
  if (mesesAtivo >= 12 && mrr >= 5000 && fechadorMesCount >= 3) return 'Sênior'
  return 'Credenciado'
}

/**
 * Coleta e agrega os dados do dashboard do representante.
 * Chamado no server component; dados persistidos em `projetos` + `configuracoes_empresa`.
 */
export async function agregarDashboardRepresentante(
  supabase: SupabaseClient,
  representanteId: string,
): Promise<DashboardRepresentante | null> {
  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, nome_completo, created_at, mrr_carteira_atual, credenciados_formados, fechador_mes_count')
    .eq('id', representanteId)
    .maybeSingle()
  if (!perfil) return null

  const inicioMes = new Date()
  inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)

  // Vendas do mês (status = vendido) — pra volume e portfólio
  const { data: vendasMes } = await supabase
    .from('projetos')
    .select('id, status, tipos_projeto, kit_selecionado, orcamento_final, origem_lead, ve_recarga_selecionada, created_at')
    .eq('consultor_id', representanteId)
    .eq('status', 'vendido')
    .gte('created_at', inicioMes.toISOString())

  const volumeMes = (vendasMes || []).reduce((s: number, p: any) => s + (Number(p.orcamento_final?.pv_total) || 0), 0)
  const acelMult = calcularAcelerador(volumeMes)
  const faixaAtual = proximaFaixaAcelerador(volumeMes)

  // Portfólio segmentado
  const porSegmento = new Map<Segmento, PortfolioSegmento>()
  for (const p of (vendasMes || []) as any[]) {
    const seg = inferirSegmento(p)
    const linha = segmentoParaLinha(seg)
    const taxaBase = TAXA_BASE_POR_LINHA[linha]?.sem ?? 0.05
    const valor = Number(p.orcamento_final?.pv_total) || 0
    const origem = (p.origem_lead as OrigemLead) || 'lead_spin'
    const comissaoEst = valor * taxaBase * acelMult * (ORIGEM_MULT[origem] ?? 1)
    const atual = porSegmento.get(seg) || {
      segmento: seg, qtd_vendas: 0, volume: 0, comissao_estimada: 0, taxa_media_pct: 0,
    }
    atual.qtd_vendas += 1
    atual.volume += valor
    atual.comissao_estimada += comissaoEst
    porSegmento.set(seg, atual)
  }
  const portfolio = Array.from(porSegmento.values()).map(p => ({
    ...p,
    taxa_media_pct: p.volume > 0 ? (p.comissao_estimada / p.volume) * 100 : 0,
  }))
  const comissaoBruta = portfolio.reduce((s, p) => s + p.comissao_estimada, 0)

  // Breakdown por origem (últimos 30 dias — pra ver o mix)
  const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30)
  const { data: vendas30 } = await supabase
    .from('projetos')
    .select('origem_lead, orcamento_final, kit_selecionado')
    .eq('consultor_id', representanteId)
    .eq('status', 'vendido')
    .gte('created_at', trintaDias.toISOString())
  const porOrigem = new Map<OrigemLead, { qtd: number; comissao_estimada: number }>()
  for (const p of (vendas30 || []) as any[]) {
    const o = (p.origem_lead as OrigemLead) || 'lead_spin'
    const valor = Number(p.orcamento_final?.pv_total) || 0
    const taxa = 0.05 * acelMult * (ORIGEM_MULT[o] ?? 1)
    const atual = porOrigem.get(o) || { qtd: 0, comissao_estimada: 0 }
    atual.qtd += 1
    atual.comissao_estimada += valor * taxa
    porOrigem.set(o, atual)
  }

  // Carteira recorrente
  const mrr = Number((perfil as any).mrr_carteira_atual) || 0
  const anuidadeCalc = proximaFaixaAnuidade(mrr)
  const anuidadeMensal = mrr * anuidadeCalc.pct
  const bonusAnexacaoMes = 0 // TODO: calcular via lista de vendas com plano_om anexado

  // Verba de apoio
  const verba = Math.max(CRED.VERBA.piso, Math.min(CRED.VERBA.teto, volumeMes * CRED.VERBA.pct))

  // Nível
  const dataCred = (perfil as any).created_at as string
  const mesesAtivo = dataCred
    ? Math.floor((Date.now() - new Date(dataCred).getTime()) / (30 * 24 * 3600 * 1000))
    : 0
  const nivel = calcularNivel(
    mesesAtivo, mrr,
    (perfil as any).fechador_mes_count || 0,
    (perfil as any).credenciados_formados || 0,
  )

  // Progresso pro próximo nível
  let progressoProxNivel: DashboardRepresentante['progresso_proximo_nivel'] = null
  if (nivel === 'Credenciado') {
    progressoProxNivel = {
      proximo: 'Sênior',
      criterios: [
        { label: 'Meses ativo', atingido: mesesAtivo, alvo: 12, unidade: 'meses', ok: mesesAtivo >= 12 },
        { label: 'Vezes Fechador do Mês', atingido: (perfil as any).fechador_mes_count || 0, alvo: 3, unidade: '×', ok: ((perfil as any).fechador_mes_count || 0) >= 3 },
        { label: 'Carteira MRR', atingido: mrr, alvo: 5000, unidade: 'R$/mês', ok: mrr >= 5000 },
      ],
    }
  } else if (nivel === 'Sênior') {
    progressoProxNivel = {
      proximo: 'Master',
      criterios: [
        { label: 'Meses ativo', atingido: mesesAtivo, alvo: 24, unidade: 'meses', ok: mesesAtivo >= 24 },
        { label: 'Carteira MRR', atingido: mrr, alvo: 15000, unidade: 'R$/mês', ok: mrr >= 15000 },
        { label: 'Representantes formados', atingido: (perfil as any).credenciados_formados || 0, alvo: 1, unidade: '×', ok: ((perfil as any).credenciados_formados || 0) >= 1 },
      ],
    }
  }

  return {
    representante_id: representanteId,
    nome: (perfil as any).nome_completo || 'Representante',
    data_credenciamento: dataCred || null,
    nivel,
    volume_mes: volumeMes,
    acelerador_mult: acelMult,
    faixa_atual: faixaAtual,
    portfolio,
    comissao_bruta_mes: comissaoBruta,
    bonus_anexacao_mes: bonusAnexacaoMes,
    mrr_carteira: mrr,
    anuidade_mensal: anuidadeMensal,
    faixa_anuidade: anuidadeCalc,
    verba_apoio: verba,
    retirada_fixa: CRED.RETIRADA_MENSAL,
    total_mes: comissaoBruta + bonusAnexacaoMes + anuidadeMensal + CRED.RETIRADA_MENSAL + verba,
    progresso_proximo_nivel: progressoProxNivel,
    breakdown_origem: Array.from(porOrigem.entries()).map(([origem, dados]) => ({ origem, ...dados })),
  }
}
