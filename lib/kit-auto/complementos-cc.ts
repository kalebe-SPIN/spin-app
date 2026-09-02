/**
 * Dimensiona e precifica os COMPLEMENTOS CC do kit WEG a partir do
 * catálogo de produtos: cabo solar, estrutura, MC4, disjuntor CA, DPS CA.
 *
 * Extraído de app/projetos/[id]/kit/actions.ts em 2026-09-02 pra permitir
 * chamada on-demand da /orcamento (auto-regenera snapshots vazios sem
 * exigir que o admin clique em "Regerar composição").
 *
 * Regras Spin já embutidas:
 *  - Cabo 6mm² · micro: 25m fixo · string: distancia_qgbt × totalMPPT
 *  - Estrutura: qtd = módulos ÷ N (N do modelo, default 4); prefere "kit"
 *    e cota pelo maior preço vigente da categoria
 *  - MC4: 1 par por entrada MPPT total
 *  - Disjuntor CA: 1 por modelo de inversor, agrupa qtd; usa
 *    specs.disjuntor_equivalente do projetista quando existe, senão
 *    dimensiona por corrente (I × 1,15 → escala IEC)
 *  - DPS CA: (num_fases_QGBT + 1) por sistema, classe II 20kA
 *  - Todos os matches são normalizados (remove hífens/espaços/acentos)
 */

export type FaseInvKit = 'monofasico' | 'bifasico' | 'trifasico' | undefined

export type EntradaComplementosCC = {
  qtd_placas: number
  tipo_telhado: string | null
  distancia_string_qgbt_m: number
  inversores: Array<{
    id?: string
    modelo: string
    potencia_kw: number
    fases?: FaseInvKit
    qtd: number
  }>
  tipo_ligacao_cliente: string
}

export type ItemComplementoCC = {
  categoria: 'cabo_cc' | 'estrutura' | 'conector' | 'disjuntor' | 'dps'
  modelo: string
  qtd: number
  unidade: string
  preco_unitario: number
  subtotal: number
}

