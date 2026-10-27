// Medição coletiva — CELESC N-321.0003 (dez/2023), "Fornecimento de energia
// elétrica a edificações de uso coletivo". Kalebe 2026-10-27: "medição
// coletiva para projeto de padrão de entrada onde os disjuntores devem ser
// cadastrados separadamente por corrente e tem o disjuntor geral que deve ser
// calculado pelo sistema" — pelo método da norma, aceitando condomínio
// residencial, comercial e industrial.
//
// Demanda provável (item 5.6.2): DP = k·(D1 + D2) + De + Ds
//   k = 1,2 · D1 = F·Da (Tabelas 01 e 02) · D2 = Di + Dt + Dm (áreas comuns)
//   De = cargas especiais (100%) · Ds = comercial (Tabelas 05, 06 e 07)
// Comercial (5.6.3): por tipo de carga, sem o k. Industrial (5.6.4): critério
// do projetista → demanda informada por unidade.
// Proteção geral (5.8.7): Tabela 11 pela DP; maior que o maior disjuntor
// individual (seletividade, alínea e).
import { fmtNum } from '@/lib/formatters'
import { T01_FATOR_DIVERSIDADE, T02_AREA_INICIO, T02_DEMANDA_KVA } from './n3210003-tabelas'

/** Fator de potência fixado pela norma pra áreas comuns e ar-condicionado; usado
 *  também nas demais conversões kW → kVA (premissa, aparece no memorial). */
export const FP = 0.9
export const K_MAJORACAO = 1.2

export const LIGACOES = ['Monofásica (1F+N)', 'Bifásica (2F+N)', 'Trifásica (3F+N)'] as const
export const TIPOS_UNIDADE = ['Comercial', 'Industrial', 'Residencial'] as const   // A→Z

export interface UnidadeColetiva {
  identificacao: string
  tipo: (typeof TIPOS_UNIDADE)[number]
  ligacao: (typeof LIGACOES)[number]
  disjuntor_a: number | null
  area_m2?: number | null       // residencial (Tabela 02)
  demanda_kva?: number | null   // industrial (critério do projetista, 5.6.4)
}
export interface MotorColetiva { cv: string; fases: 'Trifásico' | 'Monofásico'; qtd: number }
export interface AtividadeComercial { atividade: string; kw: number | null }      // Tabela 05
export interface AquecimentoComercial { descricao: string; qtd: number; kw_cada: number | null }  // Tabela 06
export interface ArComercial { qtd: number; kw_cada: number | null }             // Tabela 07
export interface MedicaoColetiva {
  unidades: UnidadeColetiva[]
  condominio: { iluminacao_kw: number | null; tomadas_kw: number | null; especiais_kw: number | null; motores: MotorColetiva[] }
  comercial: { atividades: AtividadeComercial[]; aquecimento: AquecimentoComercial[]; ar: ArComercial[] }
}

