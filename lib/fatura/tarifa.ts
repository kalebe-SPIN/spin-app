import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tarifa de energia calculada a partir da FATURA do cliente (Kalebe
 * 2026-10-13): "quero que o sistema extraia do PDF do cliente e calcule,
 * porque tem as diferenças entre grupo, hora e subsídios". Nada de R$/kWh
 * fixo: a IA só LÊ os itens da fatura; a conta é feita aqui, em código.
 *
 *   tarifa efetiva (R$/kWh) = (energia TE+TUSD+bandeiras, com tributos − descontos/subsídios) ÷ kWh faturados
 *   tarifa da conta (R$/kWh) = valor total da conta ÷ kWh faturados (inclui CIP, serviços…)
 *   por posto: ponta / fora de ponta / intermediário (grupo A e tarifa branca)
 * Demanda (R$/kW, grupo A), CIP, multas, juros e serviços NÃO entram na tarifa
 * efetiva. Cada fatura lida alimenta a base (tarifas_extraidas, mig 151).
 */

export type ItemEnergiaFatura = {
  descricao: string
  posto: 'unico' | 'ponta' | 'fora_ponta' | 'intermediario'
  componente: 'TE' | 'TUSD' | 'TE+TUSD' | 'bandeira' | 'outro'
  kwh: number | null
  tarifa_com_tributos: number | null
  valor: number | null
}

/** Bloco "tarifa" que a IA devolve na leitura da fatura */
export type TarifaLida = {
  itens_energia?: ItemEnergiaFatura[]
  consumo_faturado_kwh?: number | null
  descontos_subsidios?: Array<{ descricao: string; valor: number }>
  subsidio?: 'nenhum' | 'tarifa_social' | 'rural' | 'irrigante' | 'outro' | null
  cip_iluminacao_publica?: number | null
  demanda_valor?: number | null
  outros_itens?: Array<{ descricao: string; valor: number }>
  icms_pct?: number | null
  pis_pct?: number | null
  cofins_pct?: number | null
  custo_disponibilidade_kwh?: number | null
}