export async function precificarComplementosCC(
  supabase: any,
  entrada: EntradaComplementosCC,
): Promise<{ total: number; itens: ItemComplementoCC[]; avisos: string[] }> {
  const avisos: string[] = []
  const itens: ItemComplementoCC[] = []
  const hojeIso = new Date().toISOString().slice(0, 10)

  // Pré-cálculo: specs dos inversores (entradas_mppt + micro flag)
  const idsInversores = entrada.inversores.map(i => i.id).filter(Boolean) as string[]
  const specsInversores: Record<string, any> = {}
  if (idsInversores.length > 0) {
    const { data: prodsInv } = await supabase
      .from('produtos').select('id, specs').in('id', idsInversores)
    for (const p of (prodsInv || [])) specsInversores[p.id] = p.specs || {}
  }

  let totalEntradasMppt = 0
  for (const inv of entrada.inversores) {
    const mpptSpec = inv.id ? Number(specsInversores[inv.id]?.entradas_mppt) : NaN
    const mppt = Number.isFinite(mpptSpec) && mpptSpec > 0 ? mpptSpec : 1
    totalEntradasMppt += mppt * (inv.qtd || 0)
  }
  const ehMicroinversor = entrada.inversores.length > 0
    && entrada.inversores.every(x => /^SIW100/i.test(x.modelo || ''))

  // 1. Cabo solar 6mm²
  const distEfetiva = entrada.distancia_string_qgbt_m > 0 ? entrada.distancia_string_qgbt_m : 20
  const metrosCabo = ehMicroinversor
    ? 25
    : Math.ceil(distEfetiva * Math.max(1, totalEntradasMppt))
  const memoriaCabo = ehMicroinversor
    ? '25m fixo (microinversor)'
    : `${distEfetiva}m × ${Math.max(1, totalEntradasMppt)} entradas MPPT`
  // Kalebe 2026-09-02: 1ª tentativa cabo_cc/cabo, fallback cabo_ca com 6mm
  // (planilha WEG traz o cabo solar HEPR 6mm² cadastrado em cabo_ca).
  let cabo = await buscarProdutoComPreco(supabase, hojeIso, {
    categorias: ['cabo_cc', 'cabo'],
    contem: ['6mm'],
  })
  if (!cabo.ok) {
    cabo = await buscarProdutoComPreco(supabase, hojeIso, {
      categorias: ['cabo_ca'],
      contem: ['6mm', 'solar'],
    })
  }
  if (!cabo.ok) {
    cabo = await buscarProdutoComPreco(supabase, hojeIso, {
      categorias: ['cabo_ca'],
      contem: ['6mm'],
    })
  }
  itens.push({
    categoria: 'cabo_cc',
    modelo: cabo.ok
      ? `${cabo.modelo} · ${memoriaCabo}`
      : `Cabo solar 6mm² · ${memoriaCabo} · ⚠ não cadastrado`,
    qtd: metrosCabo, unidade: 'm',
    preco_unitario: cabo.ok ? cabo.preco : 0,
    subtotal: cabo.ok ? metrosCabo * cabo.preco : 0,
  })
  if (!cabo.ok) avisos.push(`Cabo solar (${metrosCabo}m) — ${cabo.motivo}`)

  // 2. Estrutura
  const tipo = String(entrada.tipo_telhado || '').toLowerCase()
  let contemEstrut: string[] = []
  if (/fibro/.test(tipo)) contemEstrut = ['fibro']
  else if (/metal|zinco|alumin/.test(tipo)) contemEstrut = ['metal']
  else if (/ceram|barro|colonial/.test(tipo)) contemEstrut = ['ceram']
  else if (/laje|concreto/.test(tipo)) contemEstrut = ['laje']
  let estrutura = await buscarProdutoComPreco(supabase, hojeIso, {
    categorias: ['estrutura'],
    contem: [...contemEstrut, 'kit'],
    pegarMaiorPreco: true,
  })
  if (!estrutura.ok) {
    estrutura = await buscarProdutoComPreco(supabase, hojeIso, {
      categorias: ['estrutura'],
      contem: contemEstrut,
      pegarMaiorPreco: true,
    })
  }
  const matchModulos = estrutura.ok ? String(estrutura.modelo).match(/p\/\s*(\d+)\s*m[oó]dulos?/i) : null
  const modulosPorKit = matchModulos ? Number(matchModulos[1]) : 4
  const qtdKitsEstrutura = Math.ceil(entrada.qtd_placas / modulosPorKit)
  itens.push({
    categoria: 'estrutura',
    modelo: estrutura.ok
      ? `${estrutura.modelo} · ${entrada.qtd_placas} módulos ÷ ${modulosPorKit}`
      : `Estrutura ${contemEstrut[0] || 'genérica'} · ${entrada.qtd_placas} módulos ÷ ${modulosPorKit} · ⚠ não cadastrado`,
    qtd: qtdKitsEstrutura, unidade: 'kit',
    preco_unitario: estrutura.ok ? estrutura.preco : 0,
    subtotal: estrutura.ok ? qtdKitsEstrutura * estrutura.preco : 0,
  })
  if (!estrutura.ok) avisos.push(`Estrutura (${qtdKitsEstrutura} kit) — ${estrutura.motivo}`)

  // 3. MC4
  const qtdMc4 = Math.max(1, totalEntradasMppt)
  const memoriaMc4 = `${qtdMc4} par(es) = ${totalEntradasMppt} entradas MPPT`
  const mc4 = await buscarProdutoComPreco(supabase, hojeIso, {
    categorias: ['conector'],
    contem: ['mc4'],
  })
  itens.push({
    categoria: 'conector',
    modelo: mc4.ok
      ? `${mc4.modelo} · ${memoriaMc4}`
      : `Conector MC4 · ${memoriaMc4} · ⚠ não cadastrado`,
    qtd: qtdMc4, unidade: 'par',
    preco_unitario: mc4.ok ? mc4.preco : 0,
    subtotal: mc4.ok ? qtdMc4 * mc4.preco : 0,
  })
  if (!mc4.ok) avisos.push(`Conector MC4 (${qtdMc4} par) — ${mc4.motivo}`)

  // 4. Disjuntor CA
  type GrupoDisj = { ref?: string; in_a: number; polos: number; qtd: number; modeloInv: string }
  const grupos = new Map<string, GrupoDisj>()
  for (const inv of entrada.inversores) {
    const fases: FaseInvKit = inv.fases || inferirFasesDoModelo(inv.modelo) || (entrada.tipo_ligacao_cliente as FaseInvKit)
    const { in_a, polos } = calcularInDisjuntor(inv.potencia_kw, fases || 'monofasico')
    const refProjetista = inv.id ? String(specsInversores[inv.id]?.disjuntor_equivalente || '').trim() : ''
    const chave = refProjetista ? `ref:${refProjetista.toLowerCase()}` : `calc:${in_a}A-${polos}P`
    const existente = grupos.get(chave)
    if (existente) existente.qtd += inv.qtd
    else grupos.set(chave, { ref: refProjetista || undefined, in_a, polos, qtd: inv.qtd, modeloInv: inv.modelo })
  }
  for (const [, g] of grupos) {
    let disj: { ok: true; modelo: string; preco: number } | { ok: false; motivo: string } | null = null
    if (g.ref) {
      const porRef = await buscarProdutoPorRef(supabase, g.ref, hojeIso, ['disjuntor'])
      if (porRef.ok) disj = { ...porRef, modelo: `${porRef.modelo} · ref. projetista` }
    }
    if (!disj || !disj.ok) {
      disj = await buscarDisjuntorCompativel(supabase, g.in_a, g.polos, hojeIso)
    }
    const rotulo = g.ref ? `Disjuntor ${g.ref} (ref. projetista)` : `Disjuntor ${g.in_a}A ${g.polos}P`
    itens.push({
      categoria: 'disjuntor',
      modelo: disj.ok ? disj.modelo : `${rotulo} · ${g.modeloInv} · ⚠ não cadastrado`,
      qtd: g.qtd, unidade: 'un',
      preco_unitario: disj.ok ? disj.preco : 0,
      subtotal: disj.ok ? g.qtd * disj.preco : 0,
    })
    if (!disj.ok) avisos.push(`${rotulo} (${g.modeloInv}, ${g.qtd} un) — ${disj.motivo}`)
  }

  // 5. DPS CA
  if (entrada.inversores.length > 0) {
    const numFasesQgbt = fasesDoTipoLigacao(entrada.tipo_ligacao_cliente)
    const qtdDps = numFasesQgbt + 1
    const refsDps = Array.from(new Set(
      entrada.inversores
        .map(i => i.id ? String(specsInversores[i.id]?.dps_equivalente || '').trim() : '')
        .filter(Boolean),
    ))
    let dps: { ok: true; modelo: string; preco: number } | { ok: false; motivo: string } | null = null
    if (refsDps.length > 0) {
      for (const ref of refsDps) {
        const porRef = await buscarProdutoPorRef(supabase, ref, hojeIso, ['dps', 'protecao'])
        if (porRef.ok) { dps = { ...porRef, modelo: `${porRef.modelo} · ref. projetista` }; break }
      }
    }
    if (!dps || !dps.ok) {
      dps = await buscarProdutoComPreco(supabase, hojeIso, {
        categorias: ['dps', 'protecao'],
        pegarMaiorPreco: true,
      })
    }
    // Kalebe 2026-09-02: fallback por PALAVRA-CHAVE em qualquer categoria —
    // se o DPS foi cadastrado com categoria='outro' (comum na planilha WEG),
    // não perde o preço só porque a categoria está errada.
    if (!dps || !dps.ok) {
      dps = await buscarProdutoPorNome(supabase, hojeIso, ['dps', 'clamper', 'spd'], /kvar|capacit|reativ/i)
    }
    itens.push({
      categoria: 'dps',
      modelo: dps.ok ? dps.modelo : `DPS CA · classe II 20kA · ⚠ não cadastrado`,
      qtd: qtdDps, unidade: 'un',
      preco_unitario: dps.ok ? dps.preco : 0,
      subtotal: dps.ok ? qtdDps * dps.preco : 0,
    })
    if (!dps.ok) avisos.push(`DPS CA (${qtdDps} un) — ${dps.motivo}`)
  }

  const total = itens.reduce((s, x) => s + x.subtotal, 0)
  return { total, itens, avisos }
}