// ── Tabela 04 — Demanda em kVA de motores em função da potência e quantidade (1 a 10) ──
// Transcrita como publicada (inclusive 15 CV × 4 = 33,29 e 25 CV × 10 = 103,49).
export const T04_TRIFASICOS: Record<string, readonly number[]> = {
  '1/3': [0.65, 0.98, 1.24, 1.50, 1.76, 1.95, 2.15, 2.34, 2.53, 2.73],
  '1/2': [0.87, 1.31, 1.65, 2.00, 2.35, 2.61, 2.87, 3.13, 3.39, 3.65],
  '3/4': [1.26, 1.89, 2.39, 2.90, 3.40, 3.78, 4.16, 4.54, 4.91, 5.29],
  '1': [1.52, 2.28, 2.89, 3.50, 4.10, 4.56, 5.02, 5.47, 5.93, 6.38],
  '1,5': [2.17, 3.26, 4.12, 4.99, 5.86, 6.51, 7.16, 7.81, 8.46, 9.11],
  '2': [2.70, 4.05, 5.13, 6.21, 7.29, 8.10, 8.91, 9.72, 10.53, 11.34],
  '3': [4.04, 6.06, 7.68, 9.29, 10.91, 12.12, 13.33, 14.54, 15.76, 16.97],
  '4': [5.03, 7.55, 9.56, 11.57, 13.58, 15.09, 16.60, 18.11, 19.62, 21.13],
  '5': [6.02, 9.03, 11.44, 13.85, 16.25, 18.06, 19.87, 21.67, 23.48, 25.28],
  '7,5': [8.65, 12.98, 16.44, 19.90, 23.36, 25.95, 28.55, 31.14, 33.74, 36.33],
  '10': [11.54, 17.31, 21.93, 26.54, 31.16, 34.62, 38.03, 41.54, 45.01, 48.47],
  '12,5': [14.09, 21.14, 26.77, 32.41, 38.04, 42.27, 46.50, 50.72, 54.95, 59.18],
  '15': [16.65, 24.98, 31.63, 33.29, 44.96, 49.95, 54.95, 59.94, 64.93, 69.93],
  '20': [22.10, 33.15, 41.99, 50.83, 59.67, 66.30, 72.93, 79.56, 86.19, 92.82],
  '25': [25.83, 38.75, 49.08, 59.41, 69.74, 77.49, 85.24, 92.99, 100.74, 103.49],
  '30': [30.52, 45.78, 57.99, 70.20, 82.40, 91.56, 100.72, 109.87, 119.03, 128.18],
}
export const T04_MONOFASICOS: Record<string, readonly number[]> = {
  '1/4': [0.660, 0.990, 1.254, 1.518, 1.782, 1.980, 2.178, 2.376, 2.574, 2.772],
  '1/3': [0.770, 1.155, 1.463, 1.771, 2.079, 2.310, 2.541, 2.772, 3.003, 3.234],
  '1/2': [1.180, 1.770, 2.242, 2.714, 3.186, 3.540, 3.894, 4.248, 4.602, 4.956],
  '3/4': [1.340, 2.010, 2.246, 3.032, 3.618, 4.020, 4.422, 4.824, 5.226, 5.628],
  '1': [1.560, 2.340, 2.964, 3.588, 4.212, 4.680, 5.148, 5.616, 6.084, 6.552],
  '1,5': [2.350, 3.525, 4.465, 5.405, 6.345, 7.050, 7.755, 8.460, 9.165, 9.870],
  '2': [2.970, 4.455, 5.643, 6.831, 8.019, 8.910, 9.801, 10.692, 11.583, 12.474],
  '3': [4.070, 6.105, 7.733, 9.361, 10.989, 12.210, 13.431, 14.652, 15.873, 17.094],
  '5': [6.160, 9.240, 11.704, 14.168, 16.632, 18.480, 20.328, 22.176, 24.024, 25.872],
}

// ── Tabela 05 — Fatores de demanda pra iluminação e tomadas de uso geral ──
// faixas: [até X kW, fator]; a última vale pro que exceder.
export const T05_ATIVIDADES: readonly { id: string; nome: string; faixas: readonly [number, number][] }[] = [
  { id: 'auditorios', nome: 'Auditórios, salões para exposições e semelhantes', faixas: [[Infinity, 0.9]] },
  { id: 'bancos_lojas', nome: 'Bancos, lojas e semelhantes', faixas: [[Infinity, 0.75]] },
  { id: 'barbearias', nome: 'Barbearias, salões de beleza e semelhantes', faixas: [[Infinity, 0.9]] },
  { id: 'clubes', nome: 'Clubes e semelhantes', faixas: [[Infinity, 0.9]] },
  { id: 'escolas', nome: 'Escolas e semelhantes', faixas: [[12, 0.9], [Infinity, 0.5]] },
  { id: 'escritorios', nome: 'Escritórios e semelhantes', faixas: [[20, 0.9], [Infinity, 0.7]] },
  { id: 'garagens', nome: 'Garagens comerciais e semelhantes', faixas: [[Infinity, 0.9]] },
  { id: 'hospitais', nome: 'Hospitais, clínicas e semelhantes', faixas: [[50, 0.4], [Infinity, 0.2]] },
  { id: 'hoteis', nome: 'Hotéis e semelhantes', faixas: [[20, 0.6], [Infinity, 0.4]] },
  { id: 'igrejas', nome: 'Igrejas e semelhantes', faixas: [[Infinity, 0.9]] },
  { id: 'restaurantes', nome: 'Restaurantes e semelhantes', faixas: [[Infinity, 0.9]] },
]

