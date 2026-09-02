import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Kalebe 2026-09-02: Auditoria de campos essenciais do catálogo.
 * Aponta cada produto com dado técnico faltando pra o pipeline de
 * dimensionamento não precisar "inferir". Inferência é fallback, o
 * cadastro correto vem do DATASHEET.
 */
export default async function AuditoriaCatalogoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, modelo, categoria, subcategoria, specs, codigo_weg, ativo')
    .eq('ativo', true)
    .order('categoria').order('modelo')

  const problemas: Array<{
    id: string; modelo: string; categoria: string; codigo_weg: string | null
    faltando: string[]
  }> = []

  for (const p of (produtos || [])) {
    const s: any = p.specs || {}
    const gaps: string[] = []

    switch (p.categoria) {
      case 'inversor':
        if (!s.potencia_kw || Number(s.potencia_kw) <= 0) gaps.push('potencia_kw')
        if (!s.fases) gaps.push('fases')
        if (!s.entradas_mppt) gaps.push('entradas_mppt')
        if (!s.tensao_desc && !s.tensao_nominal) gaps.push('tensao_desc')
        if (!p.subcategoria) gaps.push('subcategoria (string/micro/híbrido)')
        break
      case 'placa_fv':
        if (!s.potencia_wp || Number(s.potencia_wp) <= 0) gaps.push('potencia_wp')
        break
      case 'disjuntor':
        if (!s.corrente_nominal_a || Number(s.corrente_nominal_a) <= 0) {
          // Aceita se o modelo tem padrão MDW-C\d+ / DWB\d+B\d+ etc
          const mod = String(p.modelo || '')
          if (!/C(\d+)|B(\d{2,4})/i.test(mod)) gaps.push('corrente_nominal_a')
        }
        if (!s.polos || Number(s.polos) <= 0) {
          const mod = String(p.modelo || '')
          if (!/[\-\s](\d)[A-Z]*$/.test(mod)) gaps.push('polos')
        }
        break
      case 'cabo_cc':
      case 'cabo_ca':
      case 'cabo':
        if (!s.bitola_mm2 && !/\d+\s*mm/i.test(String(p.modelo || ''))) gaps.push('bitola_mm2')
        break
      case 'dps':
        if (!s.corrente_nominal_a && !s.corrente_max_ka) gaps.push('corrente_nominal_a ou corrente_max_ka')
        break
      case 'estrutura':
        if (!/\d+\s*m[oó]dulos/i.test(String(p.modelo || '')) && !s.modulos_por_kit) {
          gaps.push('modulos_por_kit')
        }
        break
    }

    if (gaps.length > 0) {
      problemas.push({
        id: p.id, modelo: p.modelo, categoria: p.categoria,
        codigo_weg: p.codigo_weg, faltando: gaps,
      })
    }
  }

  const totalAtivos = (produtos || []).length
  const totalProblemas = problemas.length
  const porCategoria = problemas.reduce((acc: Record<string, number>, p) => {
    acc[p.categoria] = (acc[p.categoria] || 0) + 1
    return acc
  }, {})

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/catalogo" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Catálogo
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Auditoria de cadastro
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Campos técnicos que faltam pra o dimensionamento não depender de inferência.
            O sistema tenta rodar com fallback, mas o cadastro correto vem do datasheet.
          </p>
        </header>

        {/* Resumo */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Metric label="Produtos ativos" value={String(totalAtivos)} />
          <Metric label="Com gaps" value={String(totalProblemas)}
            highlight={totalProblemas > 0 ? 'coral' : 'verde'} />
          <Metric label="% completos"
            value={totalAtivos > 0 ? `${Math.round((1 - totalProblemas/totalAtivos)*100)}%` : '—'} />
          <Metric label="Categorias afetadas"
            value={String(Object.keys(porCategoria).length)} />
        </section>

        {/* Breakdown por categoria */}
        {totalProblemas > 0 && (
          <section className="mb-8 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-2">
              Gaps por categoria
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
                <span key={cat} className="text-xs px-2 py-1 bg-coral/10 text-coral border border-coral/20 rounded">
                  {cat}: {n}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Lista detalhada */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          {totalProblemas === 0 ? (
            <div className="p-12 text-center">
              <p className="text-5xl mb-3">✅</p>
              <p className="text-white font-bold text-lg">Catálogo 100% completo</p>
              <p className="text-white/60 text-sm mt-1">Todos os produtos ativos têm os campos técnicos essenciais.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/10">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Categoria</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Modelo</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Código WEG</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-coral font-bold">Faltando</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Editar</th>
                </tr>
              </thead>
              <tbody>
                {problemas.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-white/60 text-xs">{p.categoria}</td>
                    <td className="px-4 py-2.5 text-white text-sm">{p.modelo}</td>
                    <td className="px-4 py-2.5 text-white/50 text-xs font-mono">{p.codigo_weg || '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {p.faltando.map((f, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-coral/10 text-coral border border-coral/20 rounded font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/admin/catalogo?edit=${p.id}`}
                        className="text-xs text-sol hover:underline">
                        ✏ abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-[11px] text-white/40 mt-6">
          O pipeline de dimensionamento tem fallback pros campos faltantes (infere fases pela linha SIW, MPPT pela família etc), mas o valor correto vem sempre do datasheet do fabricante.
        </p>
      </div>
    </main>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: 'coral' | 'verde' }) {
  const color = highlight === 'coral' ? 'text-coral' : highlight === 'verde' ? 'text-verde' : 'text-white'
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-lg">
      <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  )
}