// ─── Helpers internos ─────────────────────────────────────────────────

type BuscaResult =
  | { ok: true; id: string; modelo: string; preco: number }
  | { ok: false; motivo: string }

async function buscarProdutoComPreco(
  supabase: any,
  hojeIso: string,
  filtro: {
    categorias: string[]
    contem?: string[]
    pegarMaiorPreco?: boolean
  },
): Promise<BuscaResult> {
  const { data: ativos } = await supabase
    .from('produtos')
    .select('id, modelo, subcategoria, categoria, descricao_curta')
    .in('categoria', filtro.categorias)
    .eq('ativo', true)
    .limit(500)
  const listaAtivos = (ativos || []) as any[]

  let usandoInativos = false
  let lista = listaAtivos
  if (listaAtivos.length === 0) {
    const { data: inativos } = await supabase
      .from('produtos')
      .select('id, modelo, subcategoria, categoria, descricao_curta')
      .in('categoria', filtro.categorias)
      .eq('ativo', false)
      .limit(500)
    const listaInativos = (inativos || []) as any[]
    if (listaInativos.length === 0) {
      const filtroContem = (filtro.contem || []).join(' ') || filtro.categorias[0]
      const { data: parecidos } = await supabase
        .from('produtos')
        .select('categoria')
        .ilike('modelo', `%${filtroContem}%`)
        .limit(20)
      const catsExistentes = Array.from(new Set((parecidos || []).map((p: any) => p.categoria))).filter(Boolean)
      const dica = catsExistentes.length > 0
        ? ` (achei "${filtroContem}" em categoria: ${catsExistentes.slice(0, 3).join(', ')})`
        : ''
      return {
        ok: false,
        motivo: `zero produtos na categoria ${filtro.categorias.join('/')}${dica} — cadastre em /admin/catalogo`,
      }
    }
    lista = listaInativos
    usandoInativos = true
  }

  const normalizar = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const preferidos = lista.filter((p: any) => {
    const alvo = normalizar(`${p.modelo || ''} ${p.subcategoria || ''} ${p.descricao_curta || ''}`)
    return !filtro.contem || filtro.contem.every((k) => alvo.includes(normalizar(k)))
  })
  const candidatos = preferidos.length > 0 ? preferidos : lista

  const cotacoes: Array<{ id: string; modelo: string; preco: number }> = []
  for (const escolhido of candidatos) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', escolhido.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco > 0) {
      const modelo = usandoInativos ? `${escolhido.modelo} (inativo)` : escolhido.modelo
      if (!filtro.pegarMaiorPreco) return { ok: true, id: escolhido.id, modelo, preco }
      cotacoes.push({ id: escolhido.id, modelo, preco })
    }
  }
  if (cotacoes.length > 0) {
    const escolhida = cotacoes.reduce((a, b) => (a.preco >= b.preco ? a : b))
    return { ok: true, ...escolhida }
  }

  // Fallback: qualquer preço, mesmo vencido
  const cotacoesVencidas: Array<{ id: string; modelo: string; preco: number }> = []
  for (const escolhido of candidatos) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', escolhido.id)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco > 0) {
      const suffixInat = usandoInativos ? ' (inativo)' : ''
      const modelo = `${escolhido.modelo}${suffixInat} · ⚠ preço vencido`
      if (!filtro.pegarMaiorPreco) return { ok: true, id: escolhido.id, modelo, preco }
      cotacoesVencidas.push({ id: escolhido.id, modelo, preco })
    }
  }
  if (cotacoesVencidas.length > 0) {
    const escolhida = cotacoesVencidas.reduce((a, b) => (a.preco >= b.preco ? a : b))
    return { ok: true, ...escolhida }
  }

  const detalhes = `${candidatos.length} produto(s) encontrado(s) mas SEM preço em precos_produtos`
  if (usandoInativos) return { ok: false, motivo: `só produtos INATIVOS na categoria + ${detalhes}` }
  return { ok: false, motivo: detalhes }
}