// ── Tabela 06 — aquecimento (por tipo de aparelho): [até N aparelhos, fator] ──
const T06: readonly [number, number][] = [
  [1, 1], [2, 0.65], [3, 0.55], [4, 0.5], [5, 0.45], [6, 0.43], [7, 0.4], [8, 0.36], [9, 0.35], [10, 0.34],
  [15, 0.32], [20, 0.28], [25, 0.27], [30, 0.26], [40, 0.25], [50, 0.24], [60, 0.23], [Infinity, 0.2],
]
// ── Tabela 07 — ar-condicionado (total de aparelhos): [até N, fator] ──
const T07: readonly [number, number][] = [
  [10, 1], [20, 0.9], [30, 0.82], [40, 0.8], [50, 0.77], [75, 0.75], [100, 0.72], [Infinity, 0.7],
]

// ── Tabela 11 — Proteção geral e ramais pela demanda provável (kVA) ──
export interface LinhaT11 {
  ate_kva: number; disjuntor_a: number
  aereo_cobre: string; aereo_aluminio: string
  entrada_cobre: string; entrada_eletroduto: string
  sub_cobre: string; sub_eletroduto: string
}
const L = (ate_kva: number, disjuntor_a: number, aereo_cobre: string, aereo_aluminio: string,
  entrada_cobre: string, entrada_eletroduto: string, sub_cobre: string, sub_eletroduto: string): LinhaT11 =>
  ({ ate_kva, disjuntor_a, aereo_cobre, aereo_aluminio, entrada_cobre, entrada_eletroduto, sub_cobre, sub_eletroduto })
export const T11: readonly LinhaT11[] = [
  L(30, 50, '10', '16', '10', '1 1/2', '10', '1 1/2'),
  L(36, 63, '16', '16', '10', '1 1/2', '16', '1 1/2'),
  L(45, 70, '16', '25', '16', '1 1/2', '16', '1 1/2'),
  L(52, 80, '25', '25', '16', '1 1/2', '25', '2'),
  L(58, 90, '25', '35', '25', '2', '25', '2'),
  L(65, 100, '25', '35', '25', '2', '35', '2'),
  L(78, 125, '35', '50', '35', '2', '50', '3'),
  L(95, 150, '50', '70', '50', '3', '70', '3'),
  L(112, 175, '70', '120', '70', '3', '95', '3'),
  L(131, 200, '70', '120', '70', '3', '95', '3'),
  L(145, 225, '—', '120', '95', '3', '120', '4'),
  L(160, 250, '—', '—', '95', '3', '150', '4'),
  L(195, 300, '—', '—', '150', '4', '2 x 95', '2 x 3'),
  L(225, 350, '—', '—', '2 x 95', '2 x 3', '2 x 120', '2 x 4'),
  L(260, 400, '—', '—', '2 x 95', '2 x 3', '2 x 150', '2 x 4'),
  L(300, 450, '—', '—', '2 x 120', '2 x 4', '2 x 185', '2 x 4'),
]

const fator = (tabela: readonly [number, number][], n: number) => tabela.find(([ate]) => n <= ate)![1]
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }

