import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Diagnóstico do catálogo — Kalebe 2026-09-01.
 *
 * Motivador: 5 complementos WEG (cabo solar, estrutura, MC4, disjuntor CA,
 * DPS CA) apareceram "não cadastrado no catálogo" na composição do orçamento.
 * Esta tela mostra, por categoria essencial, quantos produtos existem, quantos
 * têm preço vigente e onde está o gap.
 */

// Categorias essenciais consumidas pelo gerador de kits + demais tipos
// de sistema (BESS, VE, off-grid). Kalebe 2026-09-01.
const CATEGORIAS_ESSENCIAIS: Array<{
  categoria: string
  /** Se preenchido, filtra também por subcategoria (ex: híbrido dentro
   *  de 'inversor'). Sem isso, conta todos da categoria. */
  subcategoriaFiltro?: string
  label: string
  contemEsperado: string
  usadoEm: string
  grupo: 'ongrid' | 'bess' | 've' | 'offgrid' | 'ca'
}> = [
  // ==== ON-GRID ====
  { grupo: 'ongrid', categoria: 'placa',      label: '☀️ Placa fotovoltaica',   contemEsperado: 'JAM/canadian/trina', usadoEm: 'Kit — geração' },
  { grupo: 'ongrid', categoria: 'inversor',   label: '⚡ Inversor',              contemEsperado: 'SIW/microinversor',  usadoEm: 'Kit — conversão' },
  { grupo: 'ongrid', categoria: 'cabo_cc',    label: '🔌 Cabo CC (6mm²)',        contemEsperado: '6mm² preto/vermelho',usadoEm: 'Complementos — cabo solar' },
  { grupo: 'ongrid', categoria: 'cabo',       label: '🔌 Cabo (fallback CC)',    contemEsperado: '6mm²',               usadoEm: 'Complementos — cabo solar (2ª opção)' },
  { grupo: 'ongrid', categoria: 'estrutura',  label: '🏗 Estrutura de fixação',   contemEsperado: 'fibro/metal/cerâmico/laje', usadoEm: 'Complementos — estrutura' },
  { grupo: 'ongrid', categoria: 'conector',   label: '🔗 Conector',              contemEsperado: 'MC4',                usadoEm: 'Complementos — MC4' },
  { grupo: 'ongrid', categoria: 'disjuntor',  label: '🔒 Disjuntor',             contemEsperado: 'CA / DIN / Steck',   usadoEm: 'Complementos — disjuntor CA' },
  { grupo: 'ongrid', categoria: 'dps',        label: '⚡ DPS',                    contemEsperado: 'CA / classe II',    usadoEm: 'Complementos — DPS CA' },

  // ==== BESS (bateria + híbrido) ====
  // Kalebe 2026-09-01: alinhado com o que o parser da planilha WEG cria.
  { grupo: 'bess', categoria: 'bateria',        label: '🔋 Bateria',             contemEsperado: 'SBW / SBCW / SBSW',        usadoEm: 'Sistema híbrido / BESS' },
  { grupo: 'bess', categoria: 'inversor',   subcategoriaFiltro: 'inversor_hibrido', label: '🌗 Inversor híbrido', contemEsperado: 'SIW400H / SIW700H', usadoEm: 'Sistema híbrido (mestre)' },
  { grupo: 'bess', categoria: 'monitoramento', subcategoriaFiltro: 'controlador', label: '🎛 EMBOX / Controlador',  contemEsperado: 'EMBOX WEG',                usadoEm: 'Paralelismo + despacho híbrido' },
  { grupo: 'bess', categoria: 'smart_meter', label: '📊 Medidor de energia', contemEsperado: 'DTSU666 / DDSU666 / MMW03', usadoEm: 'Anti-injeção + monitoramento' },

  // ==== OFF-GRID ====
  { grupo: 'offgrid', categoria: 'inversor', subcategoriaFiltro: 'inversor_offgrid', label: '🏝 Inversor off-grid', contemEsperado: 'Standalone / SIW300G-off', usadoEm: 'Off-grid puro (sem rede)' },

  // ==== VE (mobilidade) ====
  { grupo: 've', categoria: 'outro',      subcategoriaFiltro: 've_wallbox', label: '⚡🚗 Wallbox (carregador VE)', contemEsperado: 'WEMOB / 7.4/11/22 kW', usadoEm: 'Fluxo ve_recarga' },

  // ==== LISTA CA ====
  { grupo: 'ca', categoria: 'cabo_ca',      label: '🔌 Cabo CA (fase/neutro/terra)', contemEsperado: 'HEPR 10mm² / 6mm² verde', usadoEm: 'Lista CA — cabos' },
  { grupo: 'ca', categoria: 'eletroduto',   label: '🔩 Eletroduto',                  contemEsperado: 'PVC 1" / rígido',         usadoEm: 'Lista CA — condução' },
  { grupo: 'ca', categoria: 'caixa_passagem', label: '📦 Caixa de passagem',         contemEsperado: 'PVC 100×100',             usadoEm: 'Lista CA — junções' },
  { grupo: 'ca', categoria: 'abracadeira',  label: '🔗 Abraçadeira',                 contemEsperado: 'Tipo D / nylon UV',       usadoEm: 'Lista CA — fixação' },
]