/** Regex "não é disjuntor real" — bate capacitor, banco reativo, TCP,
 *  BSMJ etc. Kalebe 2026-09-02: agora tb bate CAPACIT/KVAR/BANCO/REATIV
 *  no NOME do produto retornado (não só no termo de entrada), pra
 *  cortar produto cadastrado com nome comercial fora do prefixo. */
const REGEX_LIXO_DISJUNTOR = /^(BC|TCP|BSMJ|CAP|BFR|BFC|BCF)/i
const REGEX_LIXO_MODELO = /capacit|kvar|banco|reativ|contator|rele\s*termic/i

export async function buscarProdutoPorRef(
  supabase: any,
  ref: string,
  hojeIso: string,
  categoriasAceitas?: string[],
): Promise<{ ok: true; modelo: string; preco: number } | { ok: false; motivo: string }> {
  const termo = ref.trim()
  if (!termo) return { ok: false, motivo: 'referência vazia' }
  if (REGEX_LIXO_DISJUNTOR.test(termo) || REGEX_LIXO_MODELO.test(termo)) {
    return { ok: false, motivo: `referência '${termo}' parece capacitor/banco reativo — ignorada` }
  }
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const termoNorm = norm(termo)
  const { data: prods } = await supabase
    .from('produtos')
    .select('id, modelo, codigo_weg, ativo, categoria, descricao_curta')
    .or(`modelo.ilike.%${termo}%,codigo_weg.ilike.%${termo}%`)
    .order('ativo', { ascending: false })
    .limit(200)
  const listaCompleta = (prods || []) as any[]
  const listaBruta = listaCompleta.filter((p: any) => {
    const alvo = norm(`${p.modelo || ''} ${p.codigo_weg || ''} ${p.descricao_curta || ''}`)
    return alvo.includes(termoNorm)
  })
  // Kalebe 2026-09-02: filtra CAPACITOR/KVAR mesmo se produto foi
  // cadastrado com categoria='disjuntor' por engano (é o caso da
  // planilha WEG que traz BCWA30V53 na aba de disjuntores).
  const listaSemLixo = listaBruta.filter((p: any) => {
    const modelo = String(p.modelo || '')
    const desc = String(p.descricao_curta || '')
    if (REGEX_LIXO_DISJUNTOR.test(modelo)) return false
    if (REGEX_LIXO_MODELO.test(modelo)) return false
    if (REGEX_LIXO_MODELO.test(desc)) return false
    return true
  })
  // Kalebe 2026-09-02: se caller passou categoriasAceitas, filtra por
  // elas — protege de retornar disjuntor quando busca é pra DPS e vice-versa.
  const lista = categoriasAceitas && categoriasAceitas.length > 0
    ? listaSemLixo.filter((p: any) => categoriasAceitas.includes(String(p.categoria || '')))
    : listaSemLixo
  if (lista.length === 0) {
    if (listaBruta.length > 0 && listaSemLixo.length === 0) {
      return { ok: false, motivo: `referência '${termo}' bate ${listaBruta.length} produto(s), mas todos são capacitor/banco reativo — ignorados` }
    }
    if (listaSemLixo.length > 0 && lista.length === 0) {
      const cats = Array.from(new Set(listaSemLixo.map((p: any) => p.categoria).filter(Boolean)))
      return { ok: false, motivo: `referência '${termo}' bate ${listaSemLixo.length} produto(s) mas em categoria(s) errada(s): ${cats.join(', ')} — esperado ${categoriasAceitas?.join('/')}` }
    }
    return { ok: false, motivo: `referência '${termo}' não achada no /admin/catalogo` }
  }

  for (const p of lista) {
    const suf = p.ativo === false ? ' (inativo)' : ''
    const { data: precosV } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', p.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precosV || [])[0]?.preco_venda) || 0
    if (preco > 0) return { ok: true, modelo: `${p.modelo}${suf}`, preco }
  }
  for (const p of lista) {
    const suf = p.ativo === false ? ' (inativo)' : ''
    const { data: precosV } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', p.id)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precosV || [])[0]?.preco_venda) || 0
    if (preco > 0) return { ok: true, modelo: `${p.modelo}${suf} · ⚠ preço vencido`, preco }
  }
  return { ok: false, motivo: `referência '${termo}' achada (${lista.length}) mas sem preço em precos_produtos` }
}