/** Demanda por unidade em função da área útil (Tabela 02 + notas do item 5.6.2). */
export function demandaPorArea(areaM2: number): number {
  if (areaM2 <= 70) return 1.57
  if (areaM2 > 400) return 0.034939 * Math.pow(areaM2, 0.895075)
  return T02_DEMANDA_KVA[Math.ceil(areaM2) - T02_AREA_INICIO]   // área quebrada: linha de cima (a favor da segurança)
}

/** Demanda de iluminação/tomadas de uma atividade comercial (Tabela 05), em kW. */
export function demandaAtividadeKw(id: string, kw: number): number {
  const a = T05_ATIVIDADES.find((x) => x.id === id)
  if (!a) return kw
  let resto = kw, base = 0, total = 0
  for (const [ate, f] of a.faixas) {
    const faixa = Math.min(resto, ate - base)
    total += faixa * f
    resto -= faixa
    base = ate
    if (resto <= 0) break
  }
  return total
}

export interface ResultadoColetiva {
  n_unidades: number; n_residenciais: number; n_comerciais: number; n_industriais: number
  area_media: number | null; F: number | null; Da: number | null; D1: number
  Di: number; Dt: number; Dm: number; D2: number; De: number; Ds: number; Dind: number
  com_k: boolean; dp_kva: number
  maior_individual: number | null
  disjuntor_tabela: number | null; disjuntor_a: number | null; por_seletividade: boolean
  linha: LinhaT11 | null
  avisos: string[]          // o que impede o cálculo ou precisa de atenção
  memorial: string[]        // passo a passo pro projeto (5.6.1.3)
}