const GRUPO_LABEL: Record<string, string> = {
  ongrid: '☀️ On-grid (obrigatórios do kit FV)',
  bess: '🔋 BESS e Híbrido',
  offgrid: '🏝 Off-grid',
  ve: '🚗 Recarga VE',
  ca: '🔌 Lista CA (materiais tributáveis)',
}

export default async function DiagnosticoCatalogoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const hojeIso = new Date().toISOString().slice(0, 10)

  // Kalebe 2026-09-01: 'puxe todas no diagnóstico'. Puxa TODAS as
  // categorias distintas que existem no banco, não só as essenciais.
  const { data: todosProdutos } = await supabase
    .from('produtos')
    .select('categoria, subcategoria, ativo, sob_cotacao, id, precos_produtos(preco_venda, vigente_ate)')
    .limit(5000)

  // Kalebe 2026-09-01: sob_cotacao é comportamento esperado — WEG traz
  // vários SKUs sem preço (câmeras, sensores, wallbox WEMOB) pra cotar
  // caso a caso. Excluir do diagnóstico.
  const produtosFiltrados = (todosProdutos || []).filter((p: any) => !p.sob_cotacao)

  // Agrupa por categoria — conta ativos, inativos, com preço vigente.
  // Kalebe 2026-09-01: também agrupa por (categoria, subcategoria) pra
  // essenciais que filtram por subcat (ex: inversor_hibrido dentro de 'inversor').
  const porCategoria = new Map<string, {
    totalAtivos: number; totalInativos: number; comPrecoVigente: number
  }>()
  const porCatSubcat = new Map<string, {
    totalAtivos: number; totalInativos: number; comPrecoVigente: number
  }>()
  ;(produtosFiltrados).forEach((p: any) => {
    const cat = p.categoria || '(sem categoria)'
    const sub = p.subcategoria || ''
    const chaveCat = cat
    const chaveCatSub = `${cat}::${sub}`
    for (const chave of [chaveCat, chaveCatSub]) {
      const map = chave === chaveCat ? porCategoria : porCatSubcat
      if (!map.has(chave)) map.set(chave, { totalAtivos: 0, totalInativos: 0, comPrecoVigente: 0 })
      const bucket = map.get(chave)!
      if (p.ativo) bucket.totalAtivos++
      else bucket.totalInativos++
      if (p.ativo && (p.precos_produtos || []).some((x: any) =>
        Number(x.preco_venda) > 0 && (!x.vigente_ate || x.vigente_ate >= hojeIso))) {
        bucket.comPrecoVigente++
      }
    }
  })

  // Enriquece com metadados das essenciais + fabrica linhas pras "outras"
  const mapaEssenciais = new Map(CATEGORIAS_ESSENCIAIS.map((c) => [c.categoria, c]))
  const categoriasSeen = new Set<string>()
  const linhasEssenciais = CATEGORIAS_ESSENCIAIS.map((cat) => {
    // Se a essencial tem subcategoriaFiltro, marca cat como "vista" só se
    // não tem outra essencial que use a categoria sem subcat.
    if (!cat.subcategoriaFiltro) categoriasSeen.add(cat.categoria)
    const b = cat.subcategoriaFiltro
      ? (porCatSubcat.get(`${cat.categoria}::${cat.subcategoriaFiltro}`) || { totalAtivos: 0, totalInativos: 0, comPrecoVigente: 0 })
      : (porCategoria.get(cat.categoria) || { totalAtivos: 0, totalInativos: 0, comPrecoVigente: 0 })
    return {
      ...cat,
      ...b,
      status: b.totalAtivos === 0 ? 'sem_produtos'
        : b.comPrecoVigente === 0 ? 'sem_preco' : 'ok',
    } as any
  })
  const linhasOutras = Array.from(porCategoria.entries())
    .filter(([cat]) => !categoriasSeen.has(cat))
    .map(([categoria, b]) => ({
      categoria,
      label: `📦 ${categoria}`,
      contemEsperado: '(categoria fora dos essenciais)',
      usadoEm: 'Não consumido diretamente pelo gerador — verifique reclassificação',
      grupo: 'outras' as any,
      ...b,
      status: b.totalAtivos === 0 ? 'sem_produtos'
        : b.comPrecoVigente === 0 ? 'sem_preco' : 'ok',
    }))
    .sort((a, b) => (b.totalAtivos - a.totalAtivos))

  const linhas = [...linhasEssenciais, ...linhasOutras]
  const problemas = linhasEssenciais.filter((l) => l.status !== 'ok').length

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/catalogo" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Catálogo
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            🔎 Diagnóstico do catálogo
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Categorias essenciais consumidas pelo gerador de kits e composição de orçamentos.
          </p>
        </header>

        {problemas > 0 && (
          <div className="mb-6 p-4 bg-coral/10 border border-coral/40 rounded-xl">
            <p className="text-sm font-bold text-coral">
              ⚠ {problemas} categoria(s) essencial(is) com problema — orçamento vai mostrar &quot;não cadastrado&quot; nesses itens.
            </p>
          </div>
        )}

        {/* Agrupa por 'grupo' (ongrid, bess, offgrid, ve, ca, outras). */}
        {['ongrid', 'bess', 'offgrid', 've', 'ca', 'outras'].map((grupo) => {
          const doGrupo = linhas.filter((l: any) => l.grupo === grupo)
          if (doGrupo.length === 0) return null
          const titulo = grupo === 'outras'
            ? `📦 Outras categorias cadastradas (${doGrupo.length})`
            : GRUPO_LABEL[grupo] || grupo
          return (
            <section key={grupo} className="mb-6">
              <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-2">
                {titulo}
              </h2>
              <div className="space-y-2">
                {doGrupo.map((l: any) => (
            <div key={l.categoria} className={`p-4 rounded-lg border ${
              l.status === 'ok' ? 'bg-verde/5 border-verde/30' :
              l.status === 'sem_preco' ? 'bg-sol/5 border-sol/30' :
              'bg-coral/10 border-coral/40'
            }`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <p className="font-bold text-white">{l.label}</p>
                  <p className="text-[10px] font-mono text-white/40 mt-0.5">
                    categoria = &quot;{l.categoria}&quot;
                    {l.subcategoriaFiltro && <> · subcategoria = &quot;{l.subcategoriaFiltro}&quot;</>}
                    {' '}· usado em: {l.usadoEm}
                  </p>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    Esperado: {l.contemEsperado}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-white/40">Ativos</p>
                    <p className={`font-bold text-lg ${l.totalAtivos > 0 ? 'text-verde' : 'text-coral'}`}>
                      {l.totalAtivos}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-white/40">C/ preço</p>
                    <p className={`font-bold text-lg ${l.comPrecoVigente > 0 ? 'text-verde' : 'text-coral'}`}>
                      {l.comPrecoVigente}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-white/40">Inativos</p>
                    <p className="font-bold text-lg text-white/60">{l.totalInativos}</p>
                  </div>
                </div>
              </div>
              {l.status !== 'ok' && (
                <p className="mt-2 text-[11px] text-coral">
                  {l.status === 'sem_produtos'
                    ? `Nenhum produto ATIVO em "${l.categoria}". Cadastre em /admin/catalogo ou reclassifique produtos existentes.`
                    : `Produtos existem mas nenhum tem preço vigente. Edite pelo /admin/catalogo e informe R$ pra ativar.`}
                </p>
              )}
              <div className="mt-2 flex gap-3 text-[10px]">
                <Link href={`/admin/catalogo?categoria=${l.categoria}`}
                  className="text-sol hover:underline">
                  → Ver no catálogo
                </Link>
                {l.status === 'sem_produtos' && (
                  <Link href="/admin/catalogo/pente-fino"
                    className="text-sol hover:underline">
                    → Pente fino (reclassificar em massa)
                  </Link>
                )}
              </div>
            </div>
                ))}
              </div>
            </section>
          )
        })}

        <div className="mt-6 p-4 bg-white/[0.03] border border-white/10 rounded text-xs text-white/60 space-y-1">
          <p><strong className="text-white">Como usar:</strong></p>
          <p>1. Ative APIs com ⚠ vermelho ou amarelo antes de gerar orçamentos que dependem desses itens.</p>
          <p>2. Categorias marcadas em vermelho zeram a linha na composição do kit (aparece &quot;não cadastrado no catálogo&quot;).</p>
          <p>3. Se um produto existe com nome parecido mas em outra categoria (ex: cabo solar 6mm² classificado como &quot;cabo&quot; em vez de &quot;cabo_cc&quot;), use o Pente Fino pra reclassificar.</p>
        </div>
      </div>
    </main>
  )
}