/**
 * Kalebe 2026-09-02: busca produto por PALAVRA-CHAVE no modelo (ilike),
 * ignora a categoria — usado quando o cadastro está bagunçado (DPS caiu
 * em categoria='outro' etc). Aceita lista de sinônimos e um regex de
 * exclusão pra cortar homônimos indesejados.
 */
async function buscarProdutoPorNome(
  supabase: any,
  hojeIso: string,
  palavras: string[],
  excluir?: RegExp,
): Promise<{ ok: true; modelo: string; preco: number } | { ok: false; motivo: string }> {
  const orClause = palavras.map(p => `modelo.ilike.%${p}%`).join(',')
  const { data: prods } = await supabase
    .from('produtos')
    .select('id, modelo, categoria, ativo')
    .or(orClause)
    .order('ativo', { ascending: false })
    .limit(200)
  const lista = ((prods || []) as any[]).filter((p: any) => {
    if (!excluir) return true
    return !excluir.test(String(p.modelo || ''))
  })
  if (lista.length === 0) {
    return { ok: false, motivo: `nenhum produto cadastrado com "${palavras.join('/')}" no modelo` }
  }
  const cotacoes: Array<{ modelo: string; preco: number }> = []
  for (const p of lista) {
    const suf = p.ativo === false ? ' (inativo)' : ''
    const { data: precosV } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', p.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precosV || [])[0]?.preco_venda) || 0
    if (preco > 0) cotacoes.push({ modelo: `${p.modelo}${suf}`, preco })
  }
  if (cotacoes.length > 0) {
    const escolhida = cotacoes.reduce((a, b) => (a.preco >= b.preco ? a : b))
    return { ok: true, ...escolhida }
  }
  return { ok: false, motivo: `${lista.length} produto(s) com "${palavras.join('/')}" no modelo, mas sem preço vigente` }
}

