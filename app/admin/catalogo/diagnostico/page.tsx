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

// Categorias essenciais consumidas pelo gerador de kits:
const CATEGORIAS_ESSENCIAIS: Array<{
  categoria: string
  label: string
  contemEsperado: string
  usadoEm: string
}> = [
  { categoria: 'placa',      label: '☀️ Placa fotovoltaica',   contemEsperado: 'JAM/canadian/trina', usadoEm: 'Kit — geração' },
  { categoria: 'inversor',   label: '⚡ Inversor',              contemEsperado: 'SIW/microinversor',  usadoEm: 'Kit — conversão' },
  { categoria: 'cabo_cc',    label: '🔌 Cabo CC (6mm²)',        contemEsperado: '6mm² preto/vermelho',usadoEm: 'Complementos WEG — cabo solar' },
  { categoria: 'cabo',       label: '🔌 Cabo (fallback CC)',    contemEsperado: '6mm²',               usadoEm: 'Complementos WEG — cabo solar (2ª opção)' },
  { categoria: 'estrutura',  label: '🏗 Estrutura de fixação',   contemEsperado: 'fibro/metal/cerâmico/laje', usadoEm: 'Complementos WEG — estrutura' },
  { categoria: 'conector',   label: '🔗 Conector',              contemEsperado: 'MC4',                usadoEm: 'Complementos WEG — MC4' },
  { categoria: 'disjuntor',  label: '🔒 Disjuntor',             contemEsperado: 'CA / DIN / Steck',   usadoEm: 'Complementos WEG — disjuntor CA' },
  { categoria: 'dps',        label: '⚡ DPS',                    contemEsperado: 'CA / classe II',    usadoEm: 'Complementos WEG — DPS CA' },
]

export default async function DiagnosticoCatalogoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const hojeIso = new Date().toISOString().slice(0, 10)

  const linhas = await Promise.all(CATEGORIAS_ESSENCIAIS.map(async (cat) => {
    const { count: totalAtivos } = await supabase.from('produtos')
      .select('id', { count: 'exact', head: true })
      .eq('categoria', cat.categoria).eq('ativo', true)
    const { count: totalInativos } = await supabase.from('produtos')
      .select('id', { count: 'exact', head: true })
      .eq('categoria', cat.categoria).eq('ativo', false)

    const { data: ativosComPreco } = await supabase.from('produtos')
      .select('id, precos_produtos!inner(preco_venda, vigente_ate)')
      .eq('categoria', cat.categoria).eq('ativo', true)
      .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`, { foreignTable: 'precos_produtos' })
      .limit(500)

    const comPrecoVigente = (ativosComPreco || []).filter((p: any) =>
      (p.precos_produtos || []).some((x: any) => Number(x.preco_venda) > 0)
    ).length

    return {
      ...cat,
      totalAtivos: totalAtivos || 0,
      totalInativos: totalInativos || 0,
      comPrecoVigente,
      status: (totalAtivos || 0) === 0
        ? 'sem_produtos'
        : comPrecoVigente === 0
        ? 'sem_preco'
        : 'ok',
    }
  }))

  const problemas = linhas.filter((l) => l.status !== 'ok').length

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
              ⚠ {problemas} categoria(s) com problema — orçamento vai mostrar &quot;não cadastrado&quot; nesses itens.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {linhas.map((l) => (
            <div key={l.categoria} className={`p-4 rounded-lg border ${
              l.status === 'ok' ? 'bg-verde/5 border-verde/30' :
              l.status === 'sem_preco' ? 'bg-sol/5 border-sol/30' :
              'bg-coral/10 border-coral/40'
            }`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <p className="font-bold text-white">{l.label}</p>
                  <p className="text-[10px] font-mono text-white/40 mt-0.5">
                    categoria = &quot;{l.categoria}&quot; · usado em: {l.usadoEm}
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