/** Demanda provável e disjuntor geral pela N-321.0003. Função pura. */
export function calcularColetiva(m: MedicaoColetiva): ResultadoColetiva {
  const avisos: string[] = []
  const memorial: string[] = []
  const f2 = (v: number) => fmtNum(v, 2)
  const unidades = m.unidades || []
  const res = unidades.filter((u) => u.tipo === 'Residencial')
  const com = unidades.filter((u) => u.tipo === 'Comercial')
  const ind = unidades.filter((u) => u.tipo === 'Industrial')

  if (unidades.length < 2) avisos.push('Medição coletiva precisa de pelo menos 2 relógios (unidades consumidoras).')
  unidades.forEach((u, i) => {
    if (!num(u.disjuntor_a)) avisos.push(`Informe o disjuntor da unidade ${u.identificacao || i + 1}.`)
    if (u.tipo === 'Residencial' && !num(u.area_m2)) avisos.push(`Informe a área útil da unidade ${u.identificacao || i + 1} (residencial).`)
    if (u.tipo === 'Industrial' && !num(u.demanda_kva)) avisos.push(`Informe a demanda (kVA) da unidade industrial ${u.identificacao || i + 1} — critério do projetista (5.6.4).`)
  })

  // D1 — residenciais (Tabelas 01 e 02)
  let area_media: number | null = null, F: number | null = null, Da: number | null = null, D1 = 0
  if (res.length) {
    const areas = res.map((u) => num(u.area_m2)).filter(Boolean)
    if (areas.length === res.length) {
      area_media = areas.reduce((s, a) => s + a, 0) / areas.length
      Da = demandaPorArea(area_media)
      if (res.length > 300) avisos.push('Mais de 300 unidades residenciais: a Tabela 01 vai até 300 — calcule à parte.')
      else {
        F = T01_FATOR_DIVERSIDADE[res.length]
        D1 = F * Da
        memorial.push(`D1 (residencial) = F × Da = ${f2(F)} (Tabela 01, ${res.length} unidades) × ${f2(Da)} kVA (Tabela 02, área média ${f2(area_media)} m²${area_media <= 70 ? ' — até 70 m²' : area_media > 400 ? ' — fórmula da nota 1' : ''}) = ${f2(D1)} kVA`)
      }
    }
  }

  // D2 — áreas comuns (condomínio/serviço)
  const c = m.condominio || { iluminacao_kw: null, tomadas_kw: null, especiais_kw: null, motores: [] }
  const ilum = num(c.iluminacao_kw), tom = num(c.tomadas_kw)
  const Di = (Math.min(ilum, 10) + 0.25 * Math.max(ilum - 10, 0)) / FP
  const Dt = (0.2 * tom) / FP
  let Dm = 0
  for (const mo of c.motores || []) {
    const tab = mo.fases === 'Monofásico' ? T04_MONOFASICOS : T04_TRIFASICOS
    const linha = tab[mo.cv]
    const q = Math.round(num(mo.qtd))
    if (!linha) { avisos.push(`Motor de ${mo.cv} CV ${mo.fases.toLowerCase()} não está na Tabela 04.`); continue }
    if (q < 1) continue
    if (q > 10) { avisos.push(`${q} motores de ${mo.cv} CV: a Tabela 04 vai até 10 motores iguais — calcule à parte.`); continue }
    Dm += linha[q - 1]
    memorial.push(`Motores: ${q} × ${mo.cv} CV ${mo.fases.toLowerCase()} = ${f2(linha[q - 1])} kVA (Tabela 04)`)
  }
  const D2 = Di + Dt + Dm
  if (ilum) memorial.push(`Di (iluminação comum) = (100% dos primeiros 10 kW + 25% do excedente) ÷ FP 0,90 = ${f2(Di)} kVA`)
  if (tom) memorial.push(`Dt (tomadas comuns) = 20% × ${f2(tom)} kW ÷ FP 0,90 = ${f2(Dt)} kVA`)
  if (D2) memorial.push(`D2 (condomínio) = Di + Dt + Dm = ${f2(D2)} kVA`)

  // De — cargas especiais (100%)
  const De = num(c.especiais_kw) / FP
  if (De) memorial.push(`De (cargas especiais, 100%) = ${f2(num(c.especiais_kw))} kW ÷ FP 0,90 = ${f2(De)} kVA`)

  // Ds — comercial (Tabelas 05, 06, 07)
  const cm = m.comercial || { atividades: [], aquecimento: [], ar: [] }
  let dsKw = 0
  const porAtividade = new Map<string, number>()
  for (const a of cm.atividades || []) porAtividade.set(a.atividade, (porAtividade.get(a.atividade) || 0) + num(a.kw))
  for (const [id, kw] of porAtividade) {
    if (!kw) continue
    const d = demandaAtividadeKw(id, kw)
    dsKw += d
    memorial.push(`Iluminação/tomadas — ${T05_ATIVIDADES.find((x) => x.id === id)?.nome || id}: ${f2(kw)} kW → ${f2(d)} kW (Tabela 05)`)
  }
  for (const aq of cm.aquecimento || []) {
    const q = Math.round(num(aq.qtd)), kw = num(aq.kw_cada)
    if (!q || !kw) continue
    const f = fator(T06, q), d = q * kw * f
    dsKw += d
    memorial.push(`Aquecimento — ${aq.descricao || 'aparelho'}: ${q} × ${f2(kw)} kW × ${fmtNum(f * 100, 0)}% (Tabela 06) = ${f2(d)} kW`)
  }
  const arQtd = (cm.ar || []).reduce((s, a) => s + Math.round(num(a.qtd)), 0)
  const arKw = (cm.ar || []).reduce((s, a) => s + Math.round(num(a.qtd)) * num(a.kw_cada), 0)
  if (arQtd && arKw) {
    const f = fator(T07, arQtd), d = arKw * f
    dsKw += d
    memorial.push(`Ar-condicionado: ${arQtd} aparelhos, ${f2(arKw)} kW × ${fmtNum(f * 100, 0)}% (Tabela 07) = ${f2(d)} kW`)
  }
  const Ds = dsKw / FP
  if (Ds) memorial.push(`Ds (comercial) = ${f2(dsKw)} kW ÷ FP 0,90 = ${f2(Ds)} kVA`)
  if (com.length && !Ds) avisos.push('Há unidades comerciais: informe as cargas (atividade, aquecimento, ar-condicionado) para a Ds.')

  // Industrial — critério do projetista (5.6.4)
  const Dind = ind.reduce((s, u) => s + num(u.demanda_kva), 0)
  if (Dind) memorial.push(`Industrial (critério do projetista, 5.6.4) = ${f2(Dind)} kVA`)

  const com_k = res.length > 0
  const dp_kva = (com_k ? K_MAJORACAO * (D1 + D2) : D2) + De + Ds + Dind
  memorial.push(com_k
    ? `DP = 1,2 × (D1 + D2) + De + Ds${Dind ? ' + industrial' : ''} = 1,2 × (${f2(D1)} + ${f2(D2)}) + ${f2(De)} + ${f2(Ds)}${Dind ? ` + ${f2(Dind)}` : ''} = ${f2(dp_kva)} kVA`
    : `DP = D2 + De + Ds${Dind ? ' + industrial' : ''} (sem unidade residencial: soma por tipo de carga, 5.6.3) = ${f2(dp_kva)} kVA`)

  // Proteção geral — Tabela 11 + seletividade
  const individuais = unidades.map((u) => num(u.disjuntor_a)).filter(Boolean)
  const maior_individual = individuais.length ? Math.max(...individuais) : null
  let linha: LinhaT11 | null = null, disjuntor_tabela: number | null = null, por_seletividade = false
  if (dp_kva > 300) {
    avisos.push('Demanda provável acima de 300 kVA: fora da Tabela 11 — disjuntor ajustável até 800 A (item 5.8.7 f) ou atendimento em média tensão; dimensionar à parte.')
  } else if (dp_kva > 0) {
    linha = T11.find((l) => dp_kva <= l.ate_kva) || null
    disjuntor_tabela = linha?.disjuntor_a ?? null
    if (linha && maior_individual && linha.disjuntor_a <= maior_individual) {
      const acima = T11.find((l) => l.disjuntor_a > maior_individual)
      if (acima) { linha = acima; por_seletividade = true }
      else { linha = null; avisos.push(`O maior disjuntor individual (${maior_individual} A) passa da Tabela 11 — dimensionar à parte.`) }
    }
    if (linha) memorial.push(`Proteção geral: ${linha.disjuntor_a} A tripolar (Tabela 11${por_seletividade ? `; ${disjuntor_tabela} A pela demanda, aumentado pra ficar acima do maior individual de ${maior_individual} A — seletividade, item 5.8.7 e` : ''})`)
  }
  const bloqueia = avisos.some((a) => /informe|pelo menos 2|à parte/i.test(a))
  return {
    n_unidades: unidades.length, n_residenciais: res.length, n_comerciais: com.length, n_industriais: ind.length,
    area_media, F, Da, D1, Di, Dt, Dm, D2, De, Ds, Dind, com_k, dp_kva,
    maior_individual, disjuntor_tabela,
    disjuntor_a: bloqueia ? null : linha?.disjuntor_a ?? null,
    por_seletividade, linha: bloqueia ? null : linha, avisos, memorial,
  }
}