export function fasesDoTipoLigacao(t: string): number {
  const s = String(t || '').toLowerCase()
  if (/tri/.test(s)) return 3
  if (/bi/.test(s)) return 2
  return 1
}

export function inferirFasesDoModelo(modelo: string): FaseInvKit {
  const m = String(modelo || '').toUpperCase()
  if (/^SIW100/.test(m)) return 'monofasico'
  if (/^SIW[45]0\d/.test(m)) return 'trifasico'
  if (/^SIW[123]0\d/.test(m)) return 'monofasico'
  return undefined
}

export function calcularInDisjuntor(potenciaKw: number, fases: 'monofasico' | 'bifasico' | 'trifasico'): { in_a: number; polos: number } {
  const tensao = fases === 'trifasico' ? 380 : 220
  const factor = fases === 'trifasico' ? Math.sqrt(3) : 1
  const correnteNominal = (potenciaKw * 1000) / (tensao * factor)
  const correnteProjeto = correnteNominal * 1.15
  const escala = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125]
  const in_a = escala.find(x => x >= correnteProjeto) || 125
  const polos = fases === 'monofasico' ? 1 : fases === 'bifasico' ? 2 : 3
  return { in_a, polos }
}

export async function buscarDisjuntorCompativel(
  supabase: any,
  inMinA: number,
  polos: number,
  hojeIso: string,
): Promise<{ ok: true; modelo: string; preco: number } | { ok: false; motivo: string }> {
  const REGEX_NAO_DISJUNTOR = /^(BC|TCP|BSMJ|CAP|BFR|BFC|BCF)/i
  const REGEX_DISJUNTOR_OK = /^(MDW|DWB|NF|S18|SDW|CBW|MPW)/i

  const { data: ativos } = await supabase
    .from('produtos')
    .select('id, modelo, specs, descricao_curta')
    .eq('categoria', 'disjuntor')
    .eq('ativo', true)
    .limit(500)
  let prods: any[] = (ativos || []) as any[]
  // Kalebe 2026-09-02: usa REGEX_LIXO_MODELO tb pra cortar CAPACITOR/KVAR/BANCO
  // que passe por qualquer motivo (nome sem prefixo mas com keyword).
  const prodsLimpos = prods.filter((p) => {
    const modelo = String(p.modelo || '')
    const desc = String(p.descricao_curta || '')
    if (REGEX_NAO_DISJUNTOR.test(modelo)) return false
    if (REGEX_LIXO_MODELO.test(modelo)) return false
    if (REGEX_LIXO_MODELO.test(desc)) return false
    return true
  })
  const prodsReais = prodsLimpos.filter((p) => REGEX_DISJUNTOR_OK.test(String(p.modelo || '')))
  prods = prodsReais.length > 0 ? prodsReais : prodsLimpos

  let usandoInativos = false
  if (prods.length === 0) {
    const { data: inat } = await supabase
      .from('produtos')
      .select('id, modelo, specs, descricao_curta')
      .eq('categoria', 'disjuntor')
      .eq('ativo', false)
      .limit(500)
    prods = ((inat || []) as any[]).filter((p) => {
      const modelo = String(p.modelo || '')
      const desc = String(p.descricao_curta || '')
      return !REGEX_NAO_DISJUNTOR.test(modelo)
          && !REGEX_LIXO_MODELO.test(modelo)
          && !REGEX_LIXO_MODELO.test(desc)
    })
    if (prods.length === 0) return { ok: false, motivo: 'nenhum disjuntor cadastrado' }
    usandoInativos = true
  }

  const todos = prods.map((p) => {
    const modelo = String(p.modelo || '')
    const specsCorrente = Number(p.specs?.corrente_nominal_a)
    const matchC = modelo.match(/C(\d+)/i)
    const corrente = Number.isFinite(specsCorrente) && specsCorrente > 0
      ? specsCorrente
      : (matchC ? Number(matchC[1]) : 0)
    const specsPolos = Number(p.specs?.polos)
    const polosProd = Number.isFinite(specsPolos) && specsPolos > 0
      ? specsPolos
      : (/3D|3P/i.test(modelo) ? 3 : /2D|2P/i.test(modelo) ? 2 : 1)
    return { produto: p, corrente, polos: polosProd }
  })

  const ideais = todos
    .filter((c) => c.polos === polos && c.corrente >= inMinA)
    .sort((a, b) => a.corrente - b.corrente)
  const soPolos = todos.filter((c) => c.polos === polos)
  const candidatos = ideais.length > 0 ? ideais : soPolos.length > 0 ? soPolos : todos
  const sufInat = usandoInativos ? ' (inativo)' : ''

  const cotacoes: Array<{ modelo: string; preco: number }> = []
  for (const { produto } of candidatos) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', produto.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco > 0) cotacoes.push({ modelo: `${produto.modelo}${sufInat}`, preco })
  }
  if (cotacoes.length > 0) {
    const escolhida = cotacoes.reduce((a, b) => (a.preco >= b.preco ? a : b))
    return { ok: true, ...escolhida }
  }
  const cotacoesVencidas: Array<{ modelo: string; preco: number }> = []
  for (const { produto } of candidatos) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', produto.id)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco > 0) cotacoesVencidas.push({ modelo: `${produto.modelo}${sufInat} · ⚠ preço vencido`, preco })
  }
  if (cotacoesVencidas.length > 0) {
    const escolhida = cotacoesVencidas.reduce((a, b) => (a.preco >= b.preco ? a : b))
    return { ok: true, ...escolhida }
  }
  const detalhe = `${prods.length} disjuntor(es) na categoria mas nenhum com preço em precos_produtos`
  return { ok: false, motivo: usandoInativos ? `só INATIVOS · ${detalhe}` : detalhe }
}
