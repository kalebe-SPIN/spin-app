import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Diagnóstico rápido do catálogo — mostra pra CADA categoria WEG usada
 * na precificação:
 *   - qtos produtos ativos existem
 *   - qtos com preço vigente
 *   - qtos INATIVOS
 *   - qtos SEM preço em precos_produtos
 *   - amostra dos 5 primeiros modelos
 *
 * Kalebe usa isso quando o /orcamento zera algum complemento WEG,
 * pra saber se o problema é falta de cadastro, falta de preço ou
 * produto desativado.
 */
export default async function DiagnosticoCatalogoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') notFound()

  const hojeIso = new Date().toISOString().slice(0, 10)

  // Categorias que a precificação do kit puxa
  const CATEGORIAS = [
    { chave: 'cabo_cc',    label: 'Cabo solar CC',     dica: "Precisa de cabo 6mm² (modelo com '6mm' no nome ajuda)" },
    { chave: 'estrutura',  label: 'Estrutura telhado', dica: "Precisa de kits com 'fibro'/'metal'/'ceram'/'laje' no nome pra bater com o telhado" },
    { chave: 'conector',   label: 'Conector MC4',      dica: "Precisa de conector com 'MC4' no nome" },
    { chave: 'disjuntor',  label: 'Disjuntor CA',      dica: "Precisa de disjuntores com specs.corrente_nominal_a + specs.polos (ou modelo 'C25-3D')" },
    { chave: 'dps',        label: 'DPS CA',            dica: "Qualquer produto ativo na categoria serve (MPW/SPW/DPW WEG)" },
  ]

  const relatorio: Array<{
    chave: string
    label: string
    dica: string
    total: number
    ativos: number
    inativos: number
    comPrecoVigente: number
    semPreco: number
    amostra: Array<{ modelo: string; ativo: boolean; temPreco: boolean; preco?: number }>
  }> = []

  for (const cat of CATEGORIAS) {
    const { data: prods } = await supabase
      .from('produtos')
      .select('id, modelo, ativo')
      .eq('categoria', cat.chave)
      .limit(500)
    const lista = (prods || []) as any[]

    // Busca preços vigentes de todos os produtos em batch
    const ids = lista.map(p => p.id)
    let precosVigentes: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: precosRows } = await supabase
        .from('precos_produtos')
        .select('produto_id, preco_venda, vigente_ate')
        .in('produto_id', ids)
        .or(`vigente_ate.is.null,vigente_ate.gte.${hojeIso}`)
      for (const p of (precosRows || [])) {
        const preco = Number(p.preco_venda) || 0
        if (preco > 0 && !precosVigentes[p.produto_id]) {
          precosVigentes[p.produto_id] = preco
        }
      }
    }

    const ativos = lista.filter(p => p.ativo).length
    const inativos = lista.filter(p => !p.ativo).length
    const comPrecoVigente = lista.filter(p => precosVigentes[p.id]).length
    const semPreco = lista.filter(p => !precosVigentes[p.id]).length

    const amostra = lista.slice(0, 6).map(p => ({
      modelo: p.modelo || '(sem modelo)',
      ativo: !!p.ativo,
      temPreco: !!precosVigentes[p.id],
      preco: precosVigentes[p.id],
    }))

    relatorio.push({
      chave: cat.chave, label: cat.label, dica: cat.dica,
      total: lista.length, ativos, inativos, comPrecoVigente, semPreco, amostra,
    })
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-1">
            Diagnóstico do catálogo WEG
          </h1>
          <p className="text-sm text-white/60">
            Situação de cada categoria usada pela precificação do kit. Use pra achar o que falta cadastrar quando um item zera no orçamento.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4">
          {relatorio.map((r) => {
            const okPreco = r.comPrecoVigente > 0
            const ehProblema = !okPreco
            return (
              <section
                key={r.chave}
                className={`p-5 rounded-xl border ${ehProblema ? 'bg-coral/5 border-coral/40' : 'bg-verde/5 border-verde/30'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className={`text-base font-bold ${ehProblema ? 'text-coral' : 'text-verde'}`}>
                      {ehProblema ? '❌' : '✅'} {r.label}
                      <span className="text-xs text-white/40 ml-2">categoria: <code className="text-white/60">{r.chave}</code></span>
                    </h2>
                    <p className="text-[11px] text-white/50 mt-1">{r.dica}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center min-w-[240px]">
                    <MetricaMini label="Total" value={r.total} destaque="branca" />
                    <MetricaMini label="Ativos" value={r.ativos} destaque="verde" />
                    <MetricaMini label="Com preço" value={r.comPrecoVigente} destaque={r.comPrecoVigente > 0 ? 'verde' : 'coral'} />
                    <MetricaMini label="Sem preço" value={r.semPreco} destaque={r.semPreco > 0 ? 'coral' : 'branca'} />
                  </div>
                </div>

                {r.total === 0 ? (
                  <p className="text-xs text-coral/90">
                    ⚠ Nenhum produto cadastrado nesta categoria. Vá em <Link href="/admin/catalogo" className="underline">/admin/catalogo</Link> e cadastre pelo menos 1 produto com categoria = <code>{r.chave}</code>.
                  </p>
                ) : r.comPrecoVigente === 0 ? (
                  <div className="text-xs text-coral/90 space-y-2">
                    <p>
                      ⚠ Existem <strong>{r.total} produto(s)</strong> mas <strong>NENHUM</strong> tem preço vigente cadastrado.
                      Precisa lançar preço em <code>precos_produtos</code>.
                    </p>
                    {r.inativos > 0 && (
                      <p>
                        Além disso, <strong>{r.inativos} produto(s) estão INATIVOS</strong> — ative no /admin/catalogo se ainda vender.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-verde">
                    ✓ Categoria pronta pra ser usada. {r.comPrecoVigente} produto(s) com preço vigente.
                  </p>
                )}

                {/* Amostra */}
                {r.amostra.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-[11px] text-white/50 cursor-pointer hover:text-white/70">
                      Ver amostra dos primeiros {r.amostra.length} produtos
                    </summary>
                    <table className="w-full text-xs mt-2">
                      <thead className="text-[10px] uppercase text-white/40">
                        <tr>
                          <th className="text-left py-1 px-2 font-normal">Modelo</th>
                          <th className="text-center py-1 px-2 font-normal">Ativo</th>
                          <th className="text-center py-1 px-2 font-normal">Preço vigente</th>
                          <th className="text-right py-1 px-2 font-normal">R$</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/70">
                        {r.amostra.map((a, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-2">{a.modelo}</td>
                            <td className="py-1.5 px-2 text-center">{a.ativo ? '✅' : '❌'}</td>
                            <td className="py-1.5 px-2 text-center">{a.temPreco ? '✅' : '❌'}</td>
                            <td className="py-1.5 px-2 text-right">{a.preco ? `R$ ${a.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </section>
            )
          })}
        </div>

        <div className="mt-6 p-4 bg-white/[0.02] border border-white/10 rounded-lg text-xs text-white/60 space-y-2">
          <p className="font-bold text-white">Como resolver categoria em vermelho</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>0 produtos:</strong> importe/cadastre no <Link href="/admin/catalogo" className="text-sol underline">/admin/catalogo</Link> — a migration 078 reclassifica pelas palavras do modelo se estiver rodada.</li>
            <li><strong>0 com preço:</strong> abra cada produto e adicione um preço vigente (campo <code>precos_produtos.preco_venda</code>).</li>
            <li><strong>Só inativos:</strong> reative no /admin/catalogo (checkbox "Ativo").</li>
          </ul>
        </div>
      </div>
    </main>
  )
}

function MetricaMini({ label, value, destaque }: { label: string; value: number; destaque: 'verde' | 'coral' | 'branca' }) {
  const cor = destaque === 'verde' ? 'text-verde' : destaque === 'coral' ? 'text-coral' : 'text-white'
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-2">
      <p className="text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-lg font-bold ${cor}`}>{value}</p>
    </div>
  )
}