/** Limpa o valor vindo do formulário/banco (o resto é descartado). */
export function medicaoColetiva(v: unknown): MedicaoColetiva | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, any>
  const n = (x: unknown) => { const k = Number(x); return Number.isFinite(k) && k > 0 ? Math.round(k * 100) / 100 : null }
  const t = (x: unknown, max = 80) => String(x ?? '').trim().slice(0, max)
  const de = <T,>(lista: unknown, f: (x: Record<string, any>) => T | null, max = 400): T[] =>
    (Array.isArray(lista) ? lista : []).slice(0, max).flatMap((x) => (x && typeof x === 'object' ? [f(x)].filter((y): y is T => y !== null) : []))
  const unidades = de<UnidadeColetiva>(o.unidades, (u) => ({
    identificacao: t(u.identificacao, 60),
    tipo: (TIPOS_UNIDADE as readonly string[]).includes(u.tipo) ? u.tipo : 'Residencial',
    ligacao: (LIGACOES as readonly string[]).includes(u.ligacao) ? u.ligacao : 'Monofásica (1F+N)',
    disjuntor_a: n(u.disjuntor_a),
    area_m2: n(u.area_m2),
    demanda_kva: n(u.demanda_kva),
  }))
  const c = o.condominio && typeof o.condominio === 'object' ? o.condominio : {}
  const cm = o.comercial && typeof o.comercial === 'object' ? o.comercial : {}
  return {
    unidades,
    condominio: {
      iluminacao_kw: n(c.iluminacao_kw), tomadas_kw: n(c.tomadas_kw), especiais_kw: n(c.especiais_kw),
      motores: de<MotorColetiva>(c.motores, (x) => ({ cv: t(x.cv, 5), fases: x.fases === 'Monofásico' ? 'Monofásico' : 'Trifásico', qtd: Math.max(1, Math.round(Number(x.qtd) || 1)) }), 40),
    },
    comercial: {
      atividades: de<AtividadeComercial>(cm.atividades, (x) => ({ atividade: t(x.atividade, 30), kw: n(x.kw) }), 40),
      aquecimento: de<AquecimentoComercial>(cm.aquecimento, (x) => ({ descricao: t(x.descricao, 60), qtd: Math.max(1, Math.round(Number(x.qtd) || 1)), kw_cada: n(x.kw_cada) }), 40),
      ar: de<ArComercial>(cm.ar, (x) => ({ qtd: Math.max(1, Math.round(Number(x.qtd) || 1)), kw_cada: n(x.kw_cada) }), 40),
    },
  }
}