export type TarifaCalculada = {
  tarifa_media_kwh: number | null
  tarifa_conta_kwh: number | null
  por_posto: Partial<Record<'unico' | 'ponta' | 'fora_ponta' | 'intermediario', number>>
  consumo_faturado_kwh: number | null
  valor_energia: number
  descontos: number
  subsidio: string
  observacoes: string[]
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const arred = (v: number, c = 5) => Math.round(v * 10 ** c) / 10 ** c
/** Faixa plausível de R$/kWh com tributos (fora disso a leitura falhou) */
const PLAUSIVEL = (t: number) => t >= 0.2 && t <= 3.5

export function calcularTarifa(t: TarifaLida | null | undefined, ctx: { valor_total?: number | null; consumo_mes_kwh?: number | null; grupo?: string | null }): TarifaCalculada {
  const obs: string[] = []
  const itens = (t?.itens_energia || []).filter((i) => i && (n(i.valor) || n(i.kwh)))
  // kWh faturados: o que a fatura diz; senão a soma de UM componente por posto (TE e TUSD repetem os mesmos kWh)
  let kwh = n(t?.consumo_faturado_kwh) || null
  if (!kwh) {
    const porPostoKwh: Record<string, number> = {}
    for (const i of itens.filter((x) => x.componente !== 'bandeira' && n(x.kwh))) {
      porPostoKwh[i.posto] = Math.max(porPostoKwh[i.posto] || 0, n(i.kwh))
    }
    kwh = Object.values(porPostoKwh).reduce((s, v) => s + v, 0) || n(ctx.consumo_mes_kwh) || null
  }
  const valorEnergia = itens.reduce((s, i) => s + n(i.valor), 0)
  const descontos = (t?.descontos_subsidios || []).reduce((s, d) => s + Math.abs(n(d.valor)), 0)
  const subsidio = t?.subsidio || (descontos > 0 ? 'outro' : 'nenhum')

  let media: number | null = kwh && valorEnergia ? (valorEnergia - descontos) / kwh : null
  if (media !== null && !PLAUSIVEL(media)) { obs.push(`Tarifa efetiva fora do esperado (R$ ${arred(media, 3)}/kWh) — leitura descartada`); media = null }
  let conta: number | null = kwh && n(ctx.valor_total) ? n(ctx.valor_total) / kwh : null
  if (conta !== null && !PLAUSIVEL(conta)) conta = null

  // Por posto: soma das tarifas unitárias (TE + TUSD + bandeira) de cada posto
  const porPosto: TarifaCalculada['por_posto'] = {}
  for (const posto of ['unico', 'ponta', 'fora_ponta', 'intermediario'] as const) {
    const doPosto = itens.filter((i) => i.posto === posto && n(i.tarifa_com_tributos))
    if (!doPosto.length) continue
    const soma = doPosto.reduce((s, i) => s + n(i.tarifa_com_tributos), 0)
    if (PLAUSIVEL(soma)) porPosto[posto] = arred(soma)
  }
  if (descontos > 0) obs.push(`Subsídio/desconto na fatura: R$ ${descontos.toFixed(2)} (${subsidio.replace('_', ' ')})`)
  if (n(t?.demanda_valor) > 0) obs.push('Grupo A: demanda (R$/kW) fica fora da tarifa por kWh')
  if (porPosto.ponta && porPosto.fora_ponta) obs.push('Tarifa diferenciada por horário (ponta × fora de ponta)')

  return {
    tarifa_media_kwh: media !== null ? arred(media) : null,
    tarifa_conta_kwh: conta !== null ? arred(conta) : null,
    por_posto: porPosto,
    consumo_faturado_kwh: kwh,
    valor_energia: arred(valorEnergia, 2),
    descontos: arred(descontos, 2),
    subsidio,
    observacoes: obs,
  }
}

type Cliente = SupabaseClient<any, any, any>

/** Guarda a tarifa da fatura na base (uma por UC × mês). Sem a migration 151, ignora. */
export async function registrarTarifaExtraida(admin: Cliente, r: {
  origem: 'tela' | 'lais'
  usuario_id?: string | null
  conversa_id?: string | null
  dados: {
    uc?: string | null; grupo?: string | null; subgrupo?: string | null; classe?: string | null
    modalidade_tarifaria?: string | null; tipo_ligacao?: string | null; mes_referencia?: string | null
    valor_total_reais?: number | null; endereco?: { cidade?: string; uf?: string } | null
  }
  tarifa: TarifaCalculada
  lida?: TarifaLida | null
}): Promise<void> {
  try {
    if (!r.tarifa.tarifa_media_kwh) return
    if (r.dados.uc && r.dados.mes_referencia) {
      const { data: ja } = await admin.from('tarifas_extraidas').select('id').eq('uc', r.dados.uc).eq('mes_referencia', r.dados.mes_referencia).limit(1)
      if (ja?.length) return
    }
    await admin.from('tarifas_extraidas').insert({
      origem: r.origem, usuario_id: r.usuario_id || null, conversa_id: r.conversa_id || null,
      uc: r.dados.uc || null, grupo: r.dados.grupo || null, subgrupo: r.dados.subgrupo || null,
      classe: r.dados.classe || null, modalidade: r.dados.modalidade_tarifaria || null,
      tipo_ligacao: r.dados.tipo_ligacao || null, subsidio: r.tarifa.subsidio, mes_referencia: r.dados.mes_referencia || null,
      cidade: r.dados.endereco?.cidade || null, uf: r.dados.endereco?.uf || null,
      consumo_faturado_kwh: r.tarifa.consumo_faturado_kwh, valor_energia: r.tarifa.valor_energia, descontos: r.tarifa.descontos,
      cip: r.lida?.cip_iluminacao_publica ?? null, valor_total: r.dados.valor_total_reais ?? null,
      tarifa_media_kwh: r.tarifa.tarifa_media_kwh, tarifa_conta_kwh: r.tarifa.tarifa_conta_kwh,
      por_posto: r.tarifa.por_posto, componentes: r.lida || null,
    })
  } catch (e) {
    console.error('[fatura/tarifa] registrar', e)
  }
}

/**
 * Tarifa de referência quando o lead não tem a fatura: mediana das faturas
 * REAIS lidas nos últimos 6 meses (CELESC reajusta todo ano), no mesmo
 * perfil — grupo B, modalidade convencional, sem subsídio (e a mesma classe,
 * quando informada). Sem base suficiente → null (o orçamento não sai sozinho).
 */
export async function tarifaDeReferencia(admin: Cliente, filtro: { classe?: string | null } = {}): Promise<
  { tarifa_kwh: number; tarifa_conta_kwh: number | null; amostras: number } | null
> {
  try {
    const desde = new Date(Date.now() - 183 * 86_400_000).toISOString()
    let q = admin.from('tarifas_extraidas').select('tarifa_media_kwh, tarifa_conta_kwh, classe')
      .eq('grupo', 'B').eq('subsidio', 'nenhum').gte('criado_em', desde).not('tarifa_media_kwh', 'is', null)
    q = q.or('modalidade.eq.convencional,modalidade.is.null')
    const { data, error } = await q.limit(500)
    if (error || !data?.length) return null
    let linhas = data as Array<{ tarifa_media_kwh: number; tarifa_conta_kwh: number | null; classe: string | null }>
    if (filtro.classe) {
      const daClasse = linhas.filter((l) => (l.classe || '').toUpperCase() === filtro.classe!.toUpperCase())
      if (daClasse.length >= 3) linhas = daClasse
    }
    if (linhas.length < 3) return null
    const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
    const contas = linhas.map((l) => Number(l.tarifa_conta_kwh)).filter((x) => x > 0)
    return {
      tarifa_kwh: arred(mediana(linhas.map((l) => Number(l.tarifa_media_kwh)))),
      tarifa_conta_kwh: contas.length >= 3 ? arred(mediana(contas)) : null,
      amostras: linhas.length,
    }
  } catch {
    return null
  }
}
