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
    // Kalebe 2026-09-02: fallback quando datasheet ainda não foi cadastrado
    // em specs. Usa inferência por linha SIW (SIW100=1, 200/300/400=2, 500=3).
    const mppt = Number.isFinite(mpptSpec) && mpptSpec > 0
      ? mpptSpec
      : inferirMpptDoModelo(inv.modelo)
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
  // Kalebe 2026-10-14: só 'cabo_cc' — 'cabo' não existe no enum de categoria e
  // derrubava a consulta inteira (caía no cabo CA 3×4 mm²)
  let cabo = await buscarProdutoComPreco(supabase, hojeIso, {
    categorias: ['cabo_cc'],
    contem: ['6mm'],
    estrito: true,
  })
  if (!cabo.ok) {
    cabo = await buscarProdutoComPreco(supabase, hojeIso, {
      categorias: ['cabo_ca'],
      contem: ['6mm', 'solar'],
      estrito: true,
    })
  }
  if (!cabo.ok) {
    cabo = await buscarProdutoComPreco(supabase, hojeIso, {
      categorias: ['cabo_ca'],
      contem: ['6mm'],
      estrito: true,
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

  // 2. Estrutura — Kalebe 2026-10-14: kit do tipo de telhado (metálico não
  // pega Fibrometálico; acessório avulso não conta como kit), nº de módulos
  // lido do nome ("3 módulos em retrato" = 3) e cota o MAIOR custo total
  // (kits × preço), não o maior preço unitário.
  const tel = filtroEstruturaDoTelhado(entrada.tipo_telhado)
  const naoConterEstrut = [...tel.naoConter, 'acessorio', ...(ehMicroinversor ? [] : ['microinversor'])]
  const custoTotalKit = (c: { modelo: string; preco: number }) => Math.ceil(entrada.qtd_placas / modulosDoKit(c.modelo)) * c.preco
  let estrutura: BuscaResult = { ok: false, motivo: `${tel.rotulo}: cotar à parte (inclua em itens extras)` }
  if (!tel.cotarAParte) {
    const tentativas = [
      ...(ehMicroinversor && tel.contem.length ? [[...tel.contem, 'microinversor']] : []),
      [...tel.contem, 'kit'],
      tel.contem,
    ]
    for (const contem of tentativas) {
      estrutura = await buscarProdutoComPreco(supabase, hojeIso, {
        categorias: ['estrutura'], contem, naoConter: naoConterEstrut,
        pegarMaiorPreco: true, estrito: contem.length > 0, pontuar: custoTotalKit,
      })
      if (estrutura.ok) break
    }
  }
  const modulosPorKit = estrutura.ok ? modulosDoKit(estrutura.modelo) : 4
  const qtdKitsEstrutura = Math.ceil(entrada.qtd_placas / modulosPorKit)
  itens.push({
    categoria: 'estrutura',
    modelo: estrutura.ok
      ? `${estrutura.modelo} · ${entrada.qtd_placas} módulos ÷ ${modulosPorKit}`
      : `Estrutura ${tel.rotulo} · ${entrada.qtd_placas} módulos · ⚠ ${tel.cotarAParte ? 'cotar à parte' : 'não cadastrado'}`,
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
    // Kalebe 2026-09-02: resolverFasesInversor lê da descrição de tensão
    // ("Inversor Monofásico 220 V") quando specs.fases está NULL — cobre
    // o cadastro atual da planilha WEG.
    const tensaoDesc = inv.id ? specsInversores[inv.id]?.tensao_desc : undefined
    const fases: FaseInvKit = resolverFasesInversor(
      { fases: inv.fases, modelo: inv.modelo, tensao_desc: tensaoDesc },
      entrada.tipo_ligacao_cliente,
    )
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
      if (porRef.ok) {
        // Kalebe 2026-09-02: sanity check da REF do projetista antes de aceitar.
        // Extrai polos e corrente do MODELO retornado (ex: 'DWB160B125-3DF' → 125A, 3P).
        // Se polos ≠ calculado OU corrente > 2× calculado, rejeita a ref e
        // deixa cair no dimensionamento por corrente. Fecha o buraco de
        // cadastros errados (planilha WEG traz disjuntor tri em ref de
        // inversor mono, ex: SIW200G M050 5kW → DWB160B125-3DF).
        const modeloDisj = String(porRef.modelo || '')
        const matchPolos = modeloDisj.match(/(\d)[DP](?!\w)/i)
        const polosRef = matchPolos ? Number(matchPolos[1]) : NaN
        const matchC = modeloDisj.match(/C(\d+)/i) || modeloDisj.match(/B(\d+)/i) || modeloDisj.match(/(\d{2,3})A?/)
        const correnteRef = matchC ? Number(matchC[1]) : NaN
        const polosBatem = !Number.isFinite(polosRef) || polosRef === g.polos
        const correnteRazoavel = !Number.isFinite(correnteRef) || correnteRef <= g.in_a * 2
        if (polosBatem && correnteRazoavel) {
          disj = { ...porRef, modelo: `${porRef.modelo} · ref. projetista` }
        } else {
          avisos.push(
            `Ref. projetista '${g.ref}' (${modeloDisj}) INCOERENTE — ` +
            `${polosBatem ? '' : `polos ${polosRef} ≠ ${g.polos} esperado; `}` +
            `${correnteRazoavel ? '' : `corrente ${correnteRef}A >> ${g.in_a}A calculado; `}` +
            `caiu no cálculo por corrente. Corrija specs.disjuntor_equivalente em /admin/catalogo do inversor ${g.modeloInv}.`
          )
        }
      }
    }
    if (!disj || !disj.ok) {
      disj = await buscarDisjuntorCompativel(supabase, g.in_a, g.polos, hojeIso)
    }
    const rotulo = g.ref && disj?.ok && disj.modelo.includes('ref. projetista')
      ? `Disjuntor ${g.ref} (ref. projetista)`
      : `Disjuntor ${g.in_a}A ${g.polos}P`
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
        const porRef = await buscarProdutoPorRef(supabase, ref, hojeIso, ['dps'])
        if (porRef.ok) { dps = { ...porRef, modelo: `${porRef.modelo} · ref. projetista` }; break }
      }
    }
    if (!dps || !dps.ok) {
      // Kalebe 2026-09-06 (3ª rodada): DPS CA usa modelo básico (275V 20kA
      // pra 220V, 380V pra tri). NÃO cobrar pelo mais caro — o DPS de 1100V
      // é CC solar (custa R$ 5.685) e não faz sentido em projeto residencial
      // normal (R$ 90). Filtra fora modelos "1100V", "600V" e "50kA/200kA"
      // (esses são CC ou casos especiais).
      dps = await buscarProdutoComPreco(supabase, hojeIso, {
        categorias: ['dps'],
        naoConter: ['1100V', '1100Vca', '600V', '600Vcc', '50kA/200kA', '50ka200ka'],
        pegarMaiorPreco: false,  // menor preço com preço válido
      })
    }
    // Kalebe 2026-09-06 (2ª rodada de reforço): busca AMPLA por palavra-chave.
    // Cobre TODAS as variações de nome comercial que aparecem em cadastro
    // desnormalizado: DPS, SPD, clamper, protetor de surto, supressor,
    // surge, "classe II". Depois busca também na descrição_curta.
    if (!dps || !dps.ok) {
      dps = await buscarProdutoPorNome(
        supabase, hojeIso,
        ['dps', 'clamper', 'spd', 'protetor', 'surto', 'surge', 'supressor'],
        /kvar|capacit|reativ|contator|rele|fusivel|fusível/i,
      )
    }
    // Última chance: busca por 'classe ii' na DESCRIÇÃO (não só modelo)
    if (!dps || !dps.ok) {
      dps = await buscarProdutoPorDescricao(
        supabase, hojeIso,
        ['classe ii', 'surto', '20ka', '40ka', 'ii 20', 'ii 40'],
        /kvar|capacit|reativ/i,
      )
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

/**
 * Tipo de telhado (perfil do Spinzap ou seção de telhado do projeto) → filtro
 * do kit de estrutura no catálogo WEG. Solo e carport não têm kit por
 * quantidade de placas: ficam pra cotar à parte (itens extras).
 */
export function filtroEstruturaDoTelhado(tipoTelhado: string | null | undefined): {
  contem: string[]; naoConter: string[]; rotulo: string; cotarAParte: boolean
} {
  const t = String(tipoTelhado || '').toLowerCase()
  if (/fibro/.test(t)) return { contem: ['fibro'], naoConter: [], rotulo: 'fibrocimento', cotarAParte: false }
  if (/metal|zinco|alumin|trapez|onda|zipad/.test(t)) return { contem: ['metal'], naoConter: ['fibro'], rotulo: 'metálico', cotarAParte: false }
  if (/ceram|barro|colonial|frances/.test(t)) return { contem: ['ceram'], naoConter: [], rotulo: 'cerâmico', cotarAParte: false }
  if (/laje|concreto/.test(t)) return { contem: ['laje'], naoConter: [], rotulo: 'laje', cotarAParte: false }
  if (/solo/.test(t)) return { contem: [], naoConter: [], rotulo: 'de solo', cotarAParte: true }
  if (/carport/.test(t)) return { contem: [], naoConter: [], rotulo: 'carport', cotarAParte: true }
  return { contem: [], naoConter: [], rotulo: 'genérica', cotarAParte: false }
}

/** Módulos por kit, lido do nome ("kit p/ 4 módulos", "3 módulos em retrato"); sem número = 4. */
export function modulosDoKit(modelo: string): number {
  return Number((String(modelo || '').match(/(\d+)\s*m[oó]dulos?/i) || [])[1]) || 4
}

type BuscaResult =
  | { ok: true; id: string; modelo: string; preco: number }
  | { ok: false; motivo: string }

async function buscarProdutoComPreco(
  supabase: any,
  hojeIso: string,
  filtro: {
    categorias: string[]
    contem?: string[]
    /** Kalebe 2026-09-06: exclui candidatos que contêm essas strings no
     *  modelo/descrição. Usado pra descartar variantes de "topo" que não
     *  fazem sentido no contexto (ex: DPS 1100V CC quando busca é CA). */
    naoConter?: string[]
    pegarMaiorPreco?: boolean
    /** Sem nenhum produto com TODOS os termos de `contem`, falha (não cai na categoria inteira) */
    estrito?: boolean
    /** Nota de cada cotação pra escolher o maior/menor (padrão: o preço unitário) */
    pontuar?: (c: { modelo: string; preco: number }) => number
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

  // Kalebe 2026-10-14: tira o acento antes (senão "Cerâmico" virava "cermico" e não batia com "ceram")
  const normalizar = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  // Kalebe 2026-09-06: primeiro corta o LIXO (naoConter) — DPS 1100V é CC,
  // não faz sentido pra dimensionamento CA por exemplo.
  const semLixo = lista.filter((p: any) => {
    if (!filtro.naoConter || filtro.naoConter.length === 0) return true
    const alvo = normalizar(`${p.modelo || ''} ${p.subcategoria || ''} ${p.descricao_curta || ''}`)
    return !filtro.naoConter.some((k) => alvo.includes(normalizar(k)))
  })
  const preferidos = semLixo.filter((p: any) => {
    const alvo = normalizar(`${p.modelo || ''} ${p.subcategoria || ''} ${p.descricao_curta || ''}`)
    return !filtro.contem || filtro.contem.every((k) => alvo.includes(normalizar(k)))
  })
  if (filtro.estrito && filtro.contem?.length && preferidos.length === 0) {
    return { ok: false, motivo: `nenhum produto "${filtro.contem.join(' + ')}" na categoria ${filtro.categorias.join('/')}` }
  }
  const candidatos = preferidos.length > 0 ? preferidos : semLixo.length > 0 ? semLixo : lista

  // Preços de todos os candidatos de uma vez (em lotes): o vigente mais
  // recente de cada um e, na falta dele, o último (vencido).
  const vigente = new Map<string, number>()
  const ultimo = new Map<string, number>()
  const ids = candidatos.map((c: any) => c.id as string)
  for (let i = 0; i < ids.length; i += 100) {
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('produto_id, preco_venda, vigente_de, vigente_ate')
      .in('produto_id', ids.slice(i, i + 100))
      .order('vigente_de', { ascending: false })
    for (const r of (precos || []) as any[]) {
      const preco = Number(r.preco_venda) || 0
      if (!ultimo.has(r.produto_id)) ultimo.set(r.produto_id, preco)
      if (!vigente.has(r.produto_id) && (!r.vigente_ate || r.vigente_ate >= hojeIso)) vigente.set(r.produto_id, preco)
    }
  }
  // Kalebe 2026-09-06: pegarMaiorPreco true = MAIOR (estrutura, margem seg),
  // false = MENOR (DPS/disjuntor — dimensionamento já garante margem).
  const nota = (c: { modelo: string; preco: number }) => (filtro.pontuar ? filtro.pontuar(c) : c.preco)
  const escolher = (cs: Array<{ id: string; modelo: string; preco: number }>) => filtro.pegarMaiorPreco
    ? cs.reduce((a, b) => (nota(a) >= nota(b) ? a : b))
    : cs.reduce((a, b) => (nota(a) <= nota(b) ? a : b))
  const sufInat = usandoInativos ? ' (inativo)' : ''

  const cotacoes = candidatos
    .map((p: any) => ({ id: p.id as string, modelo: `${p.modelo}${sufInat}`, preco: vigente.get(p.id) || 0 }))
    .filter((c) => c.preco > 0)
  if (cotacoes.length > 0) return { ok: true, ...escolher(cotacoes) }

  // Fallback: qualquer preço, mesmo vencido
  const cotacoesVencidas = candidatos
    .map((p: any) => ({ id: p.id as string, modelo: `${p.modelo}${sufInat} · ⚠ preço vencido`, preco: ultimo.get(p.id) || 0 }))
    .filter((c) => c.preco > 0)
  if (cotacoesVencidas.length > 0) return { ok: true, ...escolher(cotacoesVencidas) }

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
  // Kalebe 2026-09-02: rejeita termo curto/só numérico. Cadastro da
  // planilha WEG salvou disjuntor_equivalente como "2", "3", "12" —
  // números soltos matcham QUALQUER produto que contenha esse dígito
  // no modelo/código (ex: '2' → 'DWB160B125-3DF' porque tem '125'/'2').
  // Ref válida precisa ter ≥ 4 chars e conter pelo menos 1 letra.
  if (termo.length < 4 || !/[a-z]/i.test(termo)) {
    return { ok: false, motivo: `referência '${termo}' inválida (curta ou só numérica) — ignorada` }
  }
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

/**
 * Kalebe 2026-09-06: última chance de encontrar produto — busca por
 * PALAVRAS-CHAVE na DESCRICAO_CURTA (não só modelo). Cadastro da
 * planilha WEG costuma ter descrição completa mas modelo curto/só código.
 * Ex: DPS pode ter modelo "CLPU-C40/1275" mas descrição "Protetor de
 * Surto DPS Classe II 20kA". Sem esse fallback, a busca por 'dps'/'spd'
 * no modelo passa direto.
 */
async function buscarProdutoPorDescricao(
  supabase: any,
  hojeIso: string,
  palavras: string[],
  excluir?: RegExp,
): Promise<{ ok: true; modelo: string; preco: number } | { ok: false; motivo: string }> {
  const orClause = palavras.map(p => `descricao_curta.ilike.%${p}%`).join(',')
  const { data: prods } = await supabase
    .from('produtos')
    .select('id, modelo, descricao_curta, categoria, ativo')
    .or(orClause)
    .eq('ativo', true)
    .limit(200)
  const lista = ((prods || []) as any[]).filter((p: any) => {
    const alvo = `${p.modelo || ''} ${p.descricao_curta || ''}`
    if (excluir && excluir.test(alvo)) return false
    return true
  })
  if (lista.length === 0) {
    return { ok: false, motivo: `nenhum produto ativo com "${palavras.join('/')}" na descrição` }
  }
  const cotacoes: Array<{ modelo: string; preco: number }> = []
  for (const p of lista) {
    const { data: precosV } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', p.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precosV || [])[0]?.preco_venda) || 0
    if (preco > 0) cotacoes.push({ modelo: p.modelo, preco })
  }
  if (cotacoes.length > 0) {
    // Escolhe o de menor preço — nesse fallback estamos raspando o barril,
    // não faz sentido cobrar o mais caro sem certeza de match ideal.
    const escolhida = cotacoes.reduce((a, b) => (a.preco <= b.preco ? a : b))
    return { ok: true, modelo: `${escolhida.modelo} · via descrição`, preco: escolhida.preco }
  }
  return { ok: false, motivo: `${lista.length} produto(s) com "${palavras.join('/')}" na descrição, mas sem preço vigente` }
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

/**
 * Kalebe 2026-09-02: infere fases de MÚLTIPLAS fontes em ordem de
 * prioridade. Cadastro da planilha WEG deixou specs.fases NULL em
 * quase todos os inversores — precisamos deduzir da descrição, do
 * modelo, e como último recurso do padrão do cliente.
 */
export function resolverFasesInversor(
  inv: { fases?: FaseInvKit; modelo: string; tensao_desc?: string },
  tipoLigacaoCliente?: string,
): FaseInvKit {
  if (inv.fases) return inv.fases
  const desc = String(inv.tensao_desc || '').toLowerCase()
  if (/trif[aá]sic/.test(desc)) return 'trifasico'
  if (/bif[aá]sic/.test(desc)) return 'bifasico'
  if (/monof[aá]sic/.test(desc)) return 'monofasico'
  const pelaLinha = inferirFasesDoModelo(inv.modelo)
  if (pelaLinha) return pelaLinha
  const cli = String(tipoLigacaoCliente || '').toLowerCase()
  if (/tri/.test(cli)) return 'trifasico'
  if (/bi/.test(cli)) return 'bifasico'
  return 'monofasico'
}

/**
 * MPPT default por linha SIW quando specs.entradas_mppt é NULL.
 * Baseado no datasheet WEG mais comum de cada família.
 */
export function inferirMpptDoModelo(modelo: string): number {
  const m = String(modelo || '').toUpperCase()
  if (/^SIW100/.test(m)) return 1  // microinversor
  if (/^SIW200/.test(m)) return 2  // string mono pequeno
  if (/^SIW300/.test(m)) return 2  // string mono maior
  if (/^SIW400/.test(m)) return 2  // string tri pequeno
  if (/^SIW500/.test(m)) return 3  // string tri maior
  if (/^SIW[67]00/.test(m)) return 4  // string tri alto
  return 1
}

export function calcularInDisjuntor(potenciaKw: number, fases: 'monofasico' | 'bifasico' | 'trifasico'): { in_a: number; polos: number } {
  const tensao = fases === 'trifasico' ? 380 : 220
  const factor = fases === 'trifasico' ? Math.sqrt(3) : 1
  const correnteNominal = (potenciaKw * 1000) / (tensao * factor)
  const correnteProjeto = correnteNominal * 1.15
  const escala = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125]
  const in_a = escala.find(x => x >= correnteProjeto) || 125
  // Kalebe 2026-09-02: monofásico CA na CELESC usa disjuntor BIPOLAR
  // (F+N), não unipolar. Cadastro Spin segue: MDWP-C32-2 é o correto
  // pra 5 kW mono. Antes eu retornava 1 → não matchava nada → caía no
  // fallback DWB160B100-3 (tri 100A).
  //   mono → 2 (F+N)
  //   bi   → 2 (F+F)
  //   tri  → 3 (3F sem neutro na proteção)
  const polos = fases === 'trifasico' ? 3 : 2
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
    // Kalebe 2026-09-02: extrator robusto — cobre WEG mini (MDW-C32-1),
    // caixa moldada (DWB160B100-3, DWB250B250-3, NF125), Siemens (5SL62..).
    // 1º tenta C\d+ (MDW), 2º B\d+ (DWB), 3º só número entre 8-2000 no modelo.
    const matchCorrente =
      modelo.match(/C(\d+)/i) ||
      modelo.match(/B(\d{2,4})/i) ||
      modelo.match(/(?:^|[^0-9])(\d{2,4})(?:[^0-9]|$)/)
    const corrente = Number.isFinite(specsCorrente) && specsCorrente > 0
      ? specsCorrente
      : (matchCorrente ? Number(matchCorrente[1]) : 0)
    const specsPolos = Number(p.specs?.polos)
    // Regex de polos ampliada: pega '-3' / '-3D' / '-3P' / '-3DF' / '3I' etc
    // no fim do modelo (padrão DWB160B100-3 tem apenas '-3').
    const polosProd = Number.isFinite(specsPolos) && specsPolos > 0
      ? specsPolos
      : (/[\-\s](3[A-Z]*)$|3[DPI]|TRI/i.test(modelo) ? 3
         : /[\-\s](2[A-Z]*)$|2[DPI]|BI/i.test(modelo) ? 2
         : 1)
    return { produto: p, corrente, polos: polosProd }
  })

  const ideais = todos
    .filter((c) => c.polos === polos && c.corrente >= inMinA)
    .sort((a, b) => a.corrente - b.corrente)
  const soPolos = todos.filter((c) => c.polos === polos)
  // Kalebe 2026-09-02: só cai no fallback "qualquer disjuntor" quando
  // ninguém com polos certos. Antes pegava DWB160B100-3 (100A tri) pra
  // dimensionamento 32A mono — completamente errado. Se o polos certos
  // existir mas com corrente muito acima (>3×), ainda usa (melhor 100A
  // sobrando que zerar), MAS registra em modelo indicando "sobredim".
  const candidatos = ideais.length > 0 ? ideais : soPolos.length > 0 ? soPolos : todos
  const sobredimensionado = ideais.length === 0 && soPolos.length > 0
    && soPolos[0].corrente > inMinA * 3
  const sufInat = usandoInativos ? ' (inativo)' : ''

  const cotacoes: Array<{ modelo: string; preco: number; corrente: number }> = []
  for (const c of candidatos) {
    const produto = c.produto
    const { data: precos } = await supabase
      .from('precos_produtos')
      .select('preco_venda, vigente_de, vigente_ate')
      .eq('produto_id', produto.id)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      .order('vigente_de', { ascending: false })
      .limit(1)
    const preco = Number((precos || [])[0]?.preco_venda) || 0
    if (preco > 0) {
      const sufSobre = sobredimensionado ? ` · ⚠ sobredim (cadastro só tem ${c.corrente}A)` : ''
      cotacoes.push({ modelo: `${produto.modelo}${sufInat}${sufSobre}`, preco, corrente: c.corrente })
    }
  }
  if (cotacoes.length > 0) {
    // Kalebe 2026-09-02: SEMPRE o de MENOR corrente com preço válido.
    // O dimensionamento por corrente (I × 1,15 → escala IEC) já garante
    // margem de segurança — pegar disjuntor de maior corrente ainda é
    // sobredim desnecessário. Ex: 5 kW mono calculado 32A não deve
    // virar MDWH-C100-2. A escolha por "maior preço" (lógica antiga)
    // era herança da estrutura de telhado, onde a Spin queria cotar
    // pelo pior caso — em disjuntor não faz sentido.
    const escolhida = cotacoes.reduce((a, b) => (a.corrente <= b.corrente ? a : b))
    return { ok: true, modelo: escolhida.modelo, preco: escolhida.preco }
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