export const coletivaVazia = (): MedicaoColetiva => ({
  unidades: [],
  condominio: { iluminacao_kw: null, tomadas_kw: null, especiais_kw: null, motores: [] },
  comercial: { atividades: [], aquecimento: [], ar: [] },
})

/** Texto pro relatório/detalhe: unidades + memorial + resultado. */
export function textoColetiva(m: MedicaoColetiva): string {
  const r = calcularColetiva(m)
  const unid = m.unidades.map((u) => `${u.identificacao || 'unidade'} — ${u.tipo.toLowerCase()}, ${u.ligacao}, disjuntor ${u.disjuntor_a ? `${fmtNum(u.disjuntor_a, 0)} A` : 'a informar'}`
    + (u.tipo === 'Residencial' && u.area_m2 ? `, ${fmtNum(u.area_m2, 2)} m²` : '')
    + (u.tipo === 'Industrial' && u.demanda_kva ? `, ${fmtNum(u.demanda_kva, 2)} kVA` : ''))
  const linhas = [
    `${r.n_unidades} unidades (${r.n_residenciais} residenciais, ${r.n_comerciais} comerciais, ${r.n_industriais} industriais) — N-321.0003`,
    ...unid.map((u) => `  • ${u}`),
    ...r.memorial.map((x) => `  ${x}`),
    r.disjuntor_a && r.linha
      ? `  DISJUNTOR GERAL: ${r.disjuntor_a} A tripolar · ramal aéreo multiplexado ${r.linha.aereo_cobre} mm² Cu / ${r.linha.aereo_aluminio} mm² Al · entrada embutida ${r.linha.entrada_cobre} mm² Cu, eletroduto ${r.linha.entrada_eletroduto}" · subterrânea ${r.linha.sub_cobre} mm² Cu, eletroduto ${r.linha.sub_eletroduto}" (Tabela 11)`
      : '  DISJUNTOR GERAL: A PREENCHER (faltam dados)',
    ...r.avisos.map((a) => `  ⚠ ${a}`),
  ]
  return linhas.join('\n')
}
