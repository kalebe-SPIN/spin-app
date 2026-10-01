/**
 * Kit da proposta + equipamentos EXTRAS do orçamento (Kalebe 2026-10-01).
 *
 * Extras "kit WEG" (projetos.extras_proposta, secao 'kit_weg') já entravam
 * no preço, mas a proposta mostrava só o kit_selecionado — 14 placas e
 * 8,89 kWp quando o cliente leva 16. Aqui placa e inversor extras somam no
 * mesmo modelo (ou viram linha nova) e potência CC/CA, FCI e geração são
 * recalculadas. Outros extras (estrutura, cabo…) não mudam a potência.
 */

export type ExtraKit = {
  secao?: string
  produto_id?: string | null
  modelo?: string | null
  descricao?: string
  qtd?: number
  // Preenchidos pelo catálogo (página do orçamento / ao adicionar)
  categoria?: string | null
  potencia_wp?: number | null
  potencia_kw?: number | null
}

export type LinhaPlaca = { modelo: string; qtd: number; potencia_wp: number; extra: boolean }
export type LinhaInversor = { modelo: string; qtd: number; potencia_kw: number; extra: boolean }

export type KitConsolidado = {
  placas: LinhaPlaca[]
  inversores: LinhaInversor[]
  qtd_placas: number
  potencia_cc_kwp: number
  potencia_ca_kw: number
  fci_pct: number
  tem_extras: boolean
}

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const mesmoModelo = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export function consolidarKitComExtras(kit: any, extras: ExtraKit[] | null | undefined): KitConsolidado {
  const k = kit || {}
  const placas: LinhaPlaca[] = k.placa?.modelo || num(k.qtd_placas) > 0
    ? [{ modelo: k.placa?.modelo || 'Módulo', qtd: num(k.qtd_placas), potencia_wp: num(k.placa?.potencia_wp), extra: false }]
    : []
  const inversores: LinhaInversor[] = Array.isArray(k.inversores) && k.inversores.length > 0
    ? k.inversores.map((i: any) => ({ modelo: i.modelo || 'Inversor', qtd: num(i.qtd) || 1, potencia_kw: num(i.potencia_kw), extra: false }))
    : (k.inversor?.modelo ? [{ modelo: k.inversor.modelo, qtd: num(k.qtd_inversores) || 1, potencia_kw: num(k.inversor.potencia_kw), extra: false }] : [])

  let ccExtra = 0
  let caExtra = 0
  let temExtras = false
  for (const e of extras || []) {
    if (e?.secao !== 'kit_weg') continue
    const qtd = num(e.qtd) > 0 ? num(e.qtd) : 1
    const modelo = (e.modelo || e.descricao || '').trim()
    if (e.categoria === 'placa' && num(e.potencia_wp) > 0) {
      temExtras = true
      ccExtra += (qtd * num(e.potencia_wp)) / 1000
      const igual = placas.find((p) => mesmoModelo(p.modelo, modelo) && p.potencia_wp === num(e.potencia_wp))
      if (igual) igual.qtd += qtd
      else placas.push({ modelo, qtd, potencia_wp: num(e.potencia_wp), extra: true })
    } else if (e.categoria === 'inversor' && num(e.potencia_kw) > 0) {
      temExtras = true
      caExtra += qtd * num(e.potencia_kw)
      const igual = inversores.find((i) => mesmoModelo(i.modelo, modelo) && i.potencia_kw === num(e.potencia_kw))
      if (igual) igual.qtd += qtd
      else inversores.push({ modelo, qtd, potencia_kw: num(e.potencia_kw), extra: true })
    }
  }

  // Sem extras de potência: valores do kit como estão (sem arredondamento novo)
  const cc = temExtras ? num(k.potencia_cc_kwp) + ccExtra : num(k.potencia_cc_kwp)
  const ca = temExtras ? num(k.potencia_ca_kw) + caExtra : num(k.potencia_ca_kw)
  return {
    placas,
    inversores,
    qtd_placas: placas.reduce((s, p) => s + p.qtd, 0),
    potencia_cc_kwp: Math.round(cc * 1000) / 1000,
    potencia_ca_kw: Math.round(ca * 1000) / 1000,
    fci_pct: temExtras ? (ca > 0 ? (cc / ca) * 100 : 0) : num(k.fci_pct),
    tem_extras: temExtras,
  }
}
